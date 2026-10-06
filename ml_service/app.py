import os
import pickle
import json
import base64
import numpy as np
import random
from io import BytesIO
from flask import Flask, request, jsonify
from PIL import Image, ImageDraw

# Import DL/ML libraries
import tensorflow as tf
try:
    import tf_keras as keras
except ImportError:
    import keras

layers = keras.layers
models = keras.models

app = Flask(__name__)

# --- HARDCODED SYNTHETIC FALLBACK LISTS ---
FALLBACK_SYMPTOMS = [
    "Fever", "Cough", "Headache", "Chest Pain", "Breathlessness",
    "Stomach Ache", "Skin Rash", "Dizziness", "Vomiting", "Injury"
]

FALLBACK_DISEASES = [
    "Influenza (Flu)", "Food Poisoning", "Migraine", "Heart Attack",
    "Heat Stroke", "Common Cold"
]

# --- INJURY CLASSES ---
INJURY_CLASSES = ["burn", "cut", "deep wound", "bruise", "fracture", "skin rash", "infection", "normal skin"]

# Global references
disease_clf = None
symptoms_list = []
injury_model = None
is_real_model_loaded = False
heart_clf = None
is_real_heart_model_loaded = False

# Setup folder paths
ML_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(ML_DIR, "disease_model.pkl")
SYMPTOMS_PATH = os.path.join(ML_DIR, "symptoms_list.json")
HEART_MODEL_PATH = os.path.join(ML_DIR, "heart_disease_model.pkl")

def init_models():
    global disease_clf, symptoms_list, injury_model, is_real_model_loaded
    global heart_clf, is_real_heart_model_loaded
    print("[ML] Initializing Machine Learning Models...")

    # Load heart disease model
    if os.path.exists(HEART_MODEL_PATH):
        try:
            print("[Load] Loading trained Kaggle heart disease prediction model...")
            with open(HEART_MODEL_PATH, 'rb') as f:
                heart_clf = pickle.load(f)
            is_real_heart_model_loaded = True
            print("[OK] Loaded real heart disease risk classifier.")
        except Exception as e:
            print("[Warning] Failed to load heart disease model, resetting to synthetic fallback.", str(e))
            is_real_heart_model_loaded = False

    if not is_real_heart_model_loaded:
        print("[Train] Training Random Forest Classifier on synthetic heart disease data...")
        X_heart = np.random.randint(50, 100, size=(100, 13))
        y_heart = np.array([1 if x[2] > 75 or x[7] > 80 else 0 for x in X_heart])
        from sklearn.ensemble import RandomForestClassifier
        heart_clf = RandomForestClassifier(n_estimators=10, random_state=42)
        heart_clf.fit(X_heart, y_heart)
        print("[OK] Fallback synthetic heart disease classifier successfully trained in-memory.")

    # 1. Attempt to load the trained Kaggle model
    if os.path.exists(MODEL_PATH) and os.path.exists(SYMPTOMS_PATH):
        try:
            print("[Load] Loading trained Kaggle disease prediction model...")
            with open(MODEL_PATH, 'rb') as f:
                disease_clf = pickle.load(f)
            
            with open(SYMPTOMS_PATH, 'r') as f:
                symptoms_list = json.load(f)
            
            is_real_model_loaded = True
            print(f"[OK] Loaded real classifier with {len(symptoms_list)} symptom features.")
        except Exception as e:
            print("[Warning] Failed to load Kaggle model, resetting to synthetic fallback.", str(e))
            is_real_model_loaded = False

    # 2. Synthetic Fallback if no real model is found
    if not is_real_model_loaded:
        print("[Train] Training Random Forest Classifier on synthetic symptoms...")
        symptoms_list = FALLBACK_SYMPTOMS
        
        X_train = []
        y_train = []
        for _ in range(30):
            X_train.append([1, 1, 1, 0, 0, 0, 0, 0, 0, 0])
            y_train.append(0) # Influenza (Flu)
            X_train.append([1, 0, 0, 0, 0, 1, 0, 0, 1, 0])
            y_train.append(1) # Food Poisoning
            X_train.append([0, 0, 1, 0, 0, 0, 0, 1, 0, 0])
            y_train.append(2) # Migraine
            X_train.append([0, 0, 0, 1, 1, 0, 0, 0, 1, 0])
            y_train.append(3) # Heart Attack
            X_train.append([1, 0, 1, 0, 0, 0, 0, 1, 0, 0])
            y_train.append(4) # Heat Stroke
            X_train.append([0, 1, 1, 0, 0, 0, 0, 0, 0, 0])
            y_train.append(5) # Common Cold

        X_train = np.array(X_train)
        noise = np.random.binomial(1, 0.05, X_train.shape)
        X_train = np.clip(X_train + noise, 0, 1)
        y_train = np.array(y_train)

        # Train a scikit-learn classifier
        from sklearn.ensemble import RandomForestClassifier
        disease_clf = RandomForestClassifier(n_estimators=15, random_state=42)
        disease_clf.fit(X_train, y_train)
        print("[OK] Fallback synthetic disease classifier successfully trained in-memory.")

    # 3. Build and train TensorFlow Injury CNN model (Trained on synthetic shapes for the 8 classes)
    print("[TF] Generating synthetic images for the 8 medical classes...")
    def generate_synthetic_image(class_idx):
        base_color = (245, 210, 185) # Peach skin background
        img = Image.new('RGB', (64, 64), color=base_color)
        draw = ImageDraw.Draw(img)
        
        if class_idx == 0: # burn: draw orange/red circular burns
            draw.ellipse([random.randint(10, 20), random.randint(10, 20), random.randint(40, 50), random.randint(40, 50)], fill=(220, 70, 20))
        elif class_idx == 1: # cut: draw thin dark red diagonal line
            draw.line([random.randint(5, 15), random.randint(5, 15), random.randint(45, 55), random.randint(45, 55)], fill=(150, 0, 0), width=random.randint(2, 4))
        elif class_idx == 2: # deep wound: draw a thick black/dark-red blob
            draw.polygon([random.randint(10, 20), random.randint(10, 20), random.randint(40, 50), random.randint(10, 20), random.randint(25, 45), random.randint(40, 55)], fill=(80, 0, 0))
        elif class_idx == 3: # bruise: draw purple/blue/green irregular ellipses
            draw.ellipse([random.randint(15, 25), random.randint(15, 25), random.randint(35, 45), random.randint(35, 45)], fill=(120, 80, 180))
        elif class_idx == 4: # fracture: draw white bone-like shapes with a gap
            draw.line([32, 5, 32, 25], fill=(255, 255, 255), width=6)
            draw.line([32, 35, 32, 55], fill=(255, 255, 255), width=6)
        elif class_idx == 5: # skin rash: draw multiple small red dots
            for _ in range(30):
                x, y = random.randint(5, 59), random.randint(5, 59)
                draw.ellipse([x, y, x+2, y+2], fill=(230, 80, 80))
        elif class_idx == 6: # infection: draw yellow circles with red outline
            draw.ellipse([20, 20, 44, 44], fill=(230, 230, 100), outline=(200, 50, 50))
        elif class_idx == 7: # normal skin: solid peach color
            pass
            
        return np.array(img).astype(np.float32) / 255.0

    X_img = []
    y_img = []
    for class_idx in range(len(INJURY_CLASSES)):
        for _ in range(15):
            X_img.append(generate_synthetic_image(class_idx))
            y_img.append(class_idx)
            
    X_img = np.array(X_img)
    y_img = np.array(y_img)

    print("[TF] Compiling TensorFlow Convolutional Neural Network (CNN) for injury classification...")
    injury_model = models.Sequential([
        layers.Input(shape=(64, 64, 3)),
        layers.Conv2D(8, (3, 3), padding='same', activation='relu'),
        layers.MaxPooling2D((2, 2)),
        layers.Conv2D(16, (3, 3), padding='same', activation='relu'),
        layers.MaxPooling2D((2, 2)),
        layers.Flatten(),
        layers.Dense(32, activation='relu'),
        layers.Dense(len(INJURY_CLASSES), activation='softmax')
    ])
    
    injury_model.compile(
        optimizer='adam',
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy']
    )

    print("[TF] Auto-training TensorFlow model with synthetic shape images...")
    injury_model.fit(X_img, y_img, epochs=8, batch_size=16, verbose=0)
    print("[OK] TensorFlow model successfully initialized, compiled, and trained.")

