import { AgentState, HospitalFinderState, HospitalInfo } from './AgentState';
import { getHospitals } from '../../../db';
import { haversineDistance } from '../services/PlacesService';

export const HospitalFinderAgent = async (state: AgentState): Promise<Partial<AgentState>> => {
  const lat = state.inputs.lat;
  const lng = state.inputs.lng;
  const urgency = state.report?.emergencyLevel || 'MEDIUM';

  const defaultState: HospitalFinderState = {
    recommendedHospitals: [],
    searchRadius: 15
  };

  if (!lat || !lng) {
    return { hospitals: defaultState };
  }

  try {
    const allDbHospitals = await getHospitals({});
    const mappedHospitals = allDbHospitals.map((h: any) => {
      const doc = h.toObject ? h.toObject() : h;
      const distance = haversineDistance(
        lat,
        lng,
        doc.latitude ?? doc.lat ?? 0,
        doc.longitude ?? doc.lng ?? 0
      );

      return {
        id: String(doc._id),
        name: doc.name || 'Hospital',
        distance,
        latitude: doc.latitude ?? doc.lat ?? 0,
        longitude: doc.longitude ?? doc.lng ?? 0,
        bedsAvailable: doc.emergencyBedsAvailable ?? 0,
        icuBedsAvailable: doc.icuBedsAvailable ?? 0,
        ventilatorsAvailable: doc.ventilatorsAvailable ?? 0
      };
    });

    // We expand search radius: 5km, then 10km, then 15km
    let searchRadius = 5;
    let filtered = mappedHospitals.filter(h => h.distance <= 5);

    if (filtered.length < 2) {
      searchRadius = 10;
      filtered = mappedHospitals.filter(h => h.distance <= 10);
    }
    if (filtered.length < 2) {
      searchRadius = 15;
      filtered = mappedHospitals.filter(h => h.distance <= 15);
    }

    // Rank matching:
    // If critical/high, sort prioritizing ICU/Ventilator availability first, then proximity
    // If low/medium, sort prioritizing general bed availability and proximity
    filtered.sort((a, b) => {
      if (urgency === 'CRITICAL' || urgency === 'HIGH') {
        const aHasCritical = (a.icuBedsAvailable > 0 || a.ventilatorsAvailable > 0) ? 1 : 0;
        const bHasCritical = (b.icuBedsAvailable > 0 || b.ventilatorsAvailable > 0) ? 1 : 0;
        if (aHasCritical !== bHasCritical) {
          return bHasCritical - aHasCritical; // prioritize those with critical capacity
        }
      }
      // If capacity is equal, sort by distance
      return a.distance - b.distance;
    });

    // Select top 2-4 hospitals
    const recommendedHospitals = filtered.slice(0, 4);

    return {
      hospitals: {
        recommendedHospitals,
        searchRadius
      }
    };

  } catch (error: any) {
    console.error('[HospitalFinderAgent] Error matching hospitals:', error.message);
    return { hospitals: defaultState };
  }
};
