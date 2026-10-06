import { Router, Request, Response } from 'express';
import multer from 'multer';
import { register, login, logout, getAdminStats } from '../controllers/AuthController.js';
import { createSOS, acceptSOS, rejectSOS, forwardSOS, getActiveCases, getPatientStatus, getOnlineDoctors, acceptAmbulance, acceptHospital, updateAmbulanceStatus, rejectAmbulanceDispatch } from '../controllers/SOSController.js';
import {
  getNearbyHospitals,
  getNearbyDoctors,
  getNearbyBloodBanks,
  getNearbyMedicalStores,
  getNearbyPoliceStations,
  getNearbyAmbulanceServices,
  locationAgentQuery,
  reverseGeocode
} from '../controllers/LocationController.js';
import { fuzzySearch } from '../controllers/SearchController.js';
import { importCSV } from '../controllers/CsvImportController.js';
import { syncOSMData } from '../controllers/dataSyncController.js';
import { getEmergencyContacts, addEmergencyContact } from '../controllers/EmergencyController.js';
import { dispatchEmergency, acceptEmergencyCase, getPendingCases } from '../controllers/EmergencyDispatchController.js';
import { authenticateJWT, requireRole, rateLimiter, AuthenticatedRequest } from '../middleware/auth.js';
import { getHospitals, getDoctors, getBloodBanks, getMedicalStores, getPoliceStations, getAmbulanceServices, EmergencyCase, Notification } from '../../../db.js';
import { fetchConsentLogs, logPatientConsent } from '../controllers/SecurityController.js';
import { getHospitalCapacity, updateHospitalCapacity, addDoctorToRoster, removeDoctorFromRoster, getHospitalDoctors } from '../controllers/HospitalAdminController.js';
import { SupervisorAgent } from '../agents/SupervisorAgent.js';

const router = Router();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

// Apply global rate limiting to API routes
router.use(rateLimiter(15 * 60 * 1000, 150)); // Max 150 reqs per 15 mins per IP

// ── AUTHENTICATION ──────────────────────────────────────────────────────────
router.post('/auth/register', register);
router.post('/auth/login', login);
router.post('/auth/logout', authenticateJWT as any, logout);

// ── DIAGNOSTICS / HEALTH CHECK ──────────────────────────────────────────────
router.get('/health/db-status', async (req: Request, res: Response) => {
  try {
    const hospitals = await getHospitals({});
    const doctors = await getDoctors({});
    const bloodBanks = await getBloodBanks({});
    const medicalStores = await getMedicalStores({});

    const status = {
      mongoConnected: hospitals !== null && doctors !== null,
      dataRecords: {
        hospitals: hospitals.length,
        doctors: doctors.length,
        bloodBanks: bloodBanks.length,
        medicalStores: medicalStores.length
      },
      timestamp: new Date().toISOString(),
      mode: 'MongoDB-Only (No Fallback)'
    };

    console.log(`[HEALTH] DB Status requested:`, status);
    return res.json(status);
  } catch (err: any) {
    console.error('[HEALTH] DB status check failed:', err.message);
    return res.status(500).json({
      error: 'Database health check failed',
      message: err.message,
      mode: 'MongoDB-Only (No Fallback)'
    });
  }
});

// ── SOS DISPATCH ────────────────────────────────────────────────────────────
router.post('/sos/create', upload.single('photo'), createSOS);
router.post('/sos/accept', authenticateJWT as any, acceptSOS);
router.post('/sos/accept-ambulance', authenticateJWT as any, acceptAmbulance);
router.post('/sos/accept-hospital', authenticateJWT as any, acceptHospital);
router.post('/sos/reject', authenticateJWT as any, rejectSOS);
router.post('/sos/forward', authenticateJWT as any, forwardSOS);
router.post('/sos/update-ambulance-status', authenticateJWT as any, updateAmbulanceStatus);
router.post('/sos/reject-ambulance-dispatch', authenticateJWT as any, rejectAmbulanceDispatch);
router.get('/sos/active', authenticateJWT as any, getActiveCases);
router.get('/doctor/pending-emergencies', authenticateJWT as any, getActiveCases);
router.get('/sos/patient-status/:caseId', getPatientStatus);
router.get('/sos/online-doctors', getOnlineDoctors);

