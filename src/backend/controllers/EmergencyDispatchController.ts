import { Request, Response } from 'express';
import { EmergencyCase, Hospital, Doctor, AmbulanceService, UserEmergencyContact, createConsentLog } from '../../../db.js';
import { PlacesService, haversineDistance } from '../services/PlacesService.js';
import { getIo } from '../services/socketService.js'; // Will import the socket instance

// Helper to map injury type to doctor specialization
function getSpecializationForInjury(injuryType: string): string {
  const lower = injuryType.toLowerCase();
  if (lower.includes('fracture') || lower.includes('bone')) return 'Orthopedic';
  if (lower.includes('burn') || lower.includes('skin')) return 'Dermatologist'; // or Plastic Surgeon
  if (lower.includes('cardiac') || lower.includes('heart')) return 'Cardiologist';
  if (lower.includes('head') || lower.includes('stroke') || lower.includes('brain')) return 'Neurologist';
  if (lower.includes('bleeding') || lower.includes('cut')) return 'General Surgeon';
  return 'General Physician';
}

export const dispatchEmergency = async (req: Request, res: Response) => {
  const { userId, patientName, patientContact, injuryType, severity, lat, lng, reportData } = req.body;

  if (!userId || !lat || !lng) {
    return res.status(400).json({ error: 'Missing required location or user data for dispatch.' });
  }

  try {
    // 1. Find nearest hospitals
    const allHospitals = await Hospital.find({});
    let nearbyHospitals = allHospitals.map(h => {
      const doc = h.toObject();
      const dist = haversineDistance(lat, lng, doc.latitude || doc.lat || 0, doc.longitude || doc.lng || 0);
      return { ...doc, distanceKm: dist };
    }).filter(h => h.distanceKm <= 15).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 3);
    const notifiedHospitalIds = nearbyHospitals.map(h => h._id.toString());

    // 2. Find nearest Ambulances
    const allAmbulances = await AmbulanceService.find({
      is_online: true,
      is_available: true,
      userId: { $ne: null },
      profileId: { $ne: null }
    });
    let nearbyAmbulances = allAmbulances.map(a => {
      const doc = a.toObject();
      const dist = haversineDistance(lat, lng, doc.latitude || doc.lat || 0, doc.longitude || doc.lng || 0);
      return { ...doc, distanceKm: dist };
    }).filter(a => a.distanceKm <= 15).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 2);
    const notifiedAmbulanceIds = nearbyAmbulances.map(a => a._id.toString());

    // 3. Find nearest Doctors based on specialty
    const requiredSpecialty = getSpecializationForInjury(injuryType || '');
    const allDoctors = await Doctor.find({});
    // Very loose regex match for demo purposes
    let nearbyDoctors = allDoctors.filter(d => 
      (d.specialization || '').toLowerCase().includes(requiredSpecialty.toLowerCase()) || 
      (d.specialization || '').toLowerCase().includes('general')
    ).map(d => {
      const doc = d.toObject();
      const dist = haversineDistance(lat, lng, doc.latitude || doc.lat || 0, doc.longitude || doc.lng || 0);
      return { ...doc, distanceKm: dist };
    }).filter(d => d.distanceKm <= 20).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 2);
    const notifiedDoctorIds = nearbyDoctors.map(d => d._id.toString());

    // 4. Fetch User Emergency Contacts (SOS Family)
    const familyContacts = await UserEmergencyContact.find({ userId });
    if (familyContacts.length > 0) {
      console.log(`\n===========================================`);
      console.log(`[SOS SMS ALERT] Sending SMS to ${familyContacts.length} family members...`);
      familyContacts.forEach(contact => {
        console.log(`To: ${contact.mobileNumber} (${contact.name} - ${contact.relation})`);
        console.log(`Message: URGENT: ${patientName || 'Your family member'} has reported a ${severity} emergency (${injuryType}). Live tracking link: https://helpaid.ai/tracker/`);
      });
      console.log(`===========================================\n`);
    }

    // 5. Create the case in the DB
    const newCase = new EmergencyCase({
      userId,
      patientName: patientName || 'Unknown Patient',
      patientContact: patientContact || 'N/A',
      injuryType: injuryType || 'Unspecified Emergency',
      severity: severity || 'CRITICAL',
      lat,
      lng,
      status: 'PENDING',
      notifiedHospitalIds,
      notifiedAmbulanceIds,
      notifiedDoctorIds,
      familyNotified: familyContacts.length > 0,
      reportData: reportData || {}
    });

    await newCase.save();
    const caseIdString = newCase._id.toString();

    // Log patient consent for emergency routing and sharing of PII
    try {
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
      const userAgent = req.headers['user-agent'] || '';
      await createConsentLog({
        userId,
        caseId: caseIdString,
        consentType: 'EMERGENCY_DISPATCH',
        granted: true,
        ipAddress,
        userAgent
      });
      console.log(`[HEDA] Consent logged successfully for Case ${caseIdString}`);
    } catch (consentErr) {
      console.error('[HEDA] Consent logging failed:', consentErr);
    }


    // 6. Emit WebSocket alerts
    const payload = {
      caseId: caseIdString,
      patientName: newCase.patientName,
      injuryType: newCase.injuryType,
      severity: newCase.severity,
      lat,
      lng,
      reportData
    };
    
    const io = getIo();

    nearbyHospitals.forEach(h => {
      io.to(`hospital_${h._id.toString()}`).emit('new_emergency', { ...payload, distanceKm: h.distanceKm.toFixed(1) });
    });

    nearbyAmbulances.forEach(a => {
      io.to(`ambulance_${a._id.toString()}`).emit('new_emergency', { ...payload, distanceKm: a.distanceKm.toFixed(1) });
    });

    nearbyDoctors.forEach(d => {
      io.to(`doctor_${d._id.toString()}`).emit('new_emergency', { ...payload, distanceKm: d.distanceKm.toFixed(1) });
    });

    console.log(`[HEDA] Dispatched Case ${caseIdString} to ${notifiedHospitalIds.length} Hospitals, ${notifiedAmbulanceIds.length} Ambulances, and ${notifiedDoctorIds.length} Doctors.`);

    return res.json({
      success: true,
      caseId: newCase._id,
      message: `Alert dispatched successfully.`
    });

  } catch (err: any) {
    console.error('[HEDA] Failed to dispatch emergency:', err);
    return res.status(500).json({ error: 'Failed to dispatch emergency alert.' });
  }
};

