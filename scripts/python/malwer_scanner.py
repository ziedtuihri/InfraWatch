import os
import math
import hashlib
import joblib
import socket
import psycopg2
from datetime import datetime

# --- CONFIGURATION ---
MODEL_PATH = os.getenv("MODEL_PATH", "/opt/malware_scanner/models/malware_detection_model_selected_features.pkl")
SCALER_PATH = os.getenv("SCALER_PATH", "/opt/malware_scanner/models/scaler_selected_features.pkl")
TARGET_USER_ID = int(os.getenv("TARGET_USER_ID", "1"))  # Default user ID to assign notifications to

# Load trained model and scaler
model = joblib.load(MODEL_PATH)
scaler = joblib.load(SCALER_PATH)

SELECTED_FEATURES = ['usage_counter', 'fs_excl_counter', 'task_size', 'end_data', 'policy', 'nivcsw']

def calculate_entropy(file_path):
    """Calculates file entropy for ransomware and obfuscation detection."""
    try:
        with open(file_path, 'rb') as f:
            byte_arr = list(f.read())
            file_size = len(byte_arr)
            if file_size == 0:
                return 0
            freq_list = [0] * 256
            for b in byte_arr:
                freq_list[b] += 1
            freq_list = [float(x) / file_size for x in freq_list]
            entropy = -sum([p * math.log(p, 2) for p in freq_list if p > 0])
            return entropy
    except Exception:
        return 0

def extract_file_features(file_path):
    """Extracts required numerical features matching the trained model."""
    try:
        file_size = os.path.getsize(file_path)
        file_entropy = calculate_entropy(file_path)
        file_extension = os.path.splitext(file_path)[1]
        is_exe = 1 if file_extension == '.exe' else 0
        last_accessed = os.path.getatime(file_path)
        last_modified = os.path.getmtime(file_path)
        created = os.path.getctime(file_path)

        return {
            'usage_counter': file_size,
            'fs_excl_counter': file_entropy,
            'task_size': is_exe,
            'end_data': last_accessed,
            'policy': last_modified,
            'nivcsw': created
        }
    except Exception:
        return None

def log_notification_to_db(vm_name, ip_address, file_path, prediction):
    """Inserts a critical security alert directly into the notifications table."""
    try:
        conn = psycopg2.connect(
            dbname=os.getenv("DB_NAME", "malware_db"),
            user=os.getenv("DB_USER", "postgres"),
            password=os.getenv("DB_PASSWORD", "password"),
            host=os.getenv("DB_HOST", "localhost"),
            port=os.getenv("DB_PORT", "5432")
        )
        cursor = conn.cursor()
        
        query = """
            INSERT INTO notifications (
                user_id, type, severity, title, message, resource_name, source_type, is_read, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        
        title = "Malware Detected on VM"
        message = f"Suspicious file flagged as '{prediction}' on host {vm_name} ({ip_address}) at path: {file_path}"
        
        cursor.execute(query, (
            TARGET_USER_ID,
            'malware_scan',
            'critical',
            title,
            message,
            vm_name,
            'malware_analysis',
            False,
            datetime.now()
        ))
        
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"[!] Failed to log notification to database: {e}")

def scan_repository(target_dir):
    """Walks through directories, evaluates files, and flags threats."""
    vm_name = socket.gethostname()
    try:
        ip_address = socket.gethostbyname(vm_name)
    except Exception:
        ip_address = "192.168.100.77"
    
    # Exclude system directories to optimize scan performance and prevent false positives
    excluded_dirs = ('/proc', '/sys', '/dev', '/boot', '/etc', '/lib', '/bin', '/sbin')

    print(f"[*] Starting malware scan on target directory: {target_dir}")

    for root, dirs, files in os.walk(target_dir):
        if any(root.startswith(exc) for exc in excluded_dirs):
            continue
            
        for file in files:
            file_path = os.path.join(root, file)
            if not os.path.isfile(file_path):
                continue
                
            features = extract_file_features(file_path)
            if features is None:
                continue
                
            # Prepare feature vector and scale
            X_sample = [[features[f] for f in SELECTED_FEATURES]]
            X_scaled = scaler.transform(X_sample)
            
            prediction = model.predict(X_scaled)[0]
            
            # Action if malicious prediction is returned
            if str(prediction).lower() in ['malware', '1', 'true']:
                print(f"[!] THREAT DETECTED: {file_path}")
                log_notification_to_db(vm_name, ip_address, file_path, str(prediction))

    print("[*] Malware scan completed successfully.")

if __name__ == "__main__":
    target = os.getenv("SCAN_TARGET_DIR", "/app")
    scan_repository(target)