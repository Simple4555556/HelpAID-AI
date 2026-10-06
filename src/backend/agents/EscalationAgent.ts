import { EmergencyCase } from '../models/EmergencyRequest.js';
import { Doctor } from '../models/Doctor.js';
import { Hospital } from '../models/Hospital.js';
import { haversineDistance } from '../services/PlacesService.js';
import { getIo } from '../services/socketService.js';

export const escalationTimers = new Map<string, ReturnType<typeof setTimeout>>();

export async function escalateCase(caseId: string, lat: number, lng: number) {
  try {
    const emergencyCase = await EmergencyCase.findById(caseId);
    if (!emergencyCase || (emergencyCase.status !== 'PENDING' && emergencyCase.status !== 'ESCALATED')) return;

    const newLevel = (emergencyCase.escalation_level || 0) + 1;
    if (newLevel > 3) return; // Max 3 escalations

    const alreadyNotifiedD = new Set(emergencyCase.notifiedDoctorIds || []);
    const moreDoctors = await Doctor.find({ is_online: true }).lean();
    const newDoctors = moreDoctors
      .filter(d => !alreadyNotifiedD.has(d._id!.toString()))
      .map(d => ({
        ...d,
        distanceKm: haversineDistance(lat, lng, d.latitude || d.lat || 0, d.longitude || d.lng || 0)
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 3);

    const alreadyNotifiedH = new Set(emergencyCase.notifiedHospitalIds || []);
    const moreHospitals = await Hospital.find({ is_online: true, accepting_emergency: true }).lean();
    const newHospitals = moreHospitals
      .filter(h => !alreadyNotifiedH.has(h._id!.toString()))
      .map(h => ({
        ...h,
        distanceKm: haversineDistance(lat, lng, h.latitude || h.lat || 0, h.longitude || h.lng || 0)
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 2);

    // Update case
    emergencyCase.escalation_level = newLevel;
    newDoctors.forEach(d => emergencyCase.notifiedDoctorIds.push(d._id!.toString()));
    newHospitals.forEach(h => emergencyCase.notifiedHospitalIds.push(h._id!.toString()));
    emergencyCase.status = 'ESCALATED';
    await emergencyCase.save();

    // Send alerts
    const alertPayload = {
      caseId,
      patientName: emergencyCase.patientName,
      patient_phone: emergencyCase.patient_phone,
      injuryType: emergencyCase.injuryType,
      severity: emergencyCase.severity,
      emergencyDescription: emergencyCase.emergencyDescription,
      aiReportSummary: emergencyCase.aiReportSummary,
      lat,
      lng,
      patient_location_address: emergencyCase.patient_location_address,
      escalated: true,
      escalation_level: newLevel
    };

    const io = getIo();

    newDoctors.forEach(d => {
      if (d.userId) io.to(`user_${d.userId.toString()}`).emit('sos:new', { ...alertPayload, distanceKm: d.distanceKm.toFixed(1) });
      io.to(`doctor_${d._id!.toString()}`).emit('sos:new', { ...alertPayload, distanceKm: d.distanceKm.toFixed(1) });
    });

    newHospitals.forEach(h => {
      if (h.userId) io.to(`user_${h.userId.toString()}`).emit('sos:new', { ...alertPayload, distanceKm: h.distanceKm.toFixed(1) });
      io.to(`hospital_${h._id!.toString()}`).emit('sos:new', { ...alertPayload, distanceKm: h.distanceKm.toFixed(1) });
    });

    // Notify patient of escalation
    io.to(`case_${caseId}`).emit('sos:escalated', {
      caseId,
      escalation_level: newLevel,
      additionalDoctors: newDoctors.length,
      additionalHospitals: newHospitals.length
    });

    console.log(`[SOS Escalation] Case ${caseId} escalated to level ${newLevel}. Notified ${newDoctors.length} more doctors, ${newHospitals.length} more hospitals.`);

    // Set next escalation timer
    if (newLevel < 3) {
      const nextTimer = setTimeout(() => escalateCase(caseId, lat, lng), 60000);
      escalationTimers.set(caseId, nextTimer);
    }
  } catch (err: any) {
    console.error('[SOS Escalation Error]:', err.message);
  }
}
