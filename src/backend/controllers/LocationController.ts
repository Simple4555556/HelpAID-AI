import { Request, Response } from 'express';
import { PlacesService, haversineDistance } from '../services/PlacesService.js';
import { LocationAgentService } from '../services/LocationAgentService.js';
import LocationCache from '../models/LocationCache.js';
import {
  getHospitals,
  getDoctors,
  getBloodBanks,
  getMedicalStores,
  getPoliceStations,
  getAmbulanceServices
} from '../../../db.js';

// Truncate coordinate to 3 decimal places (~110 m bucket)
function toBucket(value: number): string {
  return value.toFixed(3);
}

// Generic nearby handler with MongoDB cache for OSM elements only
async function handleNearbyRequest(req: Request, res: Response, getFacilitiesFn: () => Promise<any[]>, amenityOSM: string, googleType: string, defaultKeyword: string = '') {
  const { latitude, longitude, radius } = req.query;

  if (!latitude || !longitude) {
    return res.status(400).json({ error: 'Latitude and Longitude query parameters are required.' });
  }

  const userLat = parseFloat(latitude as string);
  const userLng = parseFloat(longitude as string);
  const searchRadius = parseFloat(radius as string) || 10000; // default 10km

  if (isNaN(userLat) || isNaN(userLng)) {
    return res.status(400).json({ error: 'Invalid coordinate values.' });
  }

  const latBucket = toBucket(userLat);
  const lngBucket = toBucket(userLng);

  try {
    // 1. Fetch OSM results (use cache first, then Overpass live)
    let osmResults: any[] = [];
    let fromCache = false;
    try {
      const cached = await LocationCache.findOne({
        latitudeBucket: latBucket,
        longitudeBucket: lngBucket,
        queryType: amenityOSM
      }).lean();

      if (cached && cached.results && cached.results.length > 0) {
        console.log(`[LocationController] Cache HIT for OSM ${amenityOSM} at (${latBucket}, ${lngBucket})`);
        osmResults = cached.results;
        fromCache = true;
      }
    } catch (cacheErr: any) {
      console.warn(`[LocationController] Cache lookup failed: ${cacheErr.message}`);
    }

    if (!fromCache) {
      console.log(`[LocationController] Cache MISS for OSM ${amenityOSM} at (${latBucket}, ${lngBucket}). Fetching live OSM...`);
      osmResults = await PlacesService.fetchOpenStreetMapNearby(userLat, userLng, searchRadius, amenityOSM);
      
      // Store OSM results in cache (fire-and-forget)
      if (osmResults.length > 0) {
        try {
          await LocationCache.findOneAndUpdate(
            { latitudeBucket: latBucket, longitudeBucket: lngBucket, queryType: amenityOSM },
            { results: osmResults, createdAt: new Date() },
            { returnDocument: 'after', upsert: true }
          );
        } catch (writeErr: any) {
          console.warn(`[LocationController] Cache write failed: ${writeErr.message}`);
        }
      }
    }

    // 2. Fetch live local DB entries
    const dbRecords = await getFacilitiesFn();
    const dbResults = dbRecords.map((item: any) => {
      const doc = item.toObject ? item.toObject() : item;
      const dist = haversineDistance(userLat, userLng, doc.latitude || doc.lat || 0, doc.longitude || doc.lng || 0);
      return { ...doc, distanceKm: dist };
    });

    // 3. Merge DB and OSM results (prioritizing DB)
    const seenNames = new Set<string>();
    const merged: any[] = [];

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
          open24x7: r.open24x7 || false,
          isLocalDb: true
        });
      }
    });

    osmResults.forEach((r: any) => {
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

    return res.json({
      success: true,
      count: sorted.length,
      coordinates: { latitude: userLat, longitude: userLng },
      radiusUsed: searchRadius,
      cached: fromCache,
      facilities: sorted.slice(0, 15) // Return top 15 to frontend
    });

  } catch (error: any) {
    console.error(`[Location Controller Error] Failed to fetch nearby facilities:`, error.message);
    return res.status(500).json({ error: 'Failed to process nearby search query.' });
  }
}

