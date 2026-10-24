"""Load the trained outage model and score live VM telemetry."""

import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import joblib
import pandas as pd

MODEL_FEATURES = ("CPU_Usage_Pct", "Memory_Usage_Pct")


class OutageModelUnavailable(RuntimeError):
    """Raised when the exported model is missing or incompatible."""


def _model_path() -> Path:
    default_path = (
        Path(__file__).resolve().parents[3]
        / "MLOps_InfraWatch-"
        / "models"
        / "cluster_outage_model.pkl"
    )
    return Path(os.getenv("CLUSTER_OUTAGE_MODEL_PATH", str(default_path)))


def load_outage_model() -> Any:
    model_path = _model_path()
    if not model_path.is_file():
        raise OutageModelUnavailable(
            "Outage model artifact is missing. Train it with Monitor_Cluster.py "
            "or set CLUSTER_OUTAGE_MODEL_PATH to the exported artifact."
        )

    model = joblib.load(model_path)
    feature_names = getattr(model, "feature_names_in_", None)
    classes = getattr(model, "classes_", ())
    if (
        feature_names is None
        or tuple(feature_names) != MODEL_FEATURES
        or 1 not in classes
        or not callable(getattr(model, "predict_proba", None))
    ):
        raise OutageModelUnavailable(
            "Outage model artifact must expose CPU_Usage_Pct and "
            "Memory_Usage_Pct features and outage probabilities. Retrain it "
            "with Monitor_Cluster.py."
        )
    return model


def analyze_vm_outages(
    vm_metrics: List[Dict[str, Any]], model: Any
) -> Dict[str, Any]:
    """Score running VMs and mark non-running VMs as outages."""
    running_vms = []
    model_inputs = []
    for vm in vm_metrics:
        status = str(vm.get("status") or "unknown").lower()
        if status != "running":
            continue

        features = []
        for field in ("cpu_percent", "memory_percent"):
            try:
                value = float(vm[field])
            except (KeyError, TypeError, ValueError) as exc:
                raise ValueError(
                    f"VM {vm.get('name', '<unnamed>')} has invalid {field} telemetry"
                ) from exc
            if not math.isfinite(value):
                raise ValueError(
                    f"VM {vm.get('name', '<unnamed>')} has non-finite {field} telemetry"
                )
            features.append(value)

        running_vms.append(vm)
        model_inputs.append(features)

    scores = {}
    if model_inputs:
        probabilities = model.predict_proba(
            pd.DataFrame(model_inputs, columns=MODEL_FEATURES)
        )
        if len(probabilities) != len(running_vms):
            raise ValueError("Outage model returned an unexpected number of predictions")
        outage_index = list(model.classes_).index(1)
        for vm, prediction in zip(running_vms, probabilities):
            probability = float(prediction[outage_index])
            if not math.isfinite(probability) or not 0 <= probability <= 1:
                raise ValueError(
                    f"Outage model returned an invalid probability for {vm.get('name', '<unnamed>')}"
                )
            scores[id(vm)] = round(probability * 100, 2)

    scored_vms = []
    for vm in vm_metrics:
        status = str(vm.get("status") or "unknown").lower()
        scored_vms.append(
            {
                **vm,
                "outage_probability_pct": (
                    scores[id(vm)] if status == "running" else 100.0
                ),
            }
        )

    return {
        "model": "Random Forest (CPU and memory)",
        "score_basis": "Model probability for running VMs; non-running VMs are 100%.",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "vms": scored_vms,
    }