# Run initializations
init_models()

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "healthy",
        "service": "HelpAid ML Microservice",
        "modelType": "Kaggle Trained" if is_real_model_loaded else "Synthetic Fallback",
        "featuresCount": len(symptoms_list)
    })

@app.route('/symptoms-list', methods=['GET'])
def get_symptoms_list():
    """Returns the list of symptoms required to format the input binary vector."""
    return jsonify({
        "symptoms": symptoms_list
    })

@app.route('/predict-disease', methods=['POST'])
def predict_disease():
    """
    Predicts disease from a multi-hot list of symptoms.
    Payload: { "symptoms": [1, 0, 0, ...] }
    """
    try:
        data = request.get_json()
        symptoms_input = data.get("symptoms", [])
        if not symptoms_input or len(symptoms_input) != len(symptoms_list):
            return jsonify({
                "error": f"Invalid symptoms vector length. Expected {len(symptoms_list)} entries."
            }), 400

        features = np.array([symptoms_input])
        probs = disease_clf.predict_proba(features)[0]
        pred_idx = np.argmax(probs)
        confidence = float(probs[pred_idx])
        
        # Get target class label (name of the disease)
        pred_class = disease_clf.classes_[pred_idx]
        
        # If model is synthetic, map from index back to FALLBACK_DISEASES names
        if not is_real_model_loaded:
            disease_name = FALLBACK_DISEASES[pred_class]
        else:
            disease_name = str(pred_class)

        # Set typical severity alerts
        severity = "MEDIUM"
        critical_keywords = ["heart", "cardiac", "stroke", "poisoning", "attack"]
        high_keywords = ["flu", "fever", "malaria", "dengue", "typhoid", "covid", "corona"]
        
        name_lower = str(disease_name).lower()
        if any(kw in name_lower for kw in critical_keywords):
            severity = "CRITICAL"
        elif any(kw in name_lower for kw in high_keywords):
            severity = "HIGH"

        # Construct full predictions probability list
        all_preds = {}
        for idx, prob in enumerate(probs):
            class_label = disease_clf.classes_[idx]
            label_name = FALLBACK_DISEASES[class_label] if not is_real_model_loaded else str(class_label)
            all_preds[label_name] = round(float(prob) * 100, 2)

        return jsonify({
            "disease": disease_name,
            "confidence": round(confidence * 100, 2),
            "severity": severity,
            "predictions": all_preds
        })

    except Exception as e:
        print("Error in predict-disease:", str(e))
        return jsonify({"error": str(e)}), 500

