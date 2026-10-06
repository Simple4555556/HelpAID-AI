import { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import {
  getHospitals,
  getDoctors,
  getBloodBanks,
  getMedicalStores,
  getPoliceStations,
  getAmbulanceServices,
  getDiseases,
  getSymptoms,
  getFirstAids,
  getMedicines,
  upsertHospital,
  upsertDoctor,
  upsertBloodBank,
  upsertMedicalStore,
  upsertPoliceStation,
  upsertAmbulanceService,
  upsertDisease,
  upsertSymptom,
  upsertFirstAid,
  upsertMedicine,
  createImportLog
} from '../../../db.js';

// Initialize Gemini
const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Helper to generate embedding using text-embedding-004
async function generateSemanticEmbedding(text: string): Promise<number[]> {
  if (!apiKey || !text || text.trim() === '') return [];
  try {
    const response: any = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: text
    });
    if (response) {
      if (response.embedding && response.embedding.values) {
        return response.embedding.values;
      }
      if (response.embeddings && response.embeddings.values) {
        return response.embeddings.values;
      }
    }
  } catch (error: any) {
    console.warn('[Embeddings Warning] Gemini embedding generation failed:', error.message);
  }
  return [];
}

// Field Normalizer
function normalizeRowKeys(row: any): any {
  const normalized: any = {};
  const mapping: { [key: string]: string } = {
    'name': 'name', 'title': 'name', 'doctorname': 'name', 'hospitalname': 'name', 'bankname': 'name', 'storename': 'name', 'stationname': 'name',
    'address': 'address', 'location': 'address', 'addr': 'address',
    'city': 'city', 'town': 'city', 'district': 'district', 'state': 'state', 'pincode': 'pincode', 'zip': 'pincode', 'zipcode': 'pincode',
    'latitude': 'latitude', 'lat': 'latitude', 'longitude': 'longitude', 'lng': 'longitude', 'long': 'longitude',
    'specialization': 'specialization', 'specialty': 'specialization', 'specialties': 'specialization', 'specializations': 'specialization',
    'services': 'services', 'treatment': 'services', 'treatments': 'services', 'facilities': 'services', 'servicetype': 'services',
    'phone': 'phone', 'contact': 'phone', 'contactnumber': 'phone', 'phonenumber': 'phone', 'mobile': 'phone',
    'status': 'status', 'availability': 'status', 'active': 'status',
    'description': 'description', 'desc': 'description', 'details': 'description',
    'medicines': 'medicines', 'medicine': 'medicines', 'drugs': 'medicines',
    'precautions': 'precautions', 'precaution': 'precautions',
    'symptoms': 'symptomsList', 'symptomslist': 'symptomsList',
    'steps': 'steps', 'instructions': 'steps', 'warnings': 'warnings', 'warning': 'warnings', 'urgency': 'urgency'
  };

  for (const key of Object.keys(row)) {
    const rawKey = key.toLowerCase().trim().replace(/[\s_\-\+]+/g, '');
    const mappedKey = mapping[rawKey] || key;
    normalized[mappedKey] = row[key];
  }
  return normalized;
}

// Helper to parse double quotes and commas correctly
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

function parseCSV(content: string): any[] {
  if (!content) return [];
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length <= 1) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, ''));
  const results: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const obj: any = {};
    headers.forEach((header, index) => {
      if (header) {
        obj[header] = values[index] !== undefined ? values[index].trim() : '';
      }
    });
    results.push(obj);
  }
  return results;
}

