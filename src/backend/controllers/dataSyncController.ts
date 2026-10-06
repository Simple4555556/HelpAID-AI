import { Request, Response } from 'express';
import {
  upsertHospital,
  upsertBloodBank,
  upsertMedicalStore,
  upsertPoliceStation,
  upsertAmbulanceService,
  createImportLog
} from '../../../db.js';

// Coordinates list for Lucknow, Kanpur Nagar, Kanpur Dehat, Unnao, Nawabganj
const BBOXES = [
  { name: 'Lucknow', bbox: '26.70,80.80,26.95,81.10', city: 'Lucknow', district: 'Lucknow', state: 'Uttar Pradesh' },
  { name: 'Kanpur Nagar', bbox: '26.35,80.20,26.55,80.45', city: 'Kanpur', district: 'Kanpur Nagar', state: 'Uttar Pradesh' },
  { name: 'Kanpur Dehat', bbox: '26.35,79.65,26.55,79.95', city: 'Akbarpur', district: 'Kanpur Dehat', state: 'Uttar Pradesh' },
  { name: 'Unnao', bbox: '26.45,80.40,26.62,80.60', city: 'Unnao', district: 'Unnao', state: 'Uttar Pradesh' },
  { name: 'Nawabganj', bbox: '26.80,81.10,26.92,81.25', city: 'Nawabganj', district: 'Unnao', state: 'Uttar Pradesh' }
];

export async function syncOSMData(req: Request, res: Response) {
  let totalImported = 0;
  let totalErrors = 0;
  const errors: string[] = [];

  try {
    for (const area of BBOXES) {
      console.log(`[OSM Sync] Querying OSM for ${area.name}...`);
      
      // Query Overpass for hospitals, pharmacies (medical stores), blood banks, police stations
      const query = `
        [out:json][timeout:90];
        (
          node(${area.bbox})[amenity=hospital];
          way(${area.bbox})[amenity=hospital];
          node(${area.bbox})[amenity=pharmacy];
          way(${area.bbox})[amenity=pharmacy];
          node(${area.bbox})[amenity=police];
          way(${area.bbox})[amenity=police];
          node(${area.bbox})[emergency=ambulance_station];
          way(${area.bbox})[emergency=ambulance_station];
          node(${area.bbox})[amenity=blood_bank];
          way(${area.bbox})[amenity=blood_bank];
        );
        out center;
      `;
      
      const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
      const response = await fetch(url, { headers: { 'User-Agent': 'HelpAidAI/1.0' } });
      if (!response.ok) {
        throw new Error(`OSM Server returned status ${response.status} for ${area.name}`);
      }
      
      const data = await response.json();
      if (!data || !data.elements) continue;

      for (const el of data.elements) {
        const tags = el.tags || {};
        const name = tags.name;
        const lat = el.lat || (el.center && el.center.lat);
        const lon = el.lon || (el.center && el.center.lon);
        
        // ── VALIDATION RULES ──
        if (!name) {
          totalErrors++;
          errors.push(`[${area.name}] Rejected: Record missing name tag.`);
          continue;
        }
        
        const address = tags['addr:street'] || tags['addr:full'] || tags['addr:housename'] || `${area.city}, ${area.state}`;
        const phone = tags.phone || tags['contact:phone'] || '';
        const pincode = tags['addr:pincode'] || tags['addr:postcode'] || '';
        const email = tags.email || tags['contact:email'] || '';
        const website = tags.website || tags['contact:website'] || '';

        // Validate Coordinates
        if (!lat || !lon || isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180 || (lat === 0 && lon === 0)) {
          totalErrors++;
          errors.push(`[${area.name}] Rejected "${name}": Invalid coordinates (${lat}, ${lon}).`);
          continue;
        }

        // Validate Phone (if exists, must be simple valid phone check)
        if (phone && phone.replace(/\s+/g, '').length < 5) {
          totalErrors++;
          errors.push(`[${area.name}] Rejected "${name}": Invalid phone format "${phone}".`);
          continue;
        }

        const commonData = {
          name,
          address,
          city: area.city,
          district: area.district,
          state: area.state,
          pincode,
          phone: phone || 'N/A',
          latitude: lat,
          longitude: lon,
          verified: true,
          source: 'OpenStreetMap',
          lastUpdated: new Date()
        };

        // Determine collection type based on amenity
        if (tags.amenity === 'hospital') {
          const type = tags.healthcare === 'clinic' ? 'Clinic' : 'General';
          const specializations = (tags.speciality || tags.specialities || 'General Medicine').split(';').map((s: string) => s.trim());
          await upsertHospital(
            { name, city: area.city },
            {
              ...commonData,
              type,
              email,
              website,
              specializations,
              emergencyAvailable: tags.emergency === 'yes' || true,
              open24x7: tags.opening_hours === '24/7' || true
            }
          );
          totalImported++;
        } else if (tags.amenity === 'pharmacy') {
          await upsertMedicalStore(
            { name, city: area.city },
            {
              ...commonData,
              open24x7: tags.opening_hours === '24/7'
            }
          );
          totalImported++;
        } else if (tags.amenity === 'police') {
          await upsertPoliceStation(
            { name, city: area.city },
            commonData
          );
          totalImported++;
        } else if (tags.emergency === 'ambulance_station' || tags.amenity === 'ambulance_station') {
          await upsertAmbulanceService(
            { name, phone: phone || '108' },
            {
              ...commonData,
              phone: phone || '108',
              vehicleType: 'Basic',
              chargePerKm: 15,
              available: true
            }
          );
          totalImported++;
        } else if (tags.amenity === 'blood_bank' || tags.healthcare === 'blood_bank') {
          await upsertBloodBank(
            { name, city: area.city },
            {
              ...commonData,
              availableBloodGroups: ['A+', 'B+', 'O+', 'AB+'],
              open24x7: tags.opening_hours === '24/7' || true
            }
          );
          totalImported++;
        }
      }
    }

    // Save Import Logs
    await createImportLog({
      successCount: totalImported,
      errorCount: totalErrors,
      errors: errors.slice(0, 50), // store top 50 errors
      source: 'OpenStreetMap API',
      targetCollection: 'All Directory Collections'
    });

    return res.json({
      success: true,
      message: `OSM synchronization complete. Imported ${totalImported} records, ${totalErrors} validation rejections.`,
      importedCount: totalImported,
      errorCount: totalErrors,
      errors
    });

  } catch (err: any) {
    console.error('[OSM Sync Error]:', err.message);
    
    await createImportLog({
      successCount: totalImported,
      errorCount: totalErrors + 1,
      errors: [...errors, `Fatal Error: ${err.message}`],
      source: 'OpenStreetMap API',
      targetCollection: 'All Directory Collections'
    });

    return res.status(500).json({
      error: `Failed to complete OSM synchronization: ${err.message}`,
      importedCount: totalImported,
      errorCount: totalErrors
    });
  }
}
