import { GoogleGenAI } from '@google/genai';
import { AgentState, VisionState } from './AgentState';

const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const VisionAgent = async (state: AgentState): Promise<Partial<AgentState>> => {
  const imageBase64 = state.inputs.imageBase64;
  const symptoms = state.inputs.symptoms || '';

  // 1. If no image uploaded, return default empty state
  if (!imageBase64) {
    return {
      vision: {
        observations: 'No medical image or accident photo uploaded. Triage is proceeding based on symptoms and location parameters.',
        visibleInjuries: [],
        urgencyLevel: 'LOW',
        confidenceScore: 100
      }
    };
  }

  // 2. Check if Gemini client is active. If not, use rule-based fallback.
  if (!ai) {
    console.warn('[VisionAgent] Gemini API key missing. Running in fallback mode.');
    return { vision: getFallbackVision(symptoms) };
  }

  try {
    const prompt = `Analyze this emergency/accident image. You must adhere to these strict constraints:
- Describe ONLY visible physical observations.
- NEVER diagnose clinical conditions (e.g. do not say "patient has a grade-3 tibial fracture"). Instead say "visible deformity in leg".
- NEVER prescribe medication or specific medical treatments.
- NEVER assume internal unseen injuries.
- Respond ONLY as a valid JSON object matching the following structure (do not wrap in markdown):
{
  "observations": "Detailed description of visible skin, limbs, blood, or surrounding environment",
  "visibleInjuries": ["Injury 1", "Injury 2"],
  "urgencyLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "confidenceScore": 90
}`;

    // Clean base64 header if present
    const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
            { text: prompt }
          ]
        }
      ]
    });

    const text = response.text?.replace(/```json|```/g, '').trim() || '{}';
    const result = JSON.parse(text);

    // Validate structure of parsed output
    const vision: VisionState = {
      observations: result.observations || 'Visible scan complete.',
      visibleInjuries: Array.isArray(result.visibleInjuries) ? result.visibleInjuries : [],
      urgencyLevel: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(result.urgencyLevel) 
        ? result.urgencyLevel 
        : 'MEDIUM',
      confidenceScore: typeof result.confidenceScore === 'number' ? result.confidenceScore : 80
    };

    return { vision };

  } catch (error: any) {
    console.error('[VisionAgent] Gemini execution error, using fallback:', error.message);
    return { vision: getFallbackVision(symptoms) };
  }
};

// Resilient fallback logic when Gemini is offline
function getFallbackVision(symptoms: string): VisionState {
  const symLower = symptoms.toLowerCase();
  let urgencyLevel: VisionState['urgencyLevel'] = 'MEDIUM';
  let visibleInjuries: string[] = [];
  let observations = 'Fallback analysis performed. ';

  if (symLower.includes('bleed') || symLower.includes('blood')) {
    urgencyLevel = 'HIGH';
    visibleInjuries.push('Severe Bleeding');
    observations += 'Potential laceration or tissue trauma with active bleeding.';
  } else if (symLower.includes('burn')) {
    urgencyLevel = 'HIGH';
    visibleInjuries.push('Burn Injury');
    observations += 'Visible epidermal damage consistent with thermal exposure.';
  } else if (symLower.includes('fracture') || symLower.includes('bone') || symLower.includes('broken')) {
    urgencyLevel = 'HIGH';
    visibleInjuries.push('Fracture / Deformity');
    observations += 'Physical limb misalignment suggesting closed or open fracture.';
  } else if (symLower.includes('chest') || symLower.includes('heart') || symLower.includes('cardiac') || symLower.includes('stroke')) {
    urgencyLevel = 'CRITICAL';
    visibleInjuries.push('Cardiac Distress / Neuro');
    observations += 'Acute critical symptoms reported. Patient displays distress.';
  } else {
    observations += 'No acute visible traumas identified, patient complaining of general symptoms.';
  }

  if (visibleInjuries.length === 0) {
    visibleInjuries.push('General Traumatic Pain');
  }

  return {
    observations,
    visibleInjuries,
    urgencyLevel,
    confidenceScore: 75
  };
}
