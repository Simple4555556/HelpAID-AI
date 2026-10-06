import { PlacesService } from './PlacesService.js';
import {
  getHospitals,
  getDoctors,
  getBloodBanks,
  getMedicalStores,
  getPoliceStations,
  getAmbulanceServices
} from '../../../db.js';

export class LocationAgentService {
  /**
   * Process a natural language query and map it to a specific place search.
   * Simple intent parser (can be expanded with an LLM later).
   */
  static async processQuery(query: string, userLat: number, userLng: number): Promise<any> {
    const q = query.toLowerCase();
    
    let type = '';
    let keyword = '';
    let getFn: any = null;
    let osmType = '';
    
    if (q.includes('hospital') || q.includes('trauma')) {
      type = 'hospital';
      osmType = 'hospital';
      getFn = getHospitals;
      if (q.includes('trauma')) keyword = 'trauma center';
    } else if (q.includes('blood bank')) {
      // Note: Google places doesn't have a specific "blood_bank" type, so we use 'health' + keyword or 'hospital' + keyword
      type = 'health';
      keyword = 'blood bank';
      osmType = 'blood_bank';
      getFn = getBloodBanks;
    } else if (q.includes('doctor') || q.includes('cardiologist') || q.includes('dentist')) {
      type = 'doctor';
      osmType = 'doctors';
      getFn = getDoctors;
      if (q.includes('cardiologist')) keyword = 'cardiologist';
      if (q.includes('dentist')) keyword = 'dentist';
    } else if (q.includes('medical store') || q.includes('pharmacy') || q.includes('medicine')) {
      type = 'pharmacy';
      osmType = 'pharmacy';
      getFn = getMedicalStores;
    } else if (q.includes('police')) {
      type = 'police';
      osmType = 'police';
      getFn = getPoliceStations;
    } else if (q.includes('ambulance')) {
      type = 'health';
      keyword = 'ambulance service';
      osmType = 'ambulance_station';
      getFn = getAmbulanceServices;
    } else {
      // Default to hospital search if not understood
      type = 'hospital';
      osmType = 'hospital';
      getFn = getHospitals;
    }

    // Default search radius is 5km, but we can parse "within 10 km" etc.
    let radius = 5000;
    const kmMatch = q.match(/(\d+)\s*km/);
    if (kmMatch && kmMatch[1]) {
      radius = parseInt(kmMatch[1], 10) * 1000;
    }

    try {
      const results = await PlacesService.getNearbyFacilities(userLat, userLng, radius, getFn, osmType, type, keyword);
      // Return top 5 results for the chat agent
      return {
        intent: { type, keyword, radius },
        results: results.slice(0, 5)
      };
    } catch (err) {
      console.error('[LocationAgentService]', err);
      return { error: 'Failed to process location query.' };
    }
  }
}
