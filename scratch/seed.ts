import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { connectDB, User, Hospital, Doctor, BloodBank, MedicalStore, PoliceStation, AmbulanceService, FirstAid, EmergencyProtocol } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const cleanSlug = (text: string) => {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
};

async function seed() {
  console.log('--- STARTING DATABASE SEEDING ---');
  await connectDB();

  // Clear existing collections
  console.log('Clearing existing collections...');
  await User.deleteMany({});
  await Doctor.deleteMany({});
  await Hospital.deleteMany({});
  await AmbulanceService.deleteMany({});
  await BloodBank.deleteMany({});
  await MedicalStore.deleteMany({});
  await PoliceStation.deleteMany({});
  await FirstAid.deleteMany({});
  await EmergencyProtocol.deleteMany({});

  // 1. Seed Default Patient User
  console.log('Seeding default patient...');
  const defaultPatient = await User.create({
    email: 'patient@helpaid.com',
    password: 'password123',
    role: 'user',
    displayName: 'John Patient',
    phone: '9000000001',
    bloodGroup: 'O+',
    is_online: false,
    status: 'active',
    helpAidId: 'HA-2026-000001'
  });
  console.log('Default Patient created:', defaultPatient.email);

  const datasetDir = path.join(__dirname, '../dataset');

  // 2. Seed Hospitals
  console.log('Seeding hospitals...');
  const hospitalsCsv = fs.readFileSync(path.join(datasetDir, 'hospitals.csv'), 'utf8');
  const hospitalsRows = parseCSV(hospitalsCsv);
  for (let idx = 0; idx < hospitalsRows.length; idx++) {
    const row = hospitalsRows[idx];
    if (!row.name) continue;
    const slug = cleanSlug(row.name);
    const email = `${slug.substring(0, 15)}_${idx}@helpaid.com`;
    const userAcc = await User.create({
      email,
      password: 'password123',
      role: 'hospital',
      displayName: row.name,
      phone: row.phone && row.phone !== 'Local availability' ? row.phone : '9000000011',
      is_online: true,
      status: 'active'
    });

    const hospObj = await Hospital.create({
      userId: userAcc._id.toString(),
      name: row.name,
      phone: userAcc.phone,
      email,
      address: row.address || '',
      city: row.city || 'Unnao',
      state: row.state || 'Uttar Pradesh',
      pincode: row.pincode || '209801',
      latitude: parseFloat(row.lat || '26.5500'),
      longitude: parseFloat(row.lng || '80.4900'),
      lat: parseFloat(row.lat || '26.5500'),
      lng: parseFloat(row.lng || '80.4900'),
      is_online: true,
      accepting_emergency: true,
      status: 'active'
    });

    userAcc.hospitalProfileId = hospObj._id.toString();
    await userAcc.save();
  }
  console.log(`Successfully seeded ${hospitalsRows.length} hospitals.`);

  // 3. Seed Doctors
  console.log('Seeding doctors...');
  const doctorsCsv = fs.readFileSync(path.join(datasetDir, 'doctors.csv'), 'utf8');
  const doctorsRows = parseCSV(doctorsCsv);
  for (let idx = 0; idx < doctorsRows.length; idx++) {
    const row = doctorsRows[idx];
    if (!row.name) continue;
    const slug = cleanSlug(row.name);
    const email = `${slug.substring(0, 15)}_${idx}@helpaid.com`;
    const userAcc = await User.create({
      email,
      password: 'password123',
      role: 'doctor',
      displayName: row.name,
      phone: row.phone || '9100000000',
      is_online: true,
      status: 'active'
    });

    const docObj = await Doctor.create({
      userId: userAcc._id.toString(),
      name: row.name,
      phone: userAcc.phone,
      email,
      specialization: row.specialization || 'General Physician',
      hospital: row.hospital || 'Unnao Medical Centre',
      city: row.city || 'Unnao',
      state: 'Uttar Pradesh',
      latitude: parseFloat(row.lat || '26.5500'),
      longitude: parseFloat(row.lng || '80.4900'),
      lat: parseFloat(row.lat || '26.5500'),
      lng: parseFloat(row.lng || '80.4900'),
      is_online: true,
      status: 'active'
    });

    userAcc.doctorProfileId = docObj._id.toString();
    await userAcc.save();
  }
  console.log(`Successfully seeded ${doctorsRows.length} doctors.`);

  // 4. Seed Ambulances
  console.log('Seeding ambulances...');
  const ambulancesCsv = fs.readFileSync(path.join(datasetDir, 'ambulance_services.csv'), 'utf8');
  const ambulancesRows = parseCSV(ambulancesCsv);
  for (let idx = 0; idx < ambulancesRows.length; idx++) {
    const row = ambulancesRows[idx];
    if (!row.name) continue;
    const slug = cleanSlug(row.name);
    const email = `${slug.substring(0, 15)}_${idx}@helpaid.com`;
    const userAcc = await User.create({
      email,
      password: 'password123',
      role: 'ambulance_driver',
      displayName: row.name,
      phone: row.phone || '9000000041',
      is_online: true,
      status: 'active'
    });

    const ambObj = await AmbulanceService.create({
      userId: userAcc._id.toString(),
      name: row.name,
      phone: userAcc.phone,
      email,
      vehicleType: 'ICU',
      vehicleNumber: 'ALS-' + Math.floor(100 + Math.random() * 900),
      city: row.city || 'Unnao',
      state: 'Uttar Pradesh',
      latitude: parseFloat(row.lat || '26.5500'),
      longitude: parseFloat(row.lng || '80.4900'),
      lat: parseFloat(row.lat || '26.5500'),
      lng: parseFloat(row.lng || '80.4900'),
      is_online: true,
      is_available: true,
      status: 'active',
      profileId: '', // placeholder, will be set next
      socketRoom: '',
      lastSeen: new Date(),
      onlineStatus: 'online'
    });

    ambObj.profileId = ambObj._id.toString();
    ambObj.socketRoom = `ambulance_${ambObj._id.toString()}`;
    await ambObj.save();

    userAcc.ambulanceProfileId = ambObj._id.toString();
    userAcc.ambulanceId = ambObj._id.toString();
    await userAcc.save();
  }
  console.log(`Successfully seeded ${ambulancesRows.length} ambulances.`);

  // 5. Seed Blood Banks
  console.log('Seeding blood banks...');
  const bloodBanksCsv = fs.readFileSync(path.join(datasetDir, 'blood_banks.csv'), 'utf8');
  const bloodBanksRows = parseCSV(bloodBanksCsv);
  for (const row of bloodBanksRows) {
    if (!row.name) continue;
    await BloodBank.create({
      name: row.name,
      address: row.address || '',
      city: row.city || 'Unnao',
      district: row.district || 'Unnao',
      phone: row.phone || '9000000023',
      latitude: parseFloat(row.lat || '26.5500'),
      longitude: parseFloat(row.lng || '80.4900'),
      lat: parseFloat(row.lat || '26.5500'),
      lng: parseFloat(row.lng || '80.4900'),
      bloodGroups: (row.bloodGroups || 'A+;B+;O+;AB+').split(';'),
      open24x7: row.open24x7 === 'true' || row.open24x7 === true
    });
  }
  console.log(`Successfully seeded ${bloodBanksRows.length} blood banks.`);

  // 6. Seed Medical Stores
  console.log('Seeding medical stores...');
  const medicalStoresCsv = fs.readFileSync(path.join(datasetDir, 'medical_stores.csv'), 'utf8');
  const medicalStoresRows = parseCSV(medicalStoresCsv);
  for (const row of medicalStoresRows) {
    if (!row.name) continue;
    await MedicalStore.create({
      name: row.name,
      address: row.address || '',
      city: row.city || 'Unnao',
      district: row.district || 'Unnao',
      phone: row.phone || '9000000031',
      latitude: parseFloat(row.lat || '26.5510'),
      longitude: parseFloat(row.lng || '80.4930'),
      lat: parseFloat(row.lat || '26.5510'),
      lng: parseFloat(row.lng || '80.4930'),
      open24x7: row.open24x7 === 'true' || row.open24x7 === true,
      type: row.type || 'store'
    });
  }
  console.log(`Successfully seeded ${medicalStoresRows.length} medical stores.`);

  // 7. Seed Police Stations
  console.log('Seeding police stations...');
  const policeStationsCsv = fs.readFileSync(path.join(datasetDir, 'police_stations.csv'), 'utf8');
  const policeStationsRows = parseCSV(policeStationsCsv);
  for (const row of policeStationsRows) {
    if (!row.name) continue;
    await PoliceStation.create({
      name: row.name,
      address: row.address || '',
      city: row.city || 'Unnao',
      district: row.district || 'Unnao',
      phone: row.phone || '100',
      latitude: parseFloat(row.lat || '26.5500'),
      longitude: parseFloat(row.lng || '80.4900'),
      lat: parseFloat(row.lat || '26.5500'),
      lng: parseFloat(row.lng || '80.4900')
    });
  }
  console.log(`Successfully seeded ${policeStationsRows.length} police stations.`);

  // 8. Seed First Aid Guides
  console.log('Seeding first aid guides...');
  const firstAidCsv = fs.readFileSync(path.join(datasetDir, 'first_aid.csv'), 'utf8');
  const firstAidRows = parseCSV(firstAidCsv);
  for (const row of firstAidRows) {
    if (!row.title) continue;
    await FirstAid.create({
      title: row.title,
      urgency: row.urgency || 'MEDIUM',
      steps: (row.steps || '').split(';').filter(s => s.trim() !== ''),
      warnings: (row.warnings || '').split(';').filter(w => w.trim() !== '')
    });
  }
  console.log(`Successfully seeded ${firstAidRows.length} first aid guides.`);

  // 9. Seed Emergency Protocols
  console.log('Seeding emergency protocols...');
  const protocolsCsv = fs.readFileSync(path.join(datasetDir, 'emergency_protocols.csv'), 'utf8');
  const protocolsRows = parseCSV(protocolsCsv);
  for (const row of protocolsRows) {
    if (!row.name) continue;
    await EmergencyProtocol.create({
      name: row.name,
      severity: row.severity || 'MEDIUM',
      immediateSteps: (row.immediateSteps || '').split(';').filter(s => s.trim() !== ''),
      whatNotToDo: (row.whatNotToDo || '').split(';').filter(w => w.trim() !== ''),
      ambulanceRequired: row.ambulanceRequired === 'true' || row.ambulanceRequired === true
    });
  }
  console.log(`Successfully seeded ${protocolsRows.length} emergency protocols.`);

  console.log('--- DATABASE SEEDING COMPLETED SUCCESSFULLY ---');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seeding crashed with error:', err);
  process.exit(1);
});
