# HelpAid AI — Production-Ready Deployment & Architecture Guide

Welcome to the production-ready full-stack configuration of **HelpAid AI — Emergency First Response & Smart Health Assistance Platform**. 

This document describes the directories, database schemas, machine learning configurations, environment parameters, and step-by-step setup guides to deploy this application.

---

## 1. System Components & Architecture

HelpAid AI is constructed as a secure, distributed full-stack architecture:

1. **React Frontend client** (Vite + TS + Tailwind CSS)
   - Serves as the mobile-first dashboard interface.
   - Collects GPS coordinate telemetry, manages Firebase Authentication, and logs active data entries.
   - Proxies backend requests `/api/*` to the server to prevent API key exposure.
   - Registers a PWA service worker (`public/sw.js`) for offline static caching and offline JSON fallback mappings.
2. **Node.js Express Server**
   - Directs the application backend, routing requests to the local database, ML server, and Google Gemini.
   - Manages connection states and provides automatic in-memory object arrays in case MongoDB is offline.
3. **MongoDB Database Collection Layer**
   - Connects via Mongoose and maintains collections: `diseases`, `symptoms`, `hospitals`, `bloodbanks`, `firstaid`, `emergency_protocols`, `users`, `reports`, `sos_logs`.
   - Seeds itself automatically on startup if collections are empty.
4. **Python ML Microservice**
   - Runs on Flask to host scikit-learn (Random Forest symptoms model) and TensorFlow/Keras (injury classification CNN).
   - Generates synthetic data and trains/compiles models automatically on startup to ensure instant query availability.

---

## 2. Directory Layout

```
emg/
├── dataset/                     # Local CSV directories for seeding
├── ml_service/                  # Python machine learning microservice
│   ├── app.py                   # Flask server, scikit-learn and TensorFlow models
│   └── requirements.txt         # Python package dependencies
├── public/
│   └── sw.js                    # Progressive Web App offline service worker
├── src/                         # React Frontend client
│   ├── lib/
│   │   ├── gemini.ts            # Frontend HTTP API client mapping to backend
│   │   └── utils.ts             # Tailwind class styling helpers
│   ├── pages/
│   │   ├── HomePage.tsx         # Health dashboard, statistics SVG and SOS pulsing alert
│   │   ├── InjuryDetector.tsx   # Picture uploads and vision triage results
│   │   ├── Profile.tsx          # Medical history, logs timeline, and profile syncing
│   │   └── ...
│   └── main.tsx                 # Client entry and PWA registration
├── .env                         # Backend environment configurations
├── db.ts                        # Mongoose database schemas, seeds, and memory fallbacks
├── server.ts                    # Backend router and API orchestrator
├── tsconfig.json                # TypeScript settings
└── README_FULLSTACK.md          # This Deployment & Architecture Guide
```

---

## 3. Environment Variables Setup

Configure the `.env` file in the root directory:

```env
# Server Configuration
PORT=5000

# Google Gemini API Key (Required for server-side AI explanations)
GEMINI_API_KEY="AIzaSyAr6a8587Nn..."

# MongoDB Connection String (Defaults to local instance if not provided)
MONGODB_URI="mongodb://localhost:27017/helpaid"

# Python ML Microservice URL (Defaults to port 8000)
ML_SERVICE_URL="http://localhost:8000"
```

---

## 4. Setup and Installation Guide

Follow these steps to run the full-stack system:

### Step 1: Install MongoDB
1. Ensure **MongoDB Community Server** is installed and running locally:
   - On Windows: Run `services.msc` and check that the `MongoDB Database Server` service is `Running`.
   - Alternatively, supply a cloud MongoDB connection string in `.env` under `MONGODB_URI`.
   *Note: If MongoDB is unavailable, the backend will automatically activate its robust in-memory database fallback using local CSV dataset files.*

### Step 2: Set Up Python ML Microservice
1. Navigate to the `ml_service` folder or open a separate terminal.
2. Initialize and activate a Python virtual environment (recommended):
   ```bash
   python -m venv venv
   # On Windows (PowerShell):
   .\venv\Scripts\Activate.ps1
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install package dependencies:
   ```bash
   pip install -r ml_service/requirements.txt
   ```
4. Run the Python ML microservice:
   ```bash
   python ml_service/app.py
   ```
   On startup, the script will output:
   - `🤖 Initializing Machine Learning Models...`
   - `📊 Training Random Forest Classifier on synthetic symptoms...`
   - `📷 Compiling TensorFlow Convolutional Neural Network (CNN)...`
   - `✅ TensorFlow model successfully initialized and compiled.`
   - Flask will bind to `http://localhost:8000`.

### Step 3: Set Up Node.js Backend & React Frontend
1. Open a new terminal in the root workspace.
2. Install npm packages:
   ```bash
   npm install
   ```
3. Run the concurrent development script:
   ```bash
   npm run dev
   ```
   This will use `concurrently` to start:
   - **Vite React Client** listening on port `3000` (`http://localhost:3000`).
   - **Node.js Express Server** listening on port `5000` (`http://localhost:5000`).

---

## 5. Request & Backend Workflows

### A. Symptom Triage Workflow
```
Symptom Input (React)
  → /api/analyze-symptoms (Express Server)
  → Map keywords to multi-hot array
  → POST /predict-disease (Python Flask ML)
  → Random Forest prediction (Confidence %, disease)
  → Lookup disease medicines/precautions in MongoDB
  → Build prompts context
  → Generate structured medical assessment (Gemini API)
  → Log Report in MongoDB
  → Return unified response to Client
```

### B. Photo Injury Scanner Workflow
```
Photo upload (React)
  → /api/analyze-injury (Express Server)
  → POST /predict-injury (Python Flask ML)
  → Decode base64 & resize to 64x64
  → Run TensorFlow CNN classification (Bruise, Burn, Cut, Fracture, etc.)
  → Retrieve first aid protocols from MongoDB
  → Query explanation (Gemini API)
  → Log Report in MongoDB
  → Return guidelines & hospital details to Client
```

### C. Geolocation-Based Nearby Help Workflow
```
Get current position (React via Geolocation API)
  → Get list of hospitals from local cache or /api/nearby-facilities (Express Server)
  → Compute distances locally using Haversine algorithm
  → Sort closest facilities in ascending distance
  → Render cards containing navigation routes and phone click-to-call
```
