# HelpAid: AI-Powered Emergency & Medical Assistance Platform
**Comprehensive Project Documentation**

---

## 1. Abstract
**HelpAid** is an intelligent, offline-capable emergency medical assistance web application. It is designed to act as a crucial bridge between a medical emergency and professional healthcare. By leveraging cutting-edge Generative AI (Google Gemini) alongside a robust offline dataset architecture, HelpAid provides instant symptom analysis, immediate first-aid protocols, accident severity assessment, and real-time location routing for nearby hospitals and blood banks. 

## 2. Problem Statement
During medical emergencies, every second counts. People often panic and make fatal mistakes (e.g., giving water to a stab victim, incorrectly moving a fracture patient). Furthermore, existing medical AI bots are highly dependent on internet connectivity and server uptime. If the API fails during a crisis, the user is left helpless. There is a dire need for a system that provides instant, jargon-free medical guidance and never crashes—even if external servers go down.

## 3. Proposed Solution
HelpAid solves this by implementing an **"Offline-First AI Architecture"**. 
The system primarily consults a powerful AI (Gemini 1.5 Flash) for personalized diagnosis and accident analysis. However, if the AI service fails, times out, or reaches its quota, the application instantly and silently falls back to a massive, locally stored database (CSVs) of hospitals, emergency protocols, and diseases. This ensures a **Zero-Crash Guarantee**, meaning critical life-saving information is always available.

---

## 4. Technology Stack (A to Z)

### **Frontend & UI**
*   **React.js (Vite)**: The core JavaScript library used for building the fast, single-page application (SPA).
*   **TypeScript**: Used for strict typing, reducing runtime errors and improving code quality.
*   **Tailwind CSS**: A utility-first CSS framework used for rapid, beautiful, and responsive UI styling (including Dark Mode).
*   **Framer Motion**: Used for smooth, professional micro-animations and page transitions.
*   **Lucide-React**: A clean, modern icon library used extensively throughout the UI for visual cues.
*   **React Router**: Handles seamless client-side navigation between different modules (Home, Chat, Guides, etc.).

### **Backend, AI & Database**
*   **Node.js & Express**: The backend web application framework that hosts the API endpoints securely, loads the local CSV datasets, handles request-response flows, and proxies the AI calls.
*   **Google Gemini API (`gemini-1.5-flash`)**: The core brain of the application. Invoked securely on the server side using the `@google/genai` SDK to parse user inputs (symptoms, accidents) and return structured, JSON-formatted medical advice.
*   **Firebase Authentication**: Manages user sign-ups and secure logins.
*   **Firebase Firestore (NoSQL)**: A cloud database used to store users' emergency reports and session histories.
*   **Haversine Formula Algorithm**: A mathematical algorithm implemented natively to calculate the exact distance (in kilometers) between the user's GPS coordinates and nearby medical facilities.

### **Data Layer (The Fallback System)**
Instead of relying solely on APIs, the application securely bundles data locally using `?raw` imports:
*   `hospitals.csv`: Geolocation and contact info for regional medical centers.
*   `emergency.csv`: Step-by-step protocols for critical accidents.
*   `general_diseases.csv`: Common illnesses and their home remedies.
*   `symptom_prediction.csv`: A mapped dataset of age, gender, and symptoms to predict likely conditions.

---

## 5. Core Modules & Features

### 1. AI Doctor (Symptom Checker)
Users input their age, gender, pain level, duration, and physical symptoms. The system passes this prompt to the Gemini API, which cross-references the `symptom_prediction.csv` dataset. 
*   **Output**: It returns a percentage-matched list of possible conditions, immediate actionable steps, and routes the user to the nearest appropriate specialist based on GPS.

### 2. Accident Analysis & Rescue AI (Chatbot)
A conversational interface built for high-stress situations. Users can type or use Quick Prompts (e.g., "Bike Accident", "Chest Pain"). 
*   **Output**: The AI parses the situation, assigns a Severity Level (LOW/MEDIUM/CRITICAL), lists strict "Do's and Don'ts", and explicitly states whether an ambulance (108) is required.

### 3. Protocol Library (First Aid Guides)
An entirely offline dictionary of medical emergencies. 
*   **Supported Emergencies**: CPR, Severe Bleeding, Burns, Fractures, Snake Bites, Stab Wounds, Lacerations, Bruises, Nosebleeds, and Abrasions.
*   **Features**: Color-coded urgency tags, step-by-step numbered instructions, and critical warning banners.

### 4. Blood Bank Locator
A real-time search interface where users select their Blood Group (e.g., O+, AB-) and location. The system filters the hospital database to find the nearest facility with active inventory for that specific blood type.

### 5. Nearby Help (Geolocation Routing)
Uses the browser's native Geolocation API combined with the Haversine formula to pinpoint the user on a grid. It instantly lists all nearby Hospitals, Police Stations, and Pharmacies, sorted by distance, with 1-click Google Maps navigation routing.

---

## 6. Unique Selling Proposition (USP)
**The Resilient Try-Catch Fallback Pipeline:**
Unlike standard college projects that break when an API key expires, HelpAid's `gemini.ts` orchestrator wraps every single AI function in a `try/catch` block. If `analyzeSymptoms` or `analyzeAccident` fails, the `catch` block intercepts the error, parses the local CSV files, and returns a perfectly formatted mock JSON object. The user interface remains fully intact, rendering the local data identically to the AI data. The user never sees a white screen or a "Failed to analyze" error.

## 7. Setup & Execution
1. Install dependencies: `npm install`
2. Configure Environment: Add `VITE_GEMINI_API_KEY` and Firebase credentials to `.env`.
3. Run Development Server: `npm run dev`
4. Access App: `localhost:5173`

---
*Developed for academic evaluation. Medical information provided by the system is for first-aid bridging purposes only and does not replace professional emergency care.*
