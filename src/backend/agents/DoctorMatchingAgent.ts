import { AgentState, DoctorMatchingState, DoctorInfo } from './AgentState';
import { getDoctors } from '../../../db';
import { haversineDistance } from '../services/PlacesService';

function getSpecializationForInjury(injuryType: string): string {
  const lower = (injuryType || '').toLowerCase();
  if (lower.includes('fracture') || lower.includes('bone') || lower.includes('broken')) return 'Orthopedic';
  if (lower.includes('burn') || lower.includes('skin') || lower.includes('wound') || lower.includes('abrasion')) return 'Dermatologist';
  if (lower.includes('cardiac') || lower.includes('heart') || lower.includes('pain in chest')) return 'Cardiologist';
  if (lower.includes('head') || lower.includes('stroke') || lower.includes('brain') || lower.includes('concussion')) return 'Neurologist';
  if (lower.includes('bleeding') || lower.includes('cut') || lower.includes('stab') || lower.includes('laceration')) return 'General Surgeon';
  return 'General Physician';
}

export const DoctorMatchingAgent = async (state: AgentState): Promise<Partial<AgentState>> => {
  const lat = state.inputs.lat;
  const lng = state.inputs.lng;
  const injuryType = state.report?.injuryType || '';

  const defaultState: DoctorMatchingState = {
    assignedDoctor: null,
    backupDoctors: []
  };

  if (!lat || !lng) {
    return { doctor: defaultState };
  }

  try {
    const requiredSpecialty = getSpecializationForInjury(injuryType);
    const allDoctors = await getDoctors({});

    // Filter and map doctors
    const matchedDoctors = allDoctors
      .filter((d: any) => {
        const docSpec = (d.specialization || d.specialty || '').toLowerCase();
        return docSpec.includes(requiredSpecialty.toLowerCase()) || docSpec.includes('general');
      })
      .map((d: any) => {
        const doc = d.toObject ? d.toObject() : d;
        const dist = haversineDistance(
          lat,
          lng,
          doc.latitude ?? doc.lat ?? 0,
          doc.longitude ?? doc.lng ?? 0
        );
        return {
          id: String(doc._id),
          name: doc.name || 'Specialist Doctor',
          specialization: doc.specialization || 'General Physician',
          phone: doc.phone || 'N/A',
          distance: dist
        };
      })
      .sort((a, b) => a.distance - b.distance);

    if (matchedDoctors.length === 0) {
      return { doctor: defaultState };
    }

    const assignedDoctor: DoctorInfo = {
      id: matchedDoctors[0].id,
      name: matchedDoctors[0].name,
      specialization: matchedDoctors[0].specialization,
      phone: matchedDoctors[0].phone
    };

    const backupDoctors: DoctorInfo[] = matchedDoctors.slice(1, 4).map(d => ({
      id: d.id,
      name: d.name,
      specialization: d.specialization,
      phone: d.phone
    }));

    return {
      doctor: {
        assignedDoctor,
        backupDoctors
      }
    };

  } catch (error: any) {
    console.error('[DoctorMatchingAgent] Error matching doctors:', error.message);
    return { doctor: defaultState };
  }
};