// ── FUZZY SEARCH ────────────────────────────────────────────────────────────
router.get('/search', fuzzySearch);

// ── REGIONAL EMERGENCY DIRECTORY ────────────────────────────────────────────
router.get('/emergency-contacts', getEmergencyContacts);
router.post('/emergency-contacts', authenticateJWT as any, requireRole('admin') as any, addEmergencyContact);

// ── LIVE LOCATION INTELLIGENCE ──────────────────────────────────────────────
router.get('/location/reverse-geocode', reverseGeocode);
router.get('/nearby-hospitals', getNearbyHospitals);
router.get('/nearby-doctors', getNearbyDoctors);
router.get('/nearby-bloodbanks', getNearbyBloodBanks);
router.get('/nearby-medicalstores', getNearbyMedicalStores);
router.get('/nearby-policestations', getNearbyPoliceStations);
router.get('/nearby-ambulances', getNearbyAmbulanceServices);
router.post('/agent/location-query', locationAgentQuery);

// ── EMERGENCY DISPATCH ──────────────────────────────────────────────────────
router.post('/emergency/dispatch', dispatchEmergency);
router.post('/emergency/multi-agent/dispatch', async (req: Request, res: Response) => {
  const { userId, symptoms, lat, lng, imageBase64, image } = req.body;
  if (!lat || !lng) {
    return res.status(400).json({ error: 'GPS coordinates (lat/lng) are required for emergency dispatch.' });
  }
  try {
    const finalState = await SupervisorAgent.runEmergencyWorkflow({
      userId,
      symptoms,
      lat: Number(lat),
      lng: Number(lng),
      imageBase64: imageBase64 || image
    });
    return res.json({
      success: finalState.errors.length === 0 || !!finalState.dispatch?.caseId,
      state: finalState
    });
  } catch (err: any) {
    console.error('[Multi-Agent API Route Error] Dispatch failed:', err);
    return res.status(500).json({ error: 'Failed to run emergency dispatch state-graph workflow.' });
  }
});
router.post('/emergency/accept', authenticateJWT as any, acceptEmergencyCase);
router.get('/emergency/pending', authenticateJWT as any, getPendingCases);

// ── DIRECT RESOURCE CRUD QUERIES ────────────────────────────────────────────
router.get('/hospitals', async (req: Request, res: Response) => {
  try {
    const list = await getHospitals({});
    const mongoCount = list.length;
    console.log(`[API] GET /hospitals: Returned ${mongoCount} MongoDB hospitals`);
    if (mongoCount === 0) {
      console.warn('[API] Warning: No hospitals found in MongoDB. Check database connection and data imports.');
    }
    return res.json(list);
  } catch (err: any) {
    console.error('[API] Failed to fetch hospitals from MongoDB:', err.message);
    return res.status(500).json({ error: 'Failed to fetch hospitals.' });
  }
});

router.get('/doctors', async (req: Request, res: Response) => {
  try {
    const list = await getDoctors({});
    const mongoCount = list.length;
    console.log(`[API] GET /doctors: Returned ${mongoCount} MongoDB doctors`);
    if (mongoCount === 0) {
      console.warn('[API] Warning: No doctors found in MongoDB. Check database connection and data imports.');
    }
    return res.json(list);
  } catch (err: any) {
    console.error('[API] Failed to fetch doctors from MongoDB:', err.message);
    return res.status(500).json({ error: 'Failed to fetch doctors.' });
  }
});

router.get('/bloodbanks', async (req: Request, res: Response) => {
  try {
    const list = await getBloodBanks({});
    return res.json(list);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch blood banks.' });
  }
});

