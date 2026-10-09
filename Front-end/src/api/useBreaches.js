/**
 * useBreaches
 * -----------
 * Compares live resource metrics (cpu, mem, disk) against the user's
 * enabled threshold config and returns synthetic breach alerts.
 * These are merged into AlertsPage alongside real Morpheus alerts.
 */

// Map threshold row ids to which metric field on activeRes to read
const METRIC_MAP = {
  cpu:  r => r?.cpu  ?? 0,
  cpu2: r => r?.cpu  ?? 0,
  disk: r => r?.disk ?? 0,
  mem:  r => r?.mem  ?? 0,
  net:  r => r?.net  ?? null,   // not always available
}

/**
 * Given a resource object and saved threshold rows, return breach alerts.
 * Returns [] when no thresholds are enabled or no metrics are available.
 */
export function computeBreaches(activeRes, thresholds) {
  if (!activeRes || !thresholds?.length) return []

  return thresholds
    .filter(t => t.enabled)
    .reduce((acc, t) => {
      const getVal = METRIC_MAP[t.id]
      if (!getVal) return acc
      const current = getVal(activeRes)
      if (current === null) return acc          // metric not available
      if (current < t.val) return acc           // below threshold — OK

      acc.push({
        // Stable per-metric id (not tied to the current value/severity).
        // An earlier fix folded t.val/t.sev into this id so that editing a
        // threshold wouldn't silently inherit an old acknowledgement — but
        // that meant every small slider nudge during testing produced a
        // brand new row with no ack history, which looked like "acknowledged
        // by keeps disappearing." The actual fix for "editing a threshold
        // should not inherit a stale ack" now lives in clear_threshold_acks
        // (called from upsert_threshold_config on every Save) instead of
        // baking config into the id — so dragging a slider through several
        // values during one test session stays one continuous alert
        // identity, while an explicit Save still correctly resets the ack.
        id:       `breach-${t.id}-${activeRes.id}`,
        name:     `${t.label} at ${current}${t.unit} (threshold ${t.val}${t.unit})`,
        resource: activeRes.name,
        env:      activeRes.cloud || activeRes.env || '—',
        sev:      t.sev,
        rawSev:   t.sev,
        firedAgo: 'now',
        source:   `Threshold breach · InfraWatch`,
        status:   'active',
        canFix:   false,
        isBreach: true,           // flag so UI can style differently
        thresholdMatch: t,
      })
      return acc
    }, [])
}