// Validation Helpers
function isValidCoordinate(lat: number, lng: number): boolean {
  if (isNaN(lat) || isNaN(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function isValidPhone(phone: string): boolean {
  if (!phone || phone === 'N/A' || phone === 'Local availability' || phone === 'VERIFY_REQUIRED') return true;
  const clean = phone.replace(/[^0-9+]/g, '');
  return clean.length >= 5;
}

export async function importCSV(req: Request, res: Response) {
  if (!req.file) {
    return res.status(400).json({ error: 'No dataset file uploaded.' });
  }

  const fileType = (req.query.type as string) || req.file.originalname.toLowerCase();
  const rawContent = req.file.buffer.toString('utf8');
  let parsedRows: any[] = [];

  // Support JSON and CSV
  if (req.file.originalname.endsWith('.json') || rawContent.trim().startsWith('{') || rawContent.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(rawContent);
      parsedRows = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      return res.status(400).json({ error: 'Failed to parse JSON file content.' });
    }
  } else {
    parsedRows = parseCSV(rawContent);
  }

  if (!parsedRows.length) {
    return res.status(400).json({ error: 'The uploaded file is empty or invalid.' });
  }

  let importedCount = 0;
  let errorCount = 0;
  const errors: string[] = [];
  let targetCollection = '';

  try {
    if (fileType.includes('hospital') || fileType.includes('clinic')) {
      targetCollection = 'Hospitals';
      const existing = await getHospitals();
      const existingKeys = new Set(existing.map(h => `${h.name.toLowerCase()}|${(h.city || '').toLowerCase()}`));
      const fileKeys = new Set<string>();

      for (let idx = 0; idx < parsedRows.length; idx++) {
        const rawRow = parsedRows[idx];
        const row = normalizeRowKeys(rawRow);
        const lineNum = idx + 2;

        if (!row.name) {
          errorCount++;
          errors.push(`Line ${lineNum}: Missing name.`);
          continue;
        }
        if (!row.address) {
          errorCount++;
          errors.push(`Line ${lineNum}: Missing address for "${row.name}".`);
          continue;
        }

        const lat = parseFloat(row.latitude || '0');
        const lng = parseFloat(row.longitude || '0');
        if (!isValidCoordinate(lat, lng)) {
          errorCount++;
          errors.push(`Line ${lineNum}: Invalid coordinates (${lat}, ${lng}) for "${row.name}".`);
          continue;
        }

        const phone = row.phone || '';
        if (!isValidPhone(phone)) {
          errorCount++;
          errors.push(`Line ${lineNum}: Invalid phone number format "${phone}" for "${row.name}".`);
          continue;
        }

        const key = `${row.name.toLowerCase()}|${(row.city || '').toLowerCase()}`;
        if (existingKeys.has(key) || fileKeys.has(key)) {
          errorCount++;
          errors.push(`Line ${lineNum}: Duplicate entry detected for "${row.name}".`);
          continue;
        }
        fileKeys.add(key);

        const specializations = (row.specialization || row.services || 'General Medicine')
          .split(';')
          .map((s: string) => s.trim())
          .filter(Boolean);

        // Generate embedding text block
        const textBlock = `${row.name}. ${row.address}, ${row.city || ''}. Services: ${specializations.join(', ')}`;
        const embedding = await generateSemanticEmbedding(textBlock);

        await upsertHospital(
          { name: row.name, city: row.city || '' },
          {
            name: row.name,
            type: row.type || 'General',
            address: row.address,
            city: row.city || '',
            district: row.district || '',
            state: row.state || '',
            pincode: row.pincode || '',
            phone: phone || 'N/A',
            latitude: lat,
            longitude: lng,
            specializations,
            emergencyAvailable: true,
            open24x7: String(row.status).toLowerCase().includes('24/7') || String(row.open24x7).toLowerCase() === 'true',
            verified: true,
            source: 'CSV Import',
            embedding
          }
        );
        importedCount++;
      }

    } else if (fileType.includes('doctor')) {
      targetCollection = 'Doctors';
      const existing = await getDoctors();
      const existingKeys = new Set(existing.map(d => `${d.name.toLowerCase()}|${d.specialization.toLowerCase()}`));
      const fileKeys = new Set<string>();

      for (let idx = 0; idx < parsedRows.length; idx++) {
        const rawRow = parsedRows[idx];
        const row = normalizeRowKeys(rawRow);
        const lineNum = idx + 2;

        if (!row.name) {
          errorCount++;
          errors.push(`Line ${lineNum}: Missing doctor name.`);
          continue;
        }
        if (!row.specialization) {
          errorCount++;
          errors.push(`Line ${lineNum}: Missing specialization for "${row.name}".`);
          continue;
        }

        const phone = row.phone || '';
        if (!isValidPhone(phone)) {
          errorCount++;
          errors.push(`Line ${lineNum}: Invalid phone number format "${phone}" for "${row.name}".`);
          continue;
        }

        const key = `${row.name.toLowerCase()}|${row.specialization.toLowerCase()}`;
        if (existingKeys.has(key) || fileKeys.has(key)) {
          errorCount++;
          errors.push(`Line ${lineNum}: Duplicate entry detected for Dr. "${row.name}".`);
          continue;
        }
        fileKeys.add(key);

        const lat = parseFloat(row.latitude || '0');
        const lng = parseFloat(row.longitude || '0');

        const textBlock = `${row.name}. Specialization: ${row.specialization}. Hospital: ${row.hospital || ''}. Clinic: ${row.clinic || ''}. City: ${row.city || ''}`;
        const embedding = await generateSemanticEmbedding(textBlock);

        await upsertDoctor(
          { name: row.name, specialization: row.specialization },
          {
            name: row.name,
            specialization: row.specialization,
            clinic: row.clinic || '',
            hospital: row.hospital || '',
            phone: phone || 'N/A',
            city: row.city || '',
            district: row.district || '',
            experience: parseInt(row.experience, 10) || 5,
            availability: (row.status || '').split(';').map((s: string) => s.trim()).filter(Boolean),
            verified: true,
            source: 'CSV Import',
            lat: lat || 26.55,
            lng: lng || 80.49,
            embedding
          }
        );
        importedCount++;
      }

    } else if (fileType.includes('blood_bank') || fileType.includes('bloodbanks')) {
      targetCollection = 'Blood Banks';
      const existing = await getBloodBanks();
      const existingKeys = new Set(existing.map(b => `${b.name.toLowerCase()}|${(b.city || '').toLowerCase()}`));
      const fileKeys = new Set<string>();

      for (let idx = 0; idx < parsedRows.length; idx++) {
        const rawRow = parsedRows[idx];
        const row = normalizeRowKeys(rawRow);
        const lineNum = idx + 2;

        if (!row.name) {
          errorCount++;
          errors.push(`Line ${lineNum}: Missing name.`);
          continue;
        }
        if (!row.address) {
          errorCount++;
          errors.push(`Line ${lineNum}: Missing address for "${row.name}".`);
          continue;
        }

        const lat = parseFloat(row.latitude || '0');
        const lng = parseFloat(row.longitude || '0');
        if (!isValidCoordinate(lat, lng)) {
          errorCount++;
          errors.push(`Line ${lineNum}: Invalid coordinates (${lat}, ${lng}) for "${row.name}".`);
          continue;
        }

        const phone = row.phone || '';
        const key = `${row.name.toLowerCase()}|${(row.city || '').toLowerCase()}`;
        if (existingKeys.has(key) || fileKeys.has(key)) {
          errorCount++;
          errors.push(`Line ${lineNum}: Duplicate entry detected for "${row.name}".`);
          continue;
        }
        fileKeys.add(key);

        const groups = (row.services || row.bloodGroups || 'A+;B+;O+').split(';').map((s: string) => s.trim()).filter(Boolean);
        const textBlock = `${row.name}. Address: ${row.address}, City: ${row.city || ''}. Available groups: ${groups.join(', ')}`;
        const embedding = await generateSemanticEmbedding(textBlock);

        await upsertBloodBank(
          { name: row.name, city: row.city || '' },
          {
            name: row.name,
            address: row.address,
            city: row.city || '',
            district: row.district || '',
            phone: phone || 'N/A',
            latitude: lat,
            longitude: lng,
            availableBloodGroups: groups,
            open24x7: true,
            verified: true,
            source: 'CSV Import',
            embedding
          }
        );
        importedCount++;
      }

    } else if (fileType.includes('medical_store') || fileType.includes('medicalstores') || fileType.includes('pharmacy')) {
      targetCollection = 'Medical Stores';
      const existing = await getMedicalStores();
      const existingKeys = new Set(existing.map(m => `${m.name.toLowerCase()}|${(m.city || '').toLowerCase()}`));
      const fileKeys = new Set<string>();

      for (let idx = 0; idx < parsedRows.length; idx++) {
        const rawRow = parsedRows[idx];
        const row = normalizeRowKeys(rawRow);
        const lineNum = idx + 2;

        if (!row.name) {
          errorCount++;
          errors.push(`Line ${lineNum}: Missing name.`);
          continue;
        }
        if (!row.address) {
          errorCount++;
          errors.push(`Line ${lineNum}: Missing address for "${row.name}".`);
          continue;
        }

        const lat = parseFloat(row.latitude || '0');
        const lng = parseFloat(row.longitude || '0');
        if (!isValidCoordinate(lat, lng)) {
          errorCount++;
          errors.push(`Line ${lineNum}: Invalid coordinates (${lat}, ${lng}) for "${row.name}".`);
          continue;
        }

        const phone = row.phone || '';
        const key = `${row.name.toLowerCase()}|${(row.city || '').toLowerCase()}`;
        if (existingKeys.has(key) || fileKeys.has(key)) {
          errorCount++;
          errors.push(`Line ${lineNum}: Duplicate entry detected for "${row.name}".`);
          continue;
        }
        fileKeys.add(key);

        const textBlock = `${row.name}. Address: ${row.address}, City: ${row.city || ''}. Phone: ${phone}`;
        const embedding = await generateSemanticEmbedding(textBlock);

        await upsertMedicalStore(
          { name: row.name, city: row.city || '' },
          {
            name: row.name,
            address: row.address,
            city: row.city || '',
            district: row.district || '',
            phone: phone || 'N/A',
            latitude: lat,
            longitude: lng,
            open24x7: true,
            verified: true,
            source: 'CSV Import',
            embedding
          }
        );
        importedCount++;
      }

    } else if (fileType.includes('police_station') || fileType.includes('policestations') || fileType.includes('police')) {
      targetCollection = 'Police Stations';
      const existing = await getPoliceStations();
      const existingKeys = new Set(existing.map(p => `${p.name.toLowerCase()}|${(p.city || '').toLowerCase()}`));
      const fileKeys = new Set<string>();

      for (let idx = 0; idx < parsedRows.length; idx++) {
        const rawRow = parsedRows[idx];
        const row = normalizeRowKeys(rawRow);
        const lineNum = idx + 2;

        if (!row.name) {
          errorCount++;
          errors.push(`Line ${lineNum}: Missing name.`);
          continue;
        }
        if (!row.address) {
          errorCount++;
          errors.push(`Line ${lineNum}: Missing address for "${row.name}".`);
          continue;
        }

        const lat = parseFloat(row.latitude || '0');
        const lng = parseFloat(row.longitude || '0');
        if (!isValidCoordinate(lat, lng)) {
          errorCount++;
          errors.push(`Line ${lineNum}: Invalid coordinates (${lat}, ${lng}) for "${row.name}".`);
          continue;
        }

        const phone = row.phone || '';
        const key = `${row.name.toLowerCase()}|${(row.city || '').toLowerCase()}`;
        if (existingKeys.has(key) || fileKeys.has(key)) {
          errorCount++;
          errors.push(`Line ${lineNum}: Duplicate entry detected for "${row.name}".`);
          continue;
        }
        fileKeys.add(key);

        const textBlock = `${row.name}. Address: ${row.address}, City: ${row.city || ''}. Contact: ${phone}`;
        const embedding = await generateSemanticEmbedding(textBlock);

        await upsertPoliceStation(
          { name: row.name, city: row.city || '' },
          {
            name: row.name,
            address: row.address,
            city: row.city || '',
            district: row.district || '',
            phone: phone || 'N/A',
            latitude: lat,
            longitude: lng,
            verified: true,
            source: 'CSV Import',
            embedding
          }
        );
        importedCount++;
      }

    } else if (fileType.includes('ambulance')) {
      targetCollection = 'Ambulance Services';
      const existing = await getAmbulanceServices();
      const existingKeys = new Set(existing.map(a => `${a.name.toLowerCase()}|${(a.city || '').toLowerCase()}`));
      const fileKeys = new Set<string>();

      for (let idx = 0; idx < parsedRows.length; idx++) {
        const rawRow = parsedRows[idx];
        const row = normalizeRowKeys(rawRow);
        const lineNum = idx + 2;

        if (!row.name) {
          errorCount++;
          errors.push(`Line ${lineNum}: Missing ambulance name.`);
          continue;
        }

        const lat = parseFloat(row.latitude || '0');
        const lng = parseFloat(row.longitude || '0');
        const phone = row.phone || '';
        const key = `${row.name.toLowerCase()}|${(row.city || '').toLowerCase()}`;
        if (existingKeys.has(key) || fileKeys.has(key)) {
          errorCount++;
          errors.push(`Line ${lineNum}: Duplicate entry detected for "${row.name}".`);
          continue;
        }
        fileKeys.add(key);

        const textBlock = `${row.name}. Ambulance vehicle type: ${row.services || 'Basic'}. City: ${row.city || ''}`;
        const embedding = await generateSemanticEmbedding(textBlock);

        await upsertAmbulanceService(
          { name: row.name, city: row.city || '' },
          {
            name: row.name,
            phone: phone || '108',
            address: row.address || 'Emergency Response Base',
            city: row.city || '',
            district: row.district || '',
            state: row.state || '',
            latitude: lat || 26.55,
            longitude: lng || 80.49,
            vehicleType: row.services || 'Basic',
            chargePerKm: 0,
            available: true,
            verified: true,
            source: 'CSV Import',
            embedding
          }
        );
        importedCount++;
      }

    } else if (fileType.includes('disease')) {
      targetCollection = 'Diseases';
      const existing = await getDiseases();
      const existingKeys = new Set(existing.map(d => d.name.toLowerCase()));
      const fileKeys = new Set<string>();

      for (let idx = 0; idx < parsedRows.length; idx++) {
        const rawRow = parsedRows[idx];
        const row = normalizeRowKeys(rawRow);
        const lineNum = idx + 2;

        if (!row.name) {
          errorCount++;
          errors.push(`Line ${lineNum}: Missing disease name.`);
          continue;
        }

        const key = row.name.toLowerCase();
        if (existingKeys.has(key) || fileKeys.has(key)) {
          errorCount++;
          errors.push(`Line ${lineNum}: Duplicate entry detected for disease "${row.name}".`);
          continue;
        }
        fileKeys.add(key);

        const medicines = (row.medicines || '').split(';').map((s: string) => s.trim()).filter(Boolean);
        const precautions = (row.precautions || '').split(';').map((s: string) => s.trim()).filter(Boolean);
        const symptomsList = (row.symptomsList || '').split(';').map((s: string) => s.trim()).filter(Boolean);

        const textBlock = `${row.name}. Description: ${row.description || ''}. Symptoms: ${symptomsList.join(', ')}. Precautions: ${precautions.join(', ')}`;
        const embedding = await generateSemanticEmbedding(textBlock);

        await upsertDisease(
          { name: row.name },
          {
            name: row.name,
            description: row.description || '',
            medicines,
            precautions,
            symptomsList,
            embedding
          }
        );
        importedCount++;
      }

    } else if (fileType.includes('symptom')) {
      targetCollection = 'Symptoms';
      const existing = await getSymptoms();
      const existingKeys = new Set(existing.map(s => s.name.toLowerCase()));
      const fileKeys = new Set<string>();

      for (let idx = 0; idx < parsedRows.length; idx++) {
        const rawRow = parsedRows[idx];
        const row = normalizeRowKeys(rawRow);
        const lineNum = idx + 2;

        if (!row.name) {
          errorCount++;
          errors.push(`Line ${lineNum}: Missing symptom name.`);
          continue;
        }

        const key = row.name.toLowerCase();
        if (existingKeys.has(key) || fileKeys.has(key)) {
          errorCount++;
          errors.push(`Line ${lineNum}: Duplicate entry detected for symptom "${row.name}".`);
          continue;
        }
        fileKeys.add(key);

        const textBlock = `${row.name}. Severity: ${row.severity || 'LOW'}. Duration: ${row.typicalDuration || ''}`;
        const embedding = await generateSemanticEmbedding(textBlock);

        await upsertSymptom(
          { name: row.name },
          {
            name: row.name,
            severity: row.severity || 'LOW',
            typicalDuration: row.typicalDuration || '',
            embedding
          }
        );
        importedCount++;
      }

    } else if (fileType.includes('first_aid') || fileType.includes('firstaid')) {
      targetCollection = 'First Aids';
      const existing = await getFirstAids();
      const existingKeys = new Set(existing.map(fa => fa.title.toLowerCase()));
      const fileKeys = new Set<string>();

      for (let idx = 0; idx < parsedRows.length; idx++) {
        const rawRow = parsedRows[idx];
        const row = normalizeRowKeys(rawRow);
        const lineNum = idx + 2;

        if (!row.name) { // 'name' mapped from title
          errorCount++;
          errors.push(`Line ${lineNum}: Missing title for first aid guide.`);
          continue;
        }

        const key = row.name.toLowerCase();
        if (existingKeys.has(key) || fileKeys.has(key)) {
          errorCount++;
          errors.push(`Line ${lineNum}: Duplicate entry detected for first aid guide "${row.name}".`);
          continue;
        }
        fileKeys.add(key);

        const steps = (row.steps || '').split(';').map((s: string) => s.trim()).filter(Boolean);
        const warnings = (row.warnings || '').split(';').map((s: string) => s.trim()).filter(Boolean);

        const textBlock = `${row.name} first aid steps. Steps: ${steps.join('. ')}. Warnings: ${warnings.join('. ')}`;
        const embedding = await generateSemanticEmbedding(textBlock);

        await upsertFirstAid(
          { title: row.name },
          {
            title: row.name,
            urgency: row.urgency || 'MEDIUM',
            steps,
            warnings,
            embedding
          }
        );
        importedCount++;
      }

    } else if (fileType.includes('medicine')) {
      targetCollection = 'Medicines';
      const existing = await getMedicines();
      const existingKeys = new Set(existing.map(m => m.name.toLowerCase()));
      const fileKeys = new Set<string>();

      for (let idx = 0; idx < parsedRows.length; idx++) {
        const rawRow = parsedRows[idx];
        const row = normalizeRowKeys(rawRow);
        const lineNum = idx + 2;

        if (!row.name) {
          errorCount++;
          errors.push(`Line ${lineNum}: Missing medicine name.`);
          continue;
        }

        const key = row.name.toLowerCase();
        if (existingKeys.has(key) || fileKeys.has(key)) {
          errorCount++;
          errors.push(`Line ${lineNum}: Duplicate entry detected for medicine "${row.name}".`);
          continue;
        }
        fileKeys.add(key);

        const sideEffects = (row.warnings || '').split(';').map((s: string) => s.trim()).filter(Boolean); // warnings mapped to sideEffects
        const textBlock = `${row.name} (${row.category || ''}). Description: ${row.description || ''}`;
        const embedding = await generateSemanticEmbedding(textBlock);

        await upsertMedicine(
          { name: row.name },
          {
            name: row.name,
            category: row.category || '',
            dosageForm: row.dosageForm || '',
            sideEffects,
            description: row.description || '',
            embedding
          }
        );
        importedCount++;
      }

    } else {
      return res.status(400).json({
        error: 'Unsupported file or entity type. File name must include "hospital", "doctor", "blood_bank", "medical_store", "police_station", "ambulance", "disease", "symptom", "first_aid", or "medicine".'
      });
    }

    await createImportLog({
      successCount: importedCount,
      errorCount: errorCount,
      errors: errors.slice(0, 50),
      source: 'CSV Bulk Upload',
      targetCollection: targetCollection
    });

    return res.json({
      success: true,
      message: `Successfully processed file. Imported ${importedCount} records. Rejected ${errorCount} records.`,
      collection: targetCollection,
      count: importedCount,
      errors: errors
    });

  } catch (error: any) {
    console.error(`[File Import Error] Parsing or seeding failed:`, error.message);
    
    await createImportLog({
      successCount: importedCount,
      errorCount: errorCount + 1,
      errors: [...errors, `Fatal Import Error: ${error.message}`],
      source: 'CSV Bulk Upload',
      targetCollection: targetCollection || 'Unknown'
    });

    return res.status(500).json({ error: `Failed to import dataset: ${error.message}` });
  }
}
