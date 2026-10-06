import os
import sys
import json
import pickle
import subprocess

def install_package(package):
    print(f"[Package] Installing missing package: {package}...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", package])

# Ensure required libraries are installed
try:
    import kagglehub
except ImportError:
    install_package("kagglehub")
    import kagglehub

try:
    import pandas as pd
except ImportError:
    install_package("pandas")
    import pandas as pd

try:
    import sklearn
except ImportError:
    install_package("scikit-learn")

from sklearn.ensemble import RandomForestClassifier
import numpy as np

def clean_symptom(name):
    if not name or not isinstance(name, str):
        return ""
    # Strip spaces, replace underscores with spaces, and convert to title case
    return name.replace('_', ' ').strip().title()

def train_symptom_model():
    print("[Train] Starting Kaggle Dataset Download for Symptom-Disease mappings...")
    try:
        # Download latest version
        dataset_path = kagglehub.dataset_download("itachi9604/disease-symptom-description-dataset")
        print("Path to dataset files:", dataset_path)
    except Exception as e:
        print("[Error] Failed to download Kaggle dataset:", str(e))
        print("Falling back to synthetic training.")
        return False

    dataset_file = os.path.join(dataset_path, "dataset.csv")
    if not os.path.exists(dataset_file):
        print(f"[Error] Could not find dataset.csv inside downloaded path: {dataset_file}")
        return False

    print("[File] Reading dataset.csv...")
    df = pd.read_csv(dataset_file)
    
    print("[Process] Preprocessing symptom columns...")
    # Symptoms columns are Symptom_1 to Symptom_17
    symptom_cols = [col for col in df.columns if col.startswith('Symptom_')]
    
    # 1. Collect all unique clean symptoms
    unique_symptoms = set()
    for col in symptom_cols:
        unique_symptoms.update(df[col].dropna().apply(clean_symptom))
    
    # Remove empty strings if any
    unique_symptoms.discard("")
    symptoms_list = sorted(list(unique_symptoms))
    print(f"Found {len(symptoms_list)} unique symptoms in dataset.")

    # 2. Build multi-hot vectors for training
    X = []
    y = []

    for index, row in df.iterrows():
        disease = row['Disease'].strip()
        # Create multi-hot vector for current sample
        vector = np.zeros(len(symptoms_list), dtype=int)
        
        for col in symptom_cols:
            raw_val = row[col]
            if pd.notna(raw_val):
                clean_val = clean_symptom(raw_val)
                if clean_val in symptoms_list:
                    symptom_idx = symptoms_list.index(clean_val)
                    vector[symptom_idx] = 1
                    
        X.append(vector)
        y.append(disease)

    X = np.array(X)
    y = np.array(y)

    print(f"Dataset compiled. Input shape: {X.shape}, Target shape: {y.shape}")

    # 3. Fit Random Forest Classifier
    print("[Fit] Training Random Forest Classifier on Kaggle data...")
    clf = RandomForestClassifier(n_estimators=50, random_state=42)
    clf.fit(X, y)
    print("[OK] Model fitting complete.")

    # 4. Save model and metadata artifacts
    ml_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(ml_dir, "disease_model.pkl")
    symptoms_json_path = os.path.join(ml_dir, "symptoms_list.json")
    diseases_json_path = os.path.join(ml_dir, "diseases_list.json")

    print(f"[Save] Saving model to {model_path}...")
    with open(model_path, 'wb') as f:
        pickle.dump(clf, f)

    print(f"[Save] Saving symptoms list to {symptoms_json_path}...")
    with open(symptoms_json_path, 'w') as f:
        json.dump(symptoms_list, f, indent=2)

    # Save target diseases list as helper
    diseases_list = sorted(list(set(y)))
    print(f"[Save] Saving diseases list ({len(diseases_list)} classes) to {diseases_json_path}...")
    with open(diseases_json_path, 'w') as f:
        json.dump(diseases_list, f, indent=2)

    print("[Success] Model training pipeline finished successfully!")
    return True

def train_heart_disease_model():
    print("[Train] Starting Kaggle Dataset Download for Heart Disease dataset...")
    try:
        dataset_path = kagglehub.dataset_download("johnsmith88/heart-disease-dataset")
        print("Path to dataset files:", dataset_path)
    except Exception as e:
        print("[Error] Failed to download Kaggle heart disease dataset:", str(e))
        return False

    csv_files = [f for f in os.listdir(dataset_path) if f.endswith('.csv')]
    if not csv_files:
        print(f"[Error] Could not find any CSV files in {dataset_path}")
        return False
    
    csv_file_path = os.path.join(dataset_path, csv_files[0])
    print(f"[File] Reading {csv_file_path}...")
    df = pd.read_csv(csv_file_path)
    
    if 'target' not in df.columns:
        print("[Error] 'target' column not found in heart disease dataset.")
        return False
        
    feature_cols = ['age', 'sex', 'cp', 'trestbps', 'chol', 'fbs', 'restecg', 'thalach', 'exang', 'oldpeak', 'slope', 'ca', 'thal']
    missing_cols = [col for col in feature_cols if col not in df.columns]
    if missing_cols:
        print(f"[Error] Missing columns in dataset: {missing_cols}")
        return False
        
    X = df[feature_cols]
    y = df['target']
    
    print(f"Heart Disease dataset compiled. Shape: {X.shape}")
    
    print("[Fit] Training Random Forest Classifier on Heart Disease data...")
    clf = RandomForestClassifier(n_estimators=100, random_state=42)
    clf.fit(X, y)
    print("[OK] Heart Disease model fitting complete.")
    
    ml_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(ml_dir, "heart_disease_model.pkl")
    
    print(f"[Save] Saving heart disease model to {model_path}...")
    with open(model_path, 'wb') as f:
        pickle.dump(clf, f)
        
    print("[Success] Heart Disease model training finished successfully!")
    return True

if __name__ == "__main__":
    print("=== Training Disease Symptom Model ===")
    train_symptom_model()
    print("\n=== Training Heart Disease Model ===")
    train_heart_disease_model()

