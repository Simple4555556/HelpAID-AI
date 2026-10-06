import {
  getHospitals,
  getDoctors,
  getBloodBanks,
  getMedicalStores,
  getPoliceStations,
  getAmbulanceServices
} from '../../../db.js';

// Haversine formula for distance in km
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export class PlacesService {
  static async fetchOpenStreetMapNearby(lat: number, lng: number, radiusMeters: number, amenity: string): Promise<any[]> {
    const query = `[out:json];node(around:${radiusMeters},${lat},${lng})[amenity=${amenity}];out;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'HelpAidAI/1.0' } });
      if (!response.ok) throw new Error(`OSM Query failed: status ${response.status}`);
      const data = await response.json();
      if (data && data.elements) {
        return data.elements.map((el: any) => ({
          name: el.tags.name || `Nearby ${amenity.charAt(0).toUpperCase() + amenity.slice(1)}`,
          address: el.tags['addr:street'] || el.tags['addr:full'] || 'OpenStreetMap Location',
          city: el.tags['addr:city'] || '',
          latitude: el.lat,
          longitude: el.lon,
          lat: el.lat,
          lng: el.lon,
          phone: el.tags.phone || el.tags['contact:phone'] || 'N/A',
          open24x7: el.tags.opening_hours === '24/7'
        }));
      }
    } catch (err: any) {
      console.warn(`[PlacesService Warning] OSM query failed: ${err.message}`);
    }
    return [];
  }

  static async fetchGooglePlacesNearby(lat: number, lng: number, radiusMeters: number, placeType: string, keyword: string = ''): Promise<any[]> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    if (!apiKey) return [];
    
    // Note: If keyword is provided it helps narrow down (e.g., 'cardiologist')
    const keywordParam = keyword ? `&keyword=${encodeURIComponent(keyword)}` : '';
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusMeters}&type=${placeType}${keywordParam}&key=${apiKey}`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Google Places Query failed: status ${response.status}`);
      const data = await response.json();
      if (data && data.results) {
        return data.results.map((place: any) => ({
          name: place.name,
          address: place.vicinity || 'Google Maps Location',
          latitude: place.geometry.location.lat,
          longitude: place.geometry.location.lng,
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
          phone: 'N/A', // Place Search doesn't return phone number without Place Details API
          open24x7: place.opening_hours ? place.opening_hours.open_now : null,
          rating: place.rating || null,
          place_id: place.place_id
        }));
      }
    } catch (err: any) {
      console.warn(`[PlacesService Warning] Google Places query failed: ${err.message}`);
    }
    return [];
  }

  static async getNearbyFacilities(userLat: number, userLng: number, searchRadius: number, getFacilitiesFn: () => Promise<any[]>, amenityOSM: string, googleType: string, keyword: string = ''): Promise<any[]> {
    console.log(`[PlacesService] Fetching nearby ${amenityOSM} using open-source OSM Overpass and local DB.`);
    
    // 1. Fetch from OpenStreetMap Overpass (Free API)
    const results = await this.fetchOpenStreetMapNearby(userLat, userLng, searchRadius, amenityOSM);

    // 2. Fetch/Merge with local DB entries
    const dbRecords = await getFacilitiesFn();
    const dbResults = dbRecords.map((item: any) => {
      const doc = item.toObject ? item.toObject() : item;
      const dist = haversineDistance(userLat, userLng, doc.latitude || doc.lat || 0, doc.longitude || doc.lng || 0);
      return { ...doc, distanceKm: dist };
    });

    const seenNames = new Set<string>();
    const merged: any[] = [];

    // Prioritize DB results, then OSM API results
    dbResults.forEach((r: any) => {
      if (r.distanceKm <= (searchRadius / 1000)) { 
        seenNames.add(r.name.toLowerCase());
        merged.push({
          name: r.name,
          address: r.address || `${r.city || ''}, ${r.state || ''}`,
          distance: r.distanceKm,
          distanceKm: r.distanceKm,
          latitude: r.latitude || r.lat,
          longitude: r.longitude || r.lng,
          lat: r.latitude || r.lat,
          lng: r.longitude || r.lng,
          phone: r.phone || 'N/A',
          open24x7: r.open24x7 || false
        });
      }
    });

    results.forEach((r: any) => {
      const nameKey = r.name.toLowerCase();
      if (!seenNames.has(nameKey)) {
        seenNames.add(nameKey);
        const dist = haversineDistance(userLat, userLng, r.latitude, r.longitude);
        merged.push({
          name: r.name,
          address: r.address,
          distance: dist,
          distanceKm: dist,
          latitude: r.latitude,
          longitude: r.longitude,
          lat: r.latitude,
          lng: r.longitude,
          phone: r.phone || 'N/A',
          open24x7: r.open24x7 || false
        });
      }
    });

    // Sort by distance
    const sorted = merged.sort((a, b) => a.distance - b.distance);
    return sorted;
  }
}