// ─── Reverse Geocode ────────────────────────────────────────────────────────
export const reverseGeocode = async (req: Request, res: Response) => {
  const { latitude, longitude } = req.query;

  if (!latitude || !longitude) {
    return res.status(400).json({ error: 'latitude and longitude query parameters are required.' });
  }

  const lat = parseFloat(latitude as string);
  const lng = parseFloat(longitude as string);

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: 'Invalid coordinate values.' });
  }

  const latBucket = toBucket(lat);
  const lngBucket = toBucket(lng);

  // Check cache
  try {
    const cached = await LocationCache.findOne({
      latitudeBucket: latBucket,
      longitudeBucket: lngBucket,
      queryType: 'reverse-geocode'
    }).lean();

    if (cached && cached.results && cached.results.length > 0) {
      return res.json({ success: true, cached: true, location: cached.results[0] });
    }
  } catch (err: any) {
    console.warn(`[ReverseGeocode] Cache lookup failed: ${err.message}`);
  }

  // Fetch from Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'HelpAidAI/1.0 (Emergency Medical App)' }
    });

    if (!response.ok) {
      throw new Error(`Nominatim returned status ${response.status}`);
    }

    const data = await response.json();
    const result = {
      display_name: data.display_name || 'Unknown Location',
      address: data.address || {},
      city: data.address?.city || data.address?.town || data.address?.village || '',
      state: data.address?.state || '',
      country: data.address?.country || '',
      postcode: data.address?.postcode || ''
    };

    // Cache the result
    try {
      await LocationCache.findOneAndUpdate(
        { latitudeBucket: latBucket, longitudeBucket: lngBucket, queryType: 'reverse-geocode' },
        { results: [result], createdAt: new Date() },
        { returnDocument: 'after', upsert: true }
      );
    } catch (writeErr: any) {
      console.warn(`[ReverseGeocode] Cache write failed: ${writeErr.message}`);
    }

    return res.json({ success: true, cached: false, location: result });
  } catch (error: any) {
    console.error(`[ReverseGeocode Error] Nominatim query failed, using coordinate fallback:`, error.message);
    const fallbackResult = {
      display_name: `Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      address: {},
      city: 'Local Area',
      state: '',
      country: '',
      postcode: ''
    };
    return res.json({ success: true, cached: false, location: fallbackResult, fallback: true });
  }
};

// Specific API exports
export const getNearbyHospitals = async (req: Request, res: Response) => {
  return handleNearbyRequest(req, res, getHospitals, 'hospital', 'hospital');
};

export const getNearbyDoctors = async (req: Request, res: Response) => {
  return handleNearbyRequest(req, res, getDoctors, 'doctors', 'doctor');
};

export const getNearbyBloodBanks = async (req: Request, res: Response) => {
  // Use 'health' type with 'blood bank' keyword for Google Places
  return handleNearbyRequest(req, res, getBloodBanks, 'blood_bank', 'health', 'blood bank');
};

export const getNearbyMedicalStores = async (req: Request, res: Response) => {
  return handleNearbyRequest(req, res, getMedicalStores, 'pharmacy', 'pharmacy');
};

export const getNearbyPoliceStations = async (req: Request, res: Response) => {
  return handleNearbyRequest(req, res, getPoliceStations, 'police', 'police');
};

export const getNearbyAmbulanceServices = async (req: Request, res: Response) => {
  return handleNearbyRequest(req, res, getAmbulanceServices, 'ambulance_station', 'health', 'ambulance service');
};

// Agent endpoint
export const locationAgentQuery = async (req: Request, res: Response) => {
  const { query, latitude, longitude } = req.body;
  
  if (!query || !latitude || !longitude) {
    return res.status(400).json({ error: 'Query, latitude, and longitude are required.' });
  }

  try {
    const result = await LocationAgentService.processQuery(query, parseFloat(latitude), parseFloat(longitude));
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: 'Agent failed to process query.' });
  }
};
