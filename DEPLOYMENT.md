# HelpAid AI – Deployment Guide

This document outlines the step-by-step instructions for deploying the **HelpAid AI Emergency First Response & Smart Health Assistance Platform** in a production environment.

## 1. System Architecture Overview

HelpAid AI is a modern full-stack web application consisting of three main parts:
1. **Frontend Client**: React Single Page Application (SPA) compiled using Vite with Progressive Web App (PWA) offline service workers.
2. **Backend Server**: Node.js Express API server connecting to MongoDB, issuing JWT tokens, generating PDF reports, and orchestrating requests.
3. **ML Microservice**: Python Flask/FastAPI service running scikit-learn Random Forest (symptom checker, cardiovascular risk analysis) and TensorFlow CNN (injury photo classification).

---

## 2. Environment Configuration

Create a `.env` file in the root of the project:

```env
# Node Backend Express Server Configuration
PORT=5000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/helpaid?retryWrites=true&w=majority
JWT_SECRET=super-secure-jwt-secret-key-change-in-production

# Gemini AI Credentials
GEMINI_API_KEY=AIzaSy...YourActualGeminiAPIKey...
VITE_GEMINI_API_KEY=AIzaSy...YourActualGeminiAPIKey...

# Python ML Microservice Endpoint
ML_SERVICE_URL=http://localhost:8000

# Optional Maps Configuration (fallback to OpenStreetMap Overpass if unset)
GOOGLE_PLACES_API_KEY=
```

---

## 3. Database Deployment (MongoDB)

1. Set up a MongoDB cluster using **MongoDB Atlas** or host a local instance.
2. Ensure network security parameters allow incoming connection requests from the Node.js server IP address.
3. Upon first startup, the Node backend will automatically seed database indexes and default records (sample hospitals, blood banks, first aid guides, and the default administrator login).

---

## 4. Python ML Service Deployment (FastAPI/Flask)

Deploy the Python service on a server with python 3.8+ (preferably with GPU support if classifying high volumes of photos, although synthetic MobileNetV2 is lightweight and runs efficiently on CPU).

### Steps:
1. Navigate to the `ml_service` directory:
   ```bash
   cd ml_service
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the service (runs on port `8000`):
   ```bash
   python app.py
   ```
   For production environments, run using a WSGI server like `gunicorn`:
   ```bash
   gunicorn --bind 0.0.0.0:8000 app:app
   ```

---

## 5. Express API Server Deployment (Node.js)

1. Install backend dependencies in the workspace root:
   ```bash
   npm install
   ```
2. Build typescript files or run direct compilation.
3. Run using a process supervisor like **PM2** to ensure the process auto-restarts on failure:
   ```bash
   npm install -g pm2
   pm2 start tsx --name "helpaid-backend" -- server.ts
   ```
   Or compile to JS and run:
   ```bash
   pm2 start dist/server.js --name "helpaid-backend"
   ```

---

## 6. Frontend Deployment (React / Vite PWA)

1. Build production-optimized assets:
   ```bash
   npm run build
   ```
2. The compilation output will be written to `dist/`, including:
   - Optimized javascript and CSS chunks.
   - PWA assets: `sw.js` (service worker cache) and `manifest.json`.
3. Deploy the `dist/` static files folder to:
   - **Vercel** / **Netlify**: Hook up repository and point build output directory to `dist`.
   - **Nginx Server**: Serve static files and proxy `/api/*` requests to `http://localhost:5000/api/*`.

### Sample Nginx Proxy Configuration:
```nginx
server {
    listen 80;
    server_name helpaid.yourdomain.com;

    location / {
        root /var/www/helpaid/dist;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 7. Security & Hardening Checklist
- Ensure `JWT_SECRET` is at least 32 characters long.
- Use HTTPS for all network endpoints (setup Let's Encrypt SSL certificates for Nginx).
- Enforce the custom rate-limiting middleware enabled at the router level.
- Keep the `GEMINI_API_KEY` loaded as an environment variable on the server side and never expose it on public client-side scripts.
