process.env.IS_AGENT_TEST = 'true';
import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from '../db.js';
import { PlacesService } from '../src/backend/services/PlacesService.js';
import {
  getHospitals,
  getDoctors,
  getBloodBanks,
  getMedicalStores,
  getPoliceStations,
  getAmbulanceServices
} from '../db.js';

async function testNearby() {
  console.log('--- STARTING NEARBY SERVICES INTEGRATION TEST ---');
  
  // 1. Initialize MongoDB Connection
  await connectDB();
  
  // Coordinates for Unnao (seeding coordinates)
  const lat = 26.5500;
  const lng = 80.4900;
  const radiusMeters = 15000; // 15km radius

  try {
    console.log('\n[1] Querying Nearby Hospitals...');
    const hospitals = await PlacesService.getNearbyFacilities(lat, lng, radiusMeters, getHospitals, 'hospital', 'hospital');
    console.log(`Found ${hospitals.length} hospitals. Top 3:`);
    hospitals.slice(0, 3).forEach((h, i) => console.log(`  ${i+1}. ${h.name} (${h.distanceKm.toFixed(2)} km) - Address: ${h.address}`));

    console.log('\n[2] Querying Nearby Police Stations...');
    const police = await PlacesService.getNearbyFacilities(lat, lng, radiusMeters, getPoliceStations, 'police', 'police');
    console.log(`Found ${police.length} police stations. Top 3:`);
    police.slice(0, 3).forEach((p, i) => console.log(`  ${i+1}. ${p.name} (${p.distanceKm.toFixed(2)} km) - Address: ${p.address}`));

    console.log('\n[3] Querying Nearby Pharmacies...');
    const pharmacies = await PlacesService.getNearbyFacilities(lat, lng, radiusMeters, getMedicalStores, 'pharmacy', 'pharmacy');
    console.log(`Found ${pharmacies.length} pharmacies. Top 3:`);
    pharmacies.slice(0, 3).forEach((p, i) => console.log(`  ${i+1}. ${p.name} (${p.distanceKm.toFixed(2)} km) - Address: ${p.address}`));

    console.log('\n[4] Querying Nearby Blood Banks...');
    const bloodBanks = await PlacesService.getNearbyFacilities(lat, lng, radiusMeters, getBloodBanks, 'blood_bank', 'health', 'blood bank');
    console.log(`Found ${bloodBanks.length} blood banks. Top 3:`);
    bloodBanks.slice(0, 3).forEach((b, i) => console.log(`  ${i+1}. ${b.name} (${b.distanceKm.toFixed(2)} km) - Address: ${b.address}`));

    console.log('\n[5] Querying Nearby Ambulances...');
    const ambulances = await PlacesService.getNearbyFacilities(lat, lng, radiusMeters, getAmbulanceServices, 'ambulance_station', 'health', 'ambulance service');
    console.log(`Found ${ambulances.length} ambulance services. Top 3:`);
    ambulances.slice(0, 3).forEach((a, i) => console.log(`  ${i+1}. ${a.name} (${a.distanceKm.toFixed(2)} km) - Address: ${a.address}`));

    console.log('\n--- NEARBY SERVICES INTEGRATION TEST COMPLETE ---');
    process.exit(0);
  } catch (err) {
    console.error('Test failed with error:', err);
    process.exit(1);
  }
}

testNearby();