router.get('/medicalstores', async (req: Request, res: Response) => {
  try {
    const list = await getMedicalStores({});
    return res.json(list);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch medical stores.' });
  }
});

router.get('/policestations', async (req: Request, res: Response) => {
  try {
    const list = await getPoliceStations({});
    return res.json(list);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch police stations.' });
  }
});

router.get('/ambulances', async (req: Request, res: Response) => {
  try {
    const list = await getAmbulanceServices({});
    return res.json(list);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch ambulance services.' });
  }
});

// ── ADMIN INFRASTRUCTURE ──────────────────────────────────────────────────
router.get('/admin/stats', authenticateJWT as any, requireRole('admin') as any, getAdminStats as any);
router.post('/import-csv', authenticateJWT as any, requireRole('admin') as any, upload.single('image'), importCSV as any); // mapped under single 'image' field for backwards compatibility
router.post('/sync-osm', authenticateJWT as any, requireRole('admin') as any, syncOSMData as any);

// ── SECURITY & CONSENT LOGS ──────────────────────────────────────────────────
router.post('/consent/log', logPatientConsent);
router.get('/admin/consent-logs', authenticateJWT as any, requireRole('admin') as any, fetchConsentLogs as any);

// ── HOSPITAL ADMIN CAPACITY & ROSTER MANAGEMENT ──────────────────────────────
router.get('/hospital/capacity', getHospitalCapacity);
router.put('/hospital/capacity', authenticateJWT as any, requireRole(['hospital', 'hospital_admin']) as any, updateHospitalCapacity);
router.get('/hospital/doctors', getHospitalDoctors);
router.post('/hospital/doctors', authenticateJWT as any, requireRole(['hospital', 'hospital_admin']) as any, addDoctorToRoster);
router.delete('/hospital/doctors/:doctorId', authenticateJWT as any, requireRole(['hospital', 'hospital_admin']) as any, removeDoctorFromRoster);

// ── PATIENT DASHBOARD DATA ENDPOINTS ──────────────────────────────────────────
router.get('/sos/my-cases', authenticateJWT as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: User authentication failed.' });
  }
  try {
    const cases = await EmergencyCase.find({ userId }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, cases });
  } catch (err: any) {
    console.error('[API GET /sos/my-cases Error]:', err.message);
    return res.status(500).json({ error: 'Failed to fetch emergency cases.' });
  }
});

router.get('/notifications', authenticateJWT as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: User authentication failed.' });
  }
  try {
    const notifications = await Notification.find({ recipientId: userId }).sort({ createdAt: -1 }).limit(50).lean();
    return res.json({ success: true, notifications });
  } catch (err: any) {
    console.error('[API GET /notifications Error]:', err.message);
    return res.status(500).json({ error: 'Failed to fetch patient notifications.' });
  }
});

router.post('/notifications/:id/read', authenticateJWT as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: User authentication failed.' });
  }
  try {
    const updated = await Notification.findOneAndUpdate(
      { _id: id, recipientId: userId },
      { $set: { read: true } },
      { returnDocument: 'after' }
    );
    return res.json({ success: !!updated });
  } catch (err: any) {
    console.error('[API POST /notifications/:id/read Error]:', err.message);
    return res.status(500).json({ error: 'Failed to update notification status.' });
  }
});

router.post('/sos/migrate-guest', authenticateJWT as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const helpAidId = (req.user as any)?.helpAidId || '';
  const { caseIds, guestSessionId } = req.body;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  try {
    const { migrateGuestCases } = await import('../controllers/AuthController.js');
    await migrateGuestCases(userId, helpAidId, caseIds || [], guestSessionId);
    return res.json({ success: true, message: 'Guest SOS cases migrated successfully.' });
  } catch (err: any) {
    console.error('[API Migrate Guest SOS Error]:', err.message);
    return res.status(500).json({ error: 'Failed to migrate guest SOS cases.' });
  }
});

export default router;
