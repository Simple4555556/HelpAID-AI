import { GoogleGenAI } from '@google/genai';
import { AgentState, ReportState } from './AgentState';

const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const ReportAgent = async (state: AgentState): Promise<Partial<AgentState>> => {
  const symptoms = state.inputs.symptoms || 'No description provided.';
  const vision = state.vision;
  const vault = state.vault;

  // Compile information already retrieved
  const vaultName = vault?.hasVaultData ? 'Encrypted Vault Profile' : 'Unknown Patient';
  const allergiesList = vault?.allergies?.length ? vault.allergies.join(', ') : 'None documented';
  const conditionsList = vault?.chronicConditions?.length ? vault.chronicConditions.join(', ') : 'None documented';

  // Fallback demographic fields if not in vault
  const baseName = vault?.hasVaultData && vaultName !== 'Unknown Patient' ? vaultName : 'Emergency Patient';

  if (!ai) {
    console.warn('[ReportAgent] Gemini API key missing. Running in fallback mode.');
    return { report: getFallbackReport(state) };
  }

  try {
    const prompt = `You are a professional medical dispatch report compiler. Your job is to aggregate symptoms, vision observation results, and patient health history into a structured triage report.
Do NOT diagnose or suggest clinical treatments. Keep your report descriptive and focused on pre-hospital status.

Input Data:
- Symptoms reported: "${symptoms}"
- Vision agent observations: "${vision?.observations || 'None'}"
- Vision agent injuries: [${vision?.visibleInjuries?.join(', ') || ''}]
- Vision agent urgency level: "${vision?.urgencyLevel || 'LOW'}"
- Medical history from Vault:
  * Allergies: ${allergiesList}
  * Chronic conditions: ${conditionsList}

Generate a report in strict JSON format (do not wrap in markdown):
{
  "patientName": "Extract patient name if visible in input or history, otherwise return 'Unknown Patient'",
  "age": null, // return number or null
  "gender": "Extract patient gender if visible, otherwise 'Unknown'",
  "mobileNumber": "Extract mobile number if visible, otherwise ''",
  "emergencyLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", // map based on severity of symptoms/observations
  "injuryType": "Brief classification, e.g., Fracture, Burn, Cardiac, Soft Tissue Trauma",
  "confidenceScore": 90,
  "recommendedAction": "Immediate pre-arrival first-aid guidance for dispatchers",
  "reportSummary": "Professional summary of symptoms, observations, and relevant history"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    const text = response.text?.replace(/```json|```/g, '').trim() || '{}';
    const result = JSON.parse(text);

    // Populate profile details from Vault if available (Vault is source of truth)
    const report: ReportState = {
      patientName: vault?.hasVaultData ? 'Vault Patient' : (result.patientName || 'Unknown Patient'),
      age: result.age || null,
      gender: result.gender || 'Unknown',
      mobileNumber: result.mobileNumber || '',
      emergencyLevel: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(result.emergencyLevel) 
        ? result.emergencyLevel 
        : (vision?.urgencyLevel || 'MEDIUM'),
      injuryType: result.injuryType || 'General Emergency',
      confidenceScore: typeof result.confidenceScore === 'number' ? result.confidenceScore : 85,
      recommendedAction: result.recommendedAction || 'Keep the patient still and await professional dispatch.',
      reportSummary: result.reportSummary || 'Triage summary complete.'
    };

    return { report };

  } catch (error: any) {
    console.error('[ReportAgent] Gemini execution error, using fallback:', error.message);
    return { report: getFallbackReport(state) };
  }
};

function getFallbackReport(state: AgentState): ReportState {
  const symptoms = state.inputs.symptoms || '';
  const symLower = symptoms.toLowerCase();
  const vision = state.vision;

  let emergencyLevel: ReportState['emergencyLevel'] = vision?.urgencyLevel || 'MEDIUM';
  let injuryType = 'Soft Tissue Injury / Pain';
  let recommendedAction = 'Apply basic first aid. Keep patient calm and warm.';
  let reportSummary = `Patient reports: "${symptoms}".`;

  if (vision && vision.observations) {
    reportSummary += ` Image observations: ${vision.observations}`;
  }

  if (symLower.includes('bleed') || symLower.includes('blood')) {
    injuryType = 'Severe Bleeding';
    emergencyLevel = 'HIGH';
    recommendedAction = 'Apply direct continuous pressure with sterile gauze. Elevate if possible.';
  } else if (symLower.includes('burn')) {
    injuryType = 'Burn Injury';
    emergencyLevel = 'HIGH';
    recommendedAction = 'Cool burn with clean running tap water for 10-20 mins. Do not apply ice.';
  } else if (symLower.includes('fracture') || symLower.includes('bone')) {
    injuryType = 'Bone Fracture / Joint Traumatic Injury';
    emergencyLevel = 'HIGH';
    recommendedAction = 'Immobilize the limb. Do not attempt to push bone back.';
  } else if (symLower.includes('chest') || symLower.includes('heart') || symLower.includes('cardiac') || symLower.includes('stroke')) {
    injuryType = 'Cardiac / Cardiovascular Emergency';
    emergencyLevel = 'CRITICAL';
    recommendedAction = 'Check responsiveness. If patient becomes unresponsive, prepare to initiate CPR.';
  }

  return {
    patientName: 'Emergency Patient',
    age: null,
    gender: 'Unknown',
    mobileNumber: '',
    emergencyLevel,
    injuryType,
    confidenceScore: 70,
    recommendedAction,
    reportSummary
  };
}