@app.route('/predict-injury', methods=['POST'])
def predict_injury():
    """Predicts injury from base64 image data."""
    try:
        data = request.get_json()
        img_b64 = data.get("image", "")
        if not img_b64:
            return jsonify({"error": "No image data provided."}), 400

        if ',' in img_b64:
            img_b64 = img_b64.split(',')[1]

        image_data = base64.b64decode(img_b64)
        image = Image.open(BytesIO(image_data))
        
        # Preprocess for CNN
        image = image.convert('RGB')
        image = image.resize((64, 64))
        img_array = np.array(image) / 255.0
        img_array = np.expand_dims(img_array, axis=0)

        probs = injury_model.predict(img_array)[0]
        pred_idx = np.argmax(probs)
        confidence = float(probs[pred_idx])
        pred_class = INJURY_CLASSES[pred_idx]

        severity = "LOW"
        if pred_class.lower() in ["fracture", "deep wound"]:
            severity = "CRITICAL"
        elif pred_class.lower() in ["burn", "cut", "infection"]:
            severity = "HIGH"
        elif pred_class.lower() in ["bruise"]:
            severity = "MEDIUM"

        return jsonify({
            "prediction": pred_class,
            "confidence": round(confidence * 100, 2),
            "severity": severity,
            "probabilities": {INJURY_CLASSES[i]: round(probs[i] * 100, 2) for i in range(len(INJURY_CLASSES))}
        })

    except Exception as e:
        print("Error in predict-injury:", str(e))
        return jsonify({"error": str(e)}), 500

@app.route('/predict-image', methods=['POST'])
def predict_image():
    """Predicts injury from an uploaded image file or base64 data."""
    try:
        img = None
        if 'image' in request.files:
            img_file = request.files['image']
            img = Image.open(img_file.stream)
            print(f"[ML] Received file upload: {img_file.filename}")
        else:
            data = request.get_json(silent=True)
            if data and 'image' in data:
                img_b64 = data['image']
                if ',' in img_b64:
                    img_b64 = img_b64.split(',')[1]
                image_data = base64.b64decode(img_b64)
                img = Image.open(BytesIO(image_data))
                print("[ML] Received base64 image data")
            else:
                return jsonify({"error": "No image file or data provided."}), 400

        # Preprocess for CNN
        img = img.convert('RGB')
        img = img.resize((64, 64))
        img_array = np.array(img).astype(np.float32) / 255.0
        img_array = np.expand_dims(img_array, axis=0)

        probs = injury_model.predict(img_array)[0]
        pred_idx = np.argmax(probs)
        confidence = float(probs[pred_idx])
        pred_class = INJURY_CLASSES[pred_idx]

        severity_map = {
            "burn": "HIGH",
            "cut": "MEDIUM",
            "deep wound": "CRITICAL",
            "bruise": "MEDIUM",
            "fracture": "HIGH",
            "skin rash": "LOW",
            "infection": "HIGH",
            "normal skin": "LOW"
        }
        severity = severity_map.get(pred_class, "LOW")

        print(f"[ML] Predicted class: {pred_class}, Confidence: {confidence*100:.2f}%, Severity: {severity}")

        return jsonify({
            "prediction": pred_class,
            "confidence": round(confidence * 100, 2),
            "severity": severity
        })

    except Exception as e:
        print("Error in predict-image:", str(e))
        return jsonify({"error": str(e)}), 500

@app.route('/predict-heart-disease', methods=['POST'])
def predict_heart_disease():
    """Predicts heart disease risk probability from a vector of 13 features."""
    try:
        data = request.get_json()
        features_input = data.get("features", [])
        if not features_input or len(features_input) != 13:
            return jsonify({
                "error": "Invalid features vector length. Expected 13 entries."
            }), 400

        features = np.array([features_input])
        probs = heart_clf.predict_proba(features)[0]
        risk_probability = float(probs[1]) if len(probs) > 1 else float(probs[0])
        pred_class = int(heart_clf.predict(features)[0])
        
        return jsonify({
            "risk_score": round(risk_probability * 100, 2),
            "has_disease": bool(pred_class),
            "probabilities": {
                "no_risk": round(float(probs[0]) * 100, 2),
                "high_risk": round(float(probs[1]) * 100, 2) if len(probs) > 1 else 0.0
            }
        })
    except Exception as e:
        print("Error in predict-heart-disease:", str(e))
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=False)
