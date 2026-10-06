import { AgentState, LocationState } from './AgentState';
import { PlacesService } from '../services/PlacesService';

export const LocationAgent = async (state: AgentState): Promise<Partial<AgentState>> => {
  const lat = state.inputs.lat;
  const lng = state.inputs.lng;

  // Fallback defaults
  const defaultLocation: LocationState = {
    address: 'Lucknow, Uttar Pradesh, India (Default GPS Location)',
    city: 'Lucknow',
    district: 'Lucknow',
    state: 'Uttar Pradesh',
    landmarks: ['Hazratganj crossing', 'Charbagh station'],
    accessibilityScore: 8
  };

  if (!lat || !lng) {
    return { location: defaultLocation };
  }

  try {
    let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    let city = 'Lucknow';
    let district = 'Lucknow';
    let stateProvince = 'Uttar Pradesh';
    const landmarks: string[] = [];

    // 1. Fetch address details using Nominatim (OSM reverse geocoding)
    try {
      const geoUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      const geoRes = await fetch(geoUrl, {
        headers: { 'User-Agent': 'HelpAidAI/1.0', 'Accept-Language': 'en' }
      });
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        address = geoData.display_name || address;
        city = geoData.address?.city || geoData.address?.town || geoData.address?.village || geoData.address?.suburb || city;
        district = geoData.address?.county || geoData.address?.district || district;
        stateProvince = geoData.address?.state || stateProvince;
      }
    } catch (err: any) {
      console.warn(`[LocationAgent Warning] Nominatim reverse geocode failed: ${err.message}`);
    }

    // 2. Locate landmarks using OSM Overpass (radius 1500m)
    try {
      // Query schools, temples, parks, transit nodes nearby
      const osmLandmarks = await PlacesService.fetchOpenStreetMapNearby(lat, lng, 1500, 'place_of_worship');
      const schools = await PlacesService.fetchOpenStreetMapNearby(lat, lng, 1500, 'school');
      
      const combined = [...osmLandmarks, ...schools].slice(0, 3);
      combined.forEach(item => {
        if (item.name && !landmarks.includes(item.name)) {
          landmarks.push(item.name);
        }
      });
    } catch (err: any) {
      console.warn(`[LocationAgent Warning] Landmark search failed: ${err.message}`);
    }

    // If no landmarks found, add fallback based on address description
    if (landmarks.length === 0) {
      landmarks.push('Main Road Intersection');
    }

    const location: LocationState = {
      address,
      city,
      district,
      state: stateProvince,
      landmarks,
      accessibilityScore: 9 // standard default score
    };

    return { location };

  } catch (error: any) {
    console.error('[LocationAgent] Global geocoding error, using fallback:', error.message);
    return { location: defaultLocation };
  }
};
