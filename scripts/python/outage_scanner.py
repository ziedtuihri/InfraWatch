import os
import socket
import joblib
import psycopg2
from datetime import datetime
import psutil

# --- CONFIGURATION ---
MODEL_PATH = os.getenv("CLUSTER_OUTAGE_MODEL_PATH", "/opt/ML/models/cluster_outage_model.pkl")
TARGET_USER_ID = int(os.getenv("TARGET_USER_ID", "1"))  # Default user ID to assign notifications to

# Load trained outage prediction model
model = joblib.load(MODEL_PATH)

SELECTED_FEATURES = ['CPU_Usage_Pct', 'Memory_Usage_Pct']

def get_cluster_telemetry():
    """Collects current system CPU and Memory usage percentages for monitoring."""
    try:
        cpu_usage = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        memory_usage = memory.percent
        return {
            'CPU_Usage_Pct': float(cpu_usage),
            'Memory_Usage_Pct': float(memory_usage)
        }
    except Exception as e:
        print(f"[!] Failed to collect cluster telemetry: {e}")
        return None

def log_notification_to_db(vm_name, ip_address, cpu_pct, mem_pct, prediction):
    """Inserts a critical datacenter outage alert directly into the notifications table."""
    try:
        conn = psycopg2.connect(
            dbname=os.getenv("DB_NAME", "infrawatch"),
            user=os.getenv("DB_USER", "infra"),
            password=os.getenv("DB_PASSWORD", "postgres"),
            host=os.getenv("DB_HOST", "192.168.100.77"),
            port=os.getenv("DB_PORT", "5432")
        )
        cursor = conn.cursor()
        
        query = """
            INSERT INTO notifications (
                user_id, type, severity, title, message, resource_name, source_type, is_read, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        
        title = "Datacenter Cluster Outage Warning"
        message = f"Critical outage risk detected on host {vm_name} ({ip_address}) | CPU: {cpu_pct}%, Memory: {mem_pct}% | Prediction: {prediction}"
        
        cursor.execute(query, (
            TARGET_USER_ID,
            'cluster_outage',
            'critical',
            title,
            message,
            vm_name,
            'datacenter_monitoring',
            False,
            datetime.now()
        ))
        
        conn.commit()
        cursor.close()
        conn.close()
        print("[*] Outage notification successfully logged to database.")
    except Exception as e:
        print(f"[!] Failed to log notification to database: {e}")

def monitor_cluster():
    """Evaluates current cluster telemetry against the ML model and triggers alerts."""
    vm_name = socket.gethostname()
    try:
        ip_address = socket.gethostbyname(vm_name)
    except Exception:
        ip_address = "127.0.0.1"

    print(f"[*] Starting datacenter outage check on host: {vm_name}")

    features = get_cluster_telemetry()
    if features is None:
        return
        
    # Prepare feature vector matching model expectations
    X_sample = [[features[f] for f in SELECTED_FEATURES]]
    
    prediction = model.predict(X_sample)[0]
    
    print(f"[*] Telemetry Read -> CPU: {features['CPU_Usage_Pct']}% | Memory: {features['Memory_Usage_Pct']}% | Model Verdict: {prediction}")

    # Action if outage is predicted (1, true, or 'outage')
    if str(prediction).lower() in ['1', 'true', 'outage']:
        print(f"[!] CRITICAL OUTAGE RISK DETECTED ON HOST: {vm_name}")
        log_notification_to_db(vm_name, ip_address, features['CPU_Usage_Pct'], features['Memory_Usage_Pct'], str(prediction))

    print("[*] Datacenter monitoring check completed successfully.")

if __name__ == "__main__":
    monitor_cluster()