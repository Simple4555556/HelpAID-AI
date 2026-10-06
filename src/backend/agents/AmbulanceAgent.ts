import { AgentState, AmbulanceState } from './AgentState';
import { getAmbulanceServices } from '../../../db';
import { haversineDistance } from '../services/PlacesService';

export const AmbulanceAgent = async (state: AgentState): Promise<Partial<AgentState>> => {
  const lat = state.inputs.lat;
  const lng = state.inputs.lng;
  const urgency = state.report?.emergencyLevel || 'MEDIUM';

  const defaultState: AmbulanceState = {
    dispatchRequired: false,
    priorityLevel: 'LOW',
    assignedAmbulanceId: null,
    driverName: null,
    driverPhone: null,
    estimatedResponseTimeMinutes: 0
  };

  if (!lat || !lng) {
    return { ambulance: defaultState };
  }

  try {
    const dispatchRequired = ['CRITICAL', 'HIGH', 'MEDIUM'].includes(urgency);
    if (!dispatchRequired) {
      return { ambulance: defaultState };
    }

    const availableAmbulances = await getAmbulanceServices({ is_available: true });
    if (availableAmbulances.length === 0) {
      // Return default with dispatch required but no assignments
      return {
        ambulance: {
          ...defaultState,
          dispatchRequired: true,
          priorityLevel: urgency as AmbulanceState['priorityLevel']
        }
      };
    }

    // Map and score ambulances
    const mappedAmbulances = availableAmbulances.map((a: any) => {
      const doc = a.toObject ? a.toObject() : a;
      const dist = haversineDistance(
        lat,
        lng,
        doc.latitude ?? doc.lat ?? 0,
        doc.longitude ?? doc.lng ?? 0
      );

      return {
        id: String(doc._id),
        name: doc.name || 'Ambulance Service',
        phone: doc.phone || 'N/A',
        vehicleType: doc.vehicleType || 'Basic',
        distance: dist
      };
    });

    // Rank ambulances:
    // If critical/high, prioritize ICU or Cardiac types
    mappedAmbulances.sort((a, b) => {
      if (urgency === 'CRITICAL' || urgency === 'HIGH') {
        const aSpecial = ['ICU', 'Cardiac'].includes(a.vehicleType) ? 1 : 0;
        const bSpecial = ['ICU', 'Cardiac'].includes(b.vehicleType) ? 1 : 0;
        if (aSpecial !== bSpecial) {
          return bSpecial - aSpecial; // prioritize specialized types
        }
      }
      return a.distance - b.distance;
    });

    const primary = mappedAmbulances[0];
    const eta = Math.max(3, Math.round(primary.distance * 2.5 + 2)); // 2.5 mins per km + 2 min dispatch time

    const ambulance: AmbulanceState = {
      dispatchRequired: true,
      priorityLevel: urgency as AmbulanceState['priorityLevel'],
      assignedAmbulanceId: primary.id,
      driverName: `Driver of ${primary.name}`,
      driverPhone: primary.phone,
      estimatedResponseTimeMinutes: eta
    };

    return { ambulance };

  } catch (error: any) {
    console.error('[AmbulanceAgent] Error matching ambulances:', error.message);
    return { ambulance: defaultState };
  }
};