export const acceptEmergencyCase = async (req: Request, res: Response) => {
  const { caseId, etaMinutes } = req.body;
  const authReq = req as any;
  const userId = authReq.user?.id;
  
  if (!caseId) {
    return res.status(400).json({ error: 'Missing caseId.' });
  }

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  try {
    // Look up hospital by userId from JWT
    const hospital = await Hospital.findOne({ userId });
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital profile not found for this user.' });
    }
    const hospitalId = hospital._id.toString();

    // ATOMIC LOCKING: Only update if status is still PENDING
    const emergencyCase = await EmergencyCase.findOneAndUpdate(
      { _id: caseId, status: 'PENDING' },
      { $set: { status: 'ACCEPTED', assignedHospitalId: hospitalId, etaMinutes: etaMinutes || 10 } },
      { returnDocument: 'after' } // return updated document
    );

    if (!emergencyCase) {
      return res.status(400).json({ error: 'Case already accepted by another hospital or not found.' });
    }

    const io = getIo();

    // Broadcast `case_locked` to OTHER hospitals so it disappears from their dashboard
    emergencyCase.notifiedHospitalIds.forEach((id: string) => {
      if (id !== hospitalId) {
        io.to(`hospital_${id}`).emit('case_locked', { caseId });
      }
    });

    // Broadcast `case_accepted` to the patient
    io.to(`case_${caseId}`).emit('case_accepted', {
      caseId,
      hospitalName: hospital?.name || 'Assigned Hospital',
      hospitalContact: hospital?.phone || 'N/A',
      hospitalLat: hospital?.latitude || hospital?.lat,
      hospitalLng: hospital?.longitude || hospital?.lng,
      etaMinutes: emergencyCase.etaMinutes
    });

    return res.json({ success: true, message: 'Case accepted successfully.' });

  } catch (err: any) {
    console.error('[HEDA] Failed to accept case:', err);
    return res.status(500).json({ error: 'Failed to accept case.' });
  }
};

// Polling fallback endpoint for hospital dashboard if they missed the socket event
export const getPendingCases = async (req: Request, res: Response) => {
  const { hospitalId } = req.query;
  if (!hospitalId) return res.status(400).json({ error: 'Missing hospitalId' });

  try {
    const cases = await EmergencyCase.find({
      notifiedHospitalIds: hospitalId as string,
      status: 'PENDING'
    }).sort({ createdAt: -1 });

    return res.json({ cases });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch pending cases.' });
  }
};
