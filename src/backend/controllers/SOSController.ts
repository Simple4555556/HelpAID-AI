import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import { EmergencyCase } from '../models/EmergencyRequest.js';
import { Doctor } from '../models/Doctor.js';
import { Hospital } from '../models/Hospital.js';
import { DoctorResponse } from '../models/DoctorResponse.js';
import { AmbulanceResponse } from '../models/AmbulanceResponse.js';
import { HospitalResponse } from '../models/HospitalResponse.js';
import { TrackingSession } from '../models/TrackingSession.js';
import { AmbulanceService } from '../models/Ambulance.js';
import Notification from '../models/Notification.js';
import { haversineDistance } from '../services/PlacesService.js';
import { getIo, userSocketMap } from '../services/socketService.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { escalationTimers, escalateCase } from '../agents/EscalationAgent.js';

// Firebase Storage for SOS photo uploads (backend / Node.js)
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || '',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.VITE_FIREBASE_APP_ID || ''
};

const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const storage = getStorage(firebaseApp);

// Helper function to generate PDF
export const generatePreArrivalPDF = (report: any, imageBuffer?: Buffer | string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Color Palette
      const navyColor = '#0F294A';
      const blueColor = '#1D58D8';
      const redColor = '#B91C1C';
      const greenColor = '#15803D';
      const orangeColor = '#D97706';
      const darkColor = '#1F2937';
      const textGray = '#4B5563';
      const lightGray = '#F9FAFB';
      const borderGray = '#E5E7EB';

      // Helpers
      const formatVal = (val: any, fallback = 'Not Available'): string => {
        if (val === undefined || val === null || val === '' || val === 'N/A' || val === 'null' || val === 'undefined') {
          return fallback;
        }
        return String(val).trim();
      };

      const formatDate = (dateVal: any): string => {
        if (!dateVal) return 'Not Available';
        try {
          const d = new Date(dateVal);
          if (isNaN(d.getTime())) return 'Not Available';
          return d.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
        } catch {
          return 'Not Available';
        }
      };

      // Extract all 21 Fields
      const patientName = formatVal(report.patientName || report.patientDetails?.name || report.patient_name);
      const age = formatVal(report.patientAge || report.patientDetails?.age || report.age || report.reportData?.patientDetails?.age);
      const gender = formatVal(report.patientGender || report.patientDetails?.gender || report.gender || report.reportData?.patientDetails?.gender);
      const emergencyId = formatVal(report.helpAidId || report._id || report.caseId || report.emergencyId);
      const emergencyTime = formatDate(report.createdAt || report.timestamp || report.incidentDetails?.incidentTime);
      const currentStatus = formatVal(report.status || report.liveStatus || report.currentStatus);
      const severityLevel = formatVal(report.severity || report.aiDetection?.severityLevel || report.severityLevel, 'CRITICAL');
      const symptoms = formatVal(report.emergencyDescription || report.incidentDetails?.userNote || report.symptoms || report.injuryType);

      let injuriesRaw = report.visibleInjuries || report.reportData?.visibleInjuries;
      if (!injuriesRaw && report.aiDetection) {
        const parts = [];
        if (report.aiDetection.visibleBurns && report.aiDetection.visibleBurns !== 'None' && report.aiDetection.visibleBurns !== 'Unknown') parts.push(`Burns: ${report.aiDetection.visibleBurns}`);
        if (report.aiDetection.visibleFractures && report.aiDetection.visibleFractures !== 'Unknown') parts.push(`Fractures: ${report.aiDetection.visibleFractures}`);
        if (report.aiDetection.openWounds && report.aiDetection.openWounds !== 'Unknown') parts.push(`Wounds: ${report.aiDetection.openWounds}`);
        if (report.aiDetection.bruises && report.aiDetection.bruises !== 'Unknown') parts.push(`Bruises: ${report.aiDetection.bruises}`);
        if (report.aiDetection.swelling && report.aiDetection.swelling !== 'Unknown') parts.push(`Swelling: ${report.aiDetection.swelling}`);
        if (report.aiDetection.bloodLoss && report.aiDetection.bloodLoss !== 'Unknown') parts.push(`Blood Loss: ${report.aiDetection.bloodLoss}`);
        injuriesRaw = parts.length > 0 ? parts.join(', ') : 'None Reported';
      }
      const visibleInjuries = formatVal(injuriesRaw);

      const aiAnalysis = formatVal(report.aiReportSummary || report.aiDetection?.explanation || report.summary || report.aiAnalysis);

      const confScoreRaw = report.aiDetection?.confidenceScore ?? report.confidenceScore;
      const confidenceScore = confScoreRaw !== undefined && confScoreRaw !== null ? `${confScoreRaw}%` : 'Not Available';

      let firstAidList: string[] = [];
      if (Array.isArray(report.firstAidRecommendations) && report.firstAidRecommendations.length > 0) {
        firstAidList = report.firstAidRecommendations;
      } else if (Array.isArray(report.firstAidInstructions) && report.firstAidInstructions.length > 0) {
        firstAidList = report.firstAidInstructions;
      } else {
        firstAidList = [
          'Keep patient stationary, comfortable, and calm.',
          'Apply direct clean pressure to visible bleeding sites.',
          'Monitor breathing, pulse, and level of consciousness continuous.'
        ];
      }

      const doctorName = formatVal(report.accepted_doctor?.name || report.acceptedDoctor?.doctorName || report.doctorDetails?.name || report.doctorName);
      const doctorStatus = (report.accepted_doctor || report.assignedDoctorId || report.acceptedDoctor || report.status === 'DOCTOR_ACCEPTED') ? 'Accepted' : 'Pending';
      const hospitalName = formatVal(report.accepted_hospital?.name || report.acceptedDoctor?.hospitalName || report.hospitalName || report.assignedHospitalName);
      const ambulanceNumber = formatVal(report.accepted_ambulance?.vehicleNumber || report.reportData?.vehicleNumber || report.vehicleNumber || report.ambulanceNumber);
      const ambulanceStatus = formatVal(report.accepted_ambulance?.liveStatus || report.reportData?.liveStatus || (report.assignedAmbulanceId ? 'Assigned' : 'Pending'));

      const latVal = report.lat ?? report.location?.latitude ?? report.latitude;
      const lngVal = report.lng ?? report.location?.longitude ?? report.longitude;
      const latitude = latVal !== undefined && latVal !== null ? String(latVal) : 'Not Available';
      const longitude = lngVal !== undefined && lngVal !== null ? String(lngVal) : 'Not Available';
      const liveLocation = (latitude !== 'Not Available' && longitude !== 'Not Available')
        ? `Lat: ${latitude}, Lng: ${longitude}`
        : formatVal(report.patient_location_address || report.location?.address);

      const reportGeneratedTime = formatDate(new Date());

      // ── Header Banner ────────────────────────────────────────────────────────
      doc.rect(30, 20, 535, 45).fill(navyColor);

      // Badge / Cross logo
      doc.rect(40, 28, 28, 28).fill(redColor);
      doc.fillColor('#FFFFFF')
        .rect(51, 32, 6, 20).fill()
        .rect(44, 39, 20, 6).fill();

      doc.fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(14)
        .text('HelpAid AI', 76, 28);

      doc.fillColor('#93C5FD')
        .font('Helvetica')
        .fontSize(7.5)
        .text('Emergency Medical First Response System', 76, 45);

      doc.fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('CLINICAL PRE-ARRIVAL BRIEFING REPORT', 240, 28, { align: 'right', width: 315 });

      doc.fillColor('#FCA5A5')
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(`SEVERITY: ${severityLevel.toUpperCase()}`, 240, 44, { align: 'right', width: 315 });

      doc.moveTo(30, 70).lineTo(565, 70).strokeColor(borderGray).lineWidth(1).stroke();

      // ── Section 1: Patient & Emergency Overview ──────────────────────────────
      const leftColX = 30;
      const leftColW = 260;
      const rightColX = 305;
      const rightColW = 260;

      // Section Header 1
      doc.rect(leftColX, 76, leftColW, 16).fill(blueColor);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8).text('👤 PATIENT & CASE DEMOGRAPHICS', leftColX + 8, 80);

      doc.rect(leftColX, 92, leftColW, 95).strokeColor(borderGray).lineWidth(1).stroke();

      let pY = 98;
      const patFields = [
        { label: 'Patient Name:', val: patientName },
        { label: 'Age / Gender:', val: `${age} / ${gender}` },
        { label: 'Emergency ID:', val: emergencyId },
        { label: 'Incident Time:', val: emergencyTime },
        { label: 'Current Status:', val: currentStatus },
        { label: 'Severity Level:', val: severityLevel }
      ];
      patFields.forEach(item => {
        doc.fillColor(textGray).font('Helvetica-Bold').fontSize(7.5).text(item.label, leftColX + 8, pY);
        doc.fillColor(darkColor).font('Helvetica').fontSize(7.5).text(item.val, leftColX + 85, pY, { width: 165 });
        pY += 14;
      });

      // Section Header 2 (Dispatch & Responders)
      doc.rect(rightColX, 76, rightColW, 16).fill(navyColor);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8).text('🚑 MEDICAL DISPATCH & RESPONDERS', rightColX + 8, 80);

      doc.rect(rightColX, 92, rightColW, 95).strokeColor(borderGray).lineWidth(1).stroke();

      let dY = 98;
      const dispFields = [
        { label: 'Attending Doctor:', val: doctorName },
        { label: 'Doctor Status:', val: doctorStatus },
        { label: 'Hospital Name:', val: hospitalName },
        { label: 'Ambulance Unit:', val: ambulanceNumber },
        { label: 'Ambulance Status:', val: ambulanceStatus },
        { label: 'Report Generated:', val: reportGeneratedTime }
      ];
      dispFields.forEach(item => {
        doc.fillColor(textGray).font('Helvetica-Bold').fontSize(7.5).text(item.label, rightColX + 8, dY);
        doc.fillColor(darkColor).font('Helvetica').fontSize(7.5).text(item.val, rightColX + 88, dY, { width: 164 });
        dY += 14;
      });

      // ── Section 2: Clinical Symptoms & AI Analysis ───────────────────────────
      const s2Y = 195;
      doc.rect(leftColX, s2Y, 535, 16).fill(redColor);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8).text('🔬 CLINICAL SYMPTOMS & AI DIAGNOSTIC ASSESSMENT', leftColX + 8, s2Y + 4);

      doc.rect(leftColX, s2Y + 16, 535, 95).strokeColor(borderGray).lineWidth(1).stroke();

      let clinY = s2Y + 22;
      doc.fillColor(textGray).font('Helvetica-Bold').fontSize(7.5).text('Symptoms:', leftColX + 8, clinY);
      doc.fillColor(darkColor).font('Helvetica').fontSize(7.5).text(symptoms, leftColX + 80, clinY, { width: 440 });

      clinY += 15;
      doc.fillColor(textGray).font('Helvetica-Bold').fontSize(7.5).text('Visible Injuries:', leftColX + 8, clinY);
      doc.fillColor(darkColor).font('Helvetica').fontSize(7.5).text(visibleInjuries, leftColX + 80, clinY, { width: 440 });

      clinY += 15;
      doc.fillColor(textGray).font('Helvetica-Bold').fontSize(7.5).text('AI Analysis:', leftColX + 8, clinY);
      doc.fillColor(darkColor).font('Helvetica').fontSize(7.5).text(aiAnalysis, leftColX + 80, clinY, { width: 440 });

      clinY += 28;
      doc.fillColor(textGray).font('Helvetica-Bold').fontSize(7.5).text('AI Confidence Score:', leftColX + 8, clinY);
      doc.fillColor(blueColor).font('Helvetica-Bold').fontSize(8).text(confidenceScore, leftColX + 110, clinY);

      doc.fillColor(textGray).font('Helvetica-Bold').fontSize(7.5).text('Live Location:', rightColX, clinY);
      doc.fillColor(darkColor).font('Helvetica').fontSize(7.5).text(liveLocation, rightColX + 70, clinY, { width: 190 });

      // ── Section 3: First Aid Instructions ────────────────────────────────────
      const s3Y = 315;
      doc.rect(leftColX, s3Y, 535, 16).fill(greenColor);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8).text('🩹 IMMEDIATE FIRST AID INSTRUCTIONS', leftColX + 8, s3Y + 4);

      doc.rect(leftColX, s3Y + 16, 535, 75).strokeColor(borderGray).lineWidth(1).stroke();

      let faY = s3Y + 22;
      firstAidList.slice(0, 4).forEach((step: string, idx: number) => {
        doc.fillColor(darkColor).font('Helvetica').fontSize(7.5).text(`${idx + 1}. ${step}`, leftColX + 10, faY, { width: 515 });
        faY += 16;
      });

      // ── Section 4: Emergency Scene Image ────────────────────────────────────
      const s4Y = 415;
      doc.rect(leftColX, s4Y, 535, 16).fill(navyColor);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8).text('📷 EMERGENCY SCENE IMAGE / VISUAL BRIEF', leftColX + 8, s4Y + 4);

      doc.rect(leftColX, s4Y + 16, 535, 150).strokeColor(borderGray).lineWidth(1).stroke();

      const imgTarget = imageBuffer || report.imageUrl || report.image;
      if (imgTarget) {
        try {
          let cleanBuffer: Buffer | undefined;
          if (typeof imgTarget === 'string') {
            let cleanImage = imgTarget;
            if (cleanImage.includes(',')) {
              cleanImage = cleanImage.split(',')[1];
            }
            if (!cleanImage.startsWith('http')) {
              cleanBuffer = Buffer.from(cleanImage, 'base64');
            }
          } else if (Buffer.isBuffer(imgTarget)) {
            cleanBuffer = imgTarget;
          }

          if (cleanBuffer) {
            // Embed buffer keeping aspect ratio with fit
            doc.image(cleanBuffer, leftColX + 10, s4Y + 22, { fit: [515, 138], align: 'center', valign: 'center' });
          } else {
            doc.rect(leftColX + 10, s4Y + 22, 515, 138).fill(lightGray);
            doc.fillColor(textGray).font('Helvetica').fontSize(8).text('Image captured (External URL referenced)', leftColX + 10, s4Y + 80, { align: 'center', width: 515 });
          }
        } catch (imgErr) {
          doc.rect(leftColX + 10, s4Y + 22, 515, 138).fill(lightGray);
          doc.fillColor(textGray).font('Helvetica').fontSize(8).text('Emergency Image Captured (Formatting Preview)', leftColX + 10, s4Y + 80, { align: 'center', width: 515 });
        }
      } else {
        doc.rect(leftColX + 10, s4Y + 22, 515, 138).fill(lightGray);
        doc.fillColor(textGray).font('Helvetica-Bold').fontSize(8.5).text('No Emergency Image Captured', leftColX + 10, s4Y + 80, { align: 'center', width: 515 });
      }

      // ── Footer ───────────────────────────────────────────────────────────────
      doc.moveTo(30, 580).lineTo(565, 580).strokeColor(borderGray).lineWidth(1).stroke();

      doc.fillColor(textGray)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('Generated by HelpAid AI', 30, 586, { align: 'center', width: 535 });

      doc.fillColor(textGray)
        .font('Helvetica')
        .fontSize(7)
        .text('Official Emergency Medical Pre-Arrival Report • Retain clinical discretion', 30, 597, { align: 'center', width: 535 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

// ─── CREATE SOS ─────────────────────────────────────────────────────────────
export const createSOS = async (req: Request, res: Response) => {
  const {
    userId, patientName, patient_phone,
    emergencyDescription, injuryType, severity,
    aiReportSummary, patient_location_address
  } = req.body;

  console.log('[SOS_REQUEST_RECEIVED]');

  // Parse lat/lng as floats — FormData sends them as strings
  const lat = parseFloat(req.body.lat);
  const lng = parseFloat(req.body.lng);

  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: 'GPS coordinates (lat/lng) are required.' });
  }

  try {
    console.log('[SOS] Creating SOS request', { userId, patientName, lat, lng, severity });
    // 1. Find nearest ONLINE doctors (top 3). Fallback to any doctors within 50km if none online.
    console.log('[DOCTOR SEARCH STARTED]');
    let onlineDoctors = await Doctor.find({
      $or: [
        { is_online: true },
        { is_online: { $exists: false } }
      ]
    }).lean();
    console.log(`[ONLINE DOCTORS FOUND] ${onlineDoctors.length} online/active doctors found in MongoDB for dispatch`);
    let nearbyDoctors = onlineDoctors
      .filter(d => d._id)
      .map(d => ({
        ...d,
        distanceKm: haversineDistance(lat, lng, d.latitude || d.lat || 0, d.longitude || d.lng || 0)
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 3);

    // FALLBACK: if no online doctors found, query all doctors within 50km
    if (nearbyDoctors.length === 0) {
      console.warn('[SOS] No online doctors found — falling back to all registered doctors within 50km');
      const allDoctors = await Doctor.find({}).lean();
      nearbyDoctors = allDoctors
        .filter(d => d._id)
        .map(d => ({
          ...d,
          distanceKm: haversineDistance(lat, lng, d.latitude || d.lat || 0, d.longitude || d.lng || 0)
        }))
        .filter(d => d.distanceKm <= 50)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 3);
      console.log(`[SOS] Fallback: Selected ${nearbyDoctors.length} nearest registered doctors`);
    } else {
      console.log(`[SOS] Selected ${nearbyDoctors.length} nearest online doctors`);
    }

    // 2. Find nearest ONLINE hospital accepting emergencies (top 3). Fallback to any hospital within 50km.
    let onlineHospitals = await Hospital.find({ is_online: true, accepting_emergency: true }).lean();
    console.log(`[SOS] Found ${onlineHospitals.length} online hospitals accepting emergencies in MongoDB for dispatch`);
    let nearbyHospitals = onlineHospitals
      .map(h => ({
        ...h,
        distanceKm: haversineDistance(lat, lng, h.latitude || h.lat || 0, h.longitude || h.lng || 0)
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 3);

    // FALLBACK: if no online hospitals found, query all hospitals within 50km
    if (nearbyHospitals.length === 0) {
      console.warn('[SOS] No online hospitals found — falling back to all registered hospitals within 50km');
      const allHospitals = await Hospital.find({}).lean();
      nearbyHospitals = allHospitals
        .map(h => ({
          ...h,
          distanceKm: haversineDistance(lat, lng, h.latitude || h.lat || 0, h.longitude || h.lng || 0)
        }))
        .filter(h => h.distanceKm <= 50)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 3);
      console.log(`[SOS] Fallback: Selected ${nearbyHospitals.length} nearest registered hospitals`);
    } else {
      console.log(`[SOS] Selected ${nearbyHospitals.length} nearest online hospitals`);
    }

    const notifiedDoctorIds = nearbyDoctors.map(d => d._id!.toString());
    const notifiedHospitalIds = nearbyHospitals.map(h => h._id!.toString());

    // 2.5. Upload photo to Firebase Storage if present
    let imageUrl = '';
    const multerReq = req as any;
    const photoBuffer: Buffer | undefined = multerReq.file?.buffer;
    if (multerReq.file && photoBuffer) {
      try {
        const fileName = `emergency_photos/${Date.now()}_${multerReq.file.originalname || 'photo.jpg'}`;
        const storageRef = ref(storage, fileName);
        const snapshot = await uploadBytes(storageRef, photoBuffer, {
          contentType: multerReq.file.mimetype || 'image/jpeg'
        });
        imageUrl = await getDownloadURL(snapshot.ref);
        console.log(`[SOS] Photo uploaded to Firebase Storage: ${imageUrl}`);
      } catch (uploadErr: any) {
        console.error('[SOS] Firebase photo upload failed:', uploadErr.message);
      }
    }

    // Parse Gemini AI reportData if present
    const parsedReportObj = req.body.reportData
      ? (typeof req.body.reportData === 'string' ? JSON.parse(req.body.reportData) : req.body.reportData)
      : {
        patientDetails: {
          name: patientName || 'Unknown',
          age: 'N/A',
          gender: 'N/A',
          mobileNumber: patient_phone || 'N/A'
        },
        location: {
          latitude: lat,
          longitude: lng,
          address: patient_location_address || ''
        },
        incidentDetails: {
          userNote: emergencyDescription || '',
          incidentTime: new Date().toLocaleString()
        },
        aiDetection: {
          injuryType: injuryType || 'Emergency',
          bodyLocation: 'N/A',
          severityLevel: severity || 'CRITICAL',
          severityScore: severity === 'CRITICAL' ? 9 : severity === 'HIGH' ? 7 : severity === 'MEDIUM' ? 5 : 3,
          confidenceScore: 75,
          bloodLoss: 'Unknown',
          visibleBurns: 'None',
          visibleFractures: 'Unknown',
          openWounds: 'Unknown',
          bruises: 'Unknown',
          swelling: 'Unknown'
        },
        riskFactors: {
          bloodLossRisk: 'Medium',
          fractureRisk: 'Medium',
          infectionRisk: 'Low',
          shockRisk: severity === 'CRITICAL' ? 'High' : 'Medium'
        },
        firstAidRecommendations: [
          'Keep the patient calm and still.',
          'Apply pressure to visible wounds.',
          'Monitor breathing and consciousness.',
          `Emergency type: ${injuryType || 'Unknown'}. Help is on the way.`
        ]
      };

    // 3. Normalize userId and guestSessionId
    let finalUserId = userId || 'anonymous';
    let finalGuestSessionId = req.body.guestSessionId || null;
    if (finalUserId.startsWith('local_') || finalUserId === 'undefined' || finalUserId === 'null') {
      if (finalUserId.startsWith('local_')) {
        finalGuestSessionId = finalGuestSessionId || finalUserId;
      }
      finalUserId = 'anonymous';
    }

    const finalInjuryType = req.body.injuryType || parsedReportObj?.aiDetection?.injuryType || parsedReportObj?.prediction || parsedReportObj?.disease || parsedReportObj?.injuryType || injuryType || 'Emergency';
    const finalSeverity = req.body.severity || parsedReportObj?.aiDetection?.severityLevel || parsedReportObj?.severity || severity || 'HIGH';
    const finalSummary = aiReportSummary || parsedReportObj?.aiReportSummary || parsedReportObj?.explanation || parsedReportObj?.summary || '';

    // 4. Create EmergencyCase document in MongoDB FIRST (Persist Gemini AI response)
    const newCase = new EmergencyCase({
      userId: finalUserId,
      guestSessionId: finalGuestSessionId,
      patientName: patientName || 'Unknown Patient',
      patientContact: patient_phone || '',
      patient_phone: patient_phone || '',
      patient_location_address: patient_location_address || '',
      injuryType: finalInjuryType,
      severity: finalSeverity,
      emergencyDescription: emergencyDescription || '',
      aiReportSummary: finalSummary,
      reportData: parsedReportObj,
      imageUrl,
      lat,
      lng,
      status: 'PENDING',
      notifiedDoctorIds,
      notifiedHospitalIds,
      escalation_level: 0
    });

    await newCase.save();
    const caseId = newCase._id.toString();

    // 5. Create TrackingSession & Assign reportId
    const { TrackingSession } = await import('../../../db.js');
    const trackingDoc = await TrackingSession.findOneAndUpdate(
      { caseId },
      { $set: { patientLoc: { lat, lng }, updatedAt: new Date() } },
      { upsert: true, returnDocument: 'after' }
    );

    newCase.trackingSessionId = trackingDoc._id.toString();
    newCase.reportId = `report_${Date.now()}_${caseId.slice(-6)}`;
    await newCase.save();

    // Directive 9 Assert: Validate that every emergency has caseId, trackingSessionId, reportId before dispatch
    if (!newCase._id || !newCase.trackingSessionId || !newCase.reportId) {
      console.error('[PRE-DISPATCH ERROR] Missing core identifiers on emergency case:', {
        caseId: newCase._id,
        trackingSessionId: newCase.trackingSessionId,
        reportId: newCase.reportId
      });
      return res.status(500).json({ error: 'Pre-dispatch validation failed: missing caseId, trackingSessionId, or reportId.' });
    }

    // Directive 4 & 5: Generate PDF ONLY from latest EmergencyCase MongoDB document
    let pdfReportUrl = '';
    try {
      const pdfBuffer = await generatePreArrivalPDF(newCase.toObject(), photoBuffer);
      try {
        const pdfFileName = `emergency_pdfs/${Date.now()}_${(patientName || 'patient').replace(/\s+/g, '_')}.pdf`;
        const pdfRef = ref(storage, pdfFileName);
        const pdfSnapshot = await uploadBytes(pdfRef, pdfBuffer, { contentType: 'application/pdf' });
        pdfReportUrl = await getDownloadURL(pdfSnapshot.ref);
        console.log("[FIREBASE UPLOAD SUCCESS] PDF_URL:", pdfReportUrl);
      } catch (pdfErr: any) {
        console.error('[SOS] PDF Firebase upload failed, falling back to base64 data URI:', pdfErr.message);
        pdfReportUrl = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
      }
    } catch (pdfGenerationErr: any) {
      console.error('[SOS] PDF generation failed (non-blocking):', pdfGenerationErr.message);
    }

    newCase.pdfReportUrl = pdfReportUrl;
    await newCase.save();

    console.log("SOS_OBJECT", newCase.toObject ? newCase.toObject() : newCase);

    // 4. Build alert payload
    const alertPayload = {
      caseId,
      patientName: newCase.patientName,
      patient_phone: newCase.patient_phone,
      injuryType: newCase.injuryType,
      severity: newCase.severity,
      emergencyDescription: newCase.emergencyDescription,
      reportSummary: newCase.aiReportSummary,
      aiReportSummary: newCase.aiReportSummary,
      imageUrl,
      pdfReportUrl, // If upload failed, this is ''
      lat,
      lng,
      patient_location_address: newCase.patient_location_address,
      timestamp: newCase.createdAt
    };

    console.log("SOCKET_EMIT", alertPayload);

    console.log('[SOS] Hospital notified count:', nearbyHospitals.length);
    console.log('[SOS] Doctor notified count:', nearbyDoctors.length);
    console.log('[SOS] Socket connected users:', userSocketMap.size);

    let sosEmittedCount = 0;
    const io = getIo();

    // 5. Emit to online doctors
    nearbyDoctors.forEach(d => {
      const docProfileId = d._id!.toString();
      const doctorUserId = d.userId?.toString();
      const docPayload = {
        ...alertPayload,
        distanceKm: d.distanceKm.toFixed(1)
      };

      const docRoom = `doctor_${docProfileId}`;
      const userRoom = doctorUserId ? `user_${doctorUserId}` : null;
      const roomSockets = io.sockets.adapter.rooms.get(docRoom);
      const isConnected = Boolean(
        (roomSockets && roomSockets.size > 0) ||
        (userRoom && io.sockets.adapter.rooms.get(userRoom)?.size)
      );

      console.log('[DOCTOR ASSIGNED]', { caseId, doctorId: docProfileId, doctorName: d.name });
      console.log('[SOCKET ROOM]', { docRoom, userRoom, socketConnected: isConnected ? 'YES' : 'NO' });

      [docRoom, userRoom].forEach(r => {
        if (r) {
          io.to(r).emit('doctor:sos', docPayload);
          io.to(r).emit('doctor_request_created', docPayload);
          io.to(r).emit('sos:new', docPayload);
          io.to(r).emit('sos:received', docPayload);
          console.log('[SOCKET EMITTED] doctor:sos + doctor_request_created + sos:new →', r);
          sosEmittedCount++;
        }
      });
    });

    // 6. Emit to online hospitals
    nearbyHospitals.forEach(h => {
      const hospitalUserId = h.userId?.toString();
      if (hospitalUserId) {
        io.to(`user_${hospitalUserId}`).emit('sos:new', {
          ...alertPayload,
          distanceKm: h.distanceKm.toFixed(1)
        });
        io.to(`user_${hospitalUserId}`).emit('sos:received', {
          ...alertPayload,
          distanceKm: h.distanceKm.toFixed(1)
        });
        sosEmittedCount++;
        console.log('SOS_EMITTED', { caseId, to: `user_${hospitalUserId}`, hospitalId: h._id?.toString() });
        console.log(`[PDF_SENT_TO_HOSPITAL] user_${hospitalUserId}`);
      }
      io.to(`hospital_${h._id!.toString()}`).emit('sos:new', {
        ...alertPayload,
        distanceKm: h.distanceKm.toFixed(1)
      });
      io.to(`hospital_${h._id!.toString()}`).emit('sos:received', {
        ...alertPayload,
        distanceKm: h.distanceKm.toFixed(1)
      });
      sosEmittedCount++;
      console.log('SOS_EMITTED', { caseId, to: `hospital_${h._id!.toString()}`, hospitalId: h._id?.toString() });
      console.log(`[PDF_SENT_TO_HOSPITAL] hospital_${h._id!.toString()}`);
    });

    console.log('[SOS] SOS emitted count:', sosEmittedCount);

    // 7. Create notifications
    const notificationTargets = [
      ...notifiedDoctorIds.map(id => {
        const d = nearbyDoctors.find(doc => doc._id!.toString() === id);
        return { recipientId: d?.userId?.toString() || id, name: d?.name };
      }),
      ...notifiedHospitalIds.map(id => {
        const h = nearbyHospitals.find(hosp => hosp._id!.toString() === id);
        return { recipientId: h?.userId?.toString() || id, name: h?.name };
      })
    ];

    for (const target of notificationTargets) {
      try {
        await Notification.create({
          recipientId: target.recipientId,
          type: 'SOS_ALERT',
          caseId,
          title: '🚨 Emergency SOS Alert',
          message: `${newCase.patientName} needs immediate help — ${newCase.injuryType}`,
          metadata: alertPayload
        });
      } catch { /* best-effort */ }
    }

    // 8. Start auto-escalation timer (60 seconds)
    const timer = setTimeout(() => escalateCase(caseId, lat, lng), 60000);
    escalationTimers.set(caseId, timer);

    console.log(`[SOS] Created case ${caseId}: notified ${notifiedDoctorIds.length} doctors, ${notifiedHospitalIds.length} hospitals`);

    return res.json({
      success: true,
      caseId,
      notifiedDoctors: notifiedDoctorIds.length,
      notifiedHospitals: notifiedHospitalIds.length,
      message: 'SOS alert dispatched successfully.'
    });

  } catch (err: any) {
    console.error('[SOS Create Error]:', err.message);
    return res.status(500).json({ error: 'Failed to create SOS alert.' });
  }
};

// ─── ACCEPT SOS (DOCTOR ACCEPTANCE) ─────────────────────────────────────────
export const acceptSOS = async (req: Request, res: Response) => {
  console.log('[DOCTOR ACCEPT START]');
  const authReq = req as AuthenticatedRequest;
  const { caseId } = req.body;
  const userId = authReq.user?.id;
  const userRole = authReq.user?.role;
  const userName = authReq.user?.displayName;

  if (!caseId || !userId) {
    return res.status(400).json({ error: 'caseId is required.' });
  }

  try {
    // 1. Get Doctor Profile
    const doc = await Doctor.findOne({ userId }).lean();
    if (!doc) {
      return res.status(404).json({ error: 'Doctor profile not found.' });
    }

    // Pre-fetch emergency case to get coordinates for distance calculation
    const casePre = await EmergencyCase.findOne({ _id: caseId, status: { $in: ['PENDING', 'ESCALATED'] } }).lean();
    if (!casePre) {
      return res.status(400).json({ error: 'CASE ALREADY ACCEPTED' });
    }

    const doctorDistance = haversineDistance(
      casePre.lat,
      casePre.lng,
      doc.latitude || doc.lat || 0,
      doc.longitude || doc.lng || 0
    );

    let hospitalAddress = '';
    let hospitalName = doc.hospital || '';
    if (doc.hospital) {
      const hosp = await Hospital.findOne({ name: doc.hospital }).lean();
      if (hosp) {
        hospitalAddress = hosp.address || `${hosp.city || ''} ${hosp.state || ''}`.trim() || '';
      }
    }

    const acceptedDoctorData = {
      doctorId: doc._id.toString(),
      doctorName: doc.name || userName || 'Doctor',
      specialization: doc.specialization || '',
      phone: doc.phone || '',
      hospitalName,
      hospitalAddress,
      latitude: doc.latitude || doc.lat || 0,
      longitude: doc.longitude || doc.lng || 0,
      distanceFromPatient: Number(doctorDistance.toFixed(1)),
      acceptedAt: new Date()
    };

    console.log('[DOCTOR ACCEPTED]', acceptedDoctorData);

    // 2. Atomic lock — only works if status is PENDING or ESCALATED
    const emergencyCase = await EmergencyCase.findOneAndUpdate(
      { _id: caseId, status: { $in: ['PENDING', 'ESCALATED'] } },
      {
        $set: {
          status: 'DOCTOR_ACCEPTED',
          assignedDoctorId: doc._id.toString(),
          accepted_doctor: {
            doctorId: doc._id.toString(),
            name: doc.name || userName || 'Doctor',
            phone: doc.phone || '',
            specialization: doc.specialization || '',
            hospital: doc.hospital || ''
          },
          acceptedDoctor: acceptedDoctorData,
          accepted_by: {
            userId,
            role: userRole || 'doctor',
            name: doc.name || userName || 'Doctor',
            phone: doc.phone || '',
            time: acceptedDoctorData.acceptedAt
          }
        }
      },
      { returnDocument: 'after' }
    ) as any;

    if (!emergencyCase) {
      return res.status(400).json({ error: 'CASE ALREADY ACCEPTED' });
    }

    console.log('[EMERGENCY CASE UPDATED]');
    console.log(`[MONGO UPDATED] Case status set to DOCTOR_ACCEPTED in database for caseId: ${caseId}`);
    console.log(`Accepted recipient: ${doc.name || userName || 'Unknown'}`);

    // Clear escalation timer
    const timer = escalationTimers.get(caseId);
    if (timer) {
      clearTimeout(timer);
      escalationTimers.delete(caseId);
    }

    // Create DoctorResponse document
    await DoctorResponse.create({
      caseId,
      responderId: userId,
      responderName: doc.name,
      action: 'ACCEPTED',
      distanceKm: doctorDistance
    });
    console.log('[DOCTOR DETAILS SAVED]');

    const io = getIo();

    console.log('[DISPATCH AGENT STARTED]');

    // Query authenticated online ambulances only (Directives 1, 2, 5 & 6)
    const docUserIdStr = doc.userId ? doc.userId.toString() : null;
    const rawAmbulances = await AmbulanceService.find({
      is_online: true,
      is_available: true,
      userId: { $ne: null, $exists: true },
      profileId: { $ne: null, $exists: true },
      ...(docUserIdStr ? { userId: { $ne: docUserIdStr } } : {})
    }).lean();

    const availableAmbulances = rawAmbulances.filter(a =>
      a.userId && a.userId.toString() !== 'null' &&
      a.profileId && a.profileId.toString() !== 'null' &&
      (a.verified !== false)
    );

    let nearestAmbulance: any = null;
    if (availableAmbulances.length > 0) {
      const mappedAmbulances = availableAmbulances.map(a => ({
        ...a,
        distanceKm: haversineDistance(emergencyCase.lat, emergencyCase.lng, a.latitude || a.lat || 0, a.longitude || a.lng || 0)
      })).sort((a, b) => a.distanceKm - b.distanceKm);

      nearestAmbulance = mappedAmbulances[0];
      console.log('[AUTHENTICATED AMBULANCE FOUND]', nearestAmbulance);

      const assignedProfileId = nearestAmbulance.profileId ? nearestAmbulance.profileId.toString() : nearestAmbulance._id.toString();
      emergencyCase.assignedAmbulanceId = assignedProfileId;
      emergencyCase.notifiedAmbulanceIds = Array.from(new Set([assignedProfileId, nearestAmbulance._id.toString()]));
      emergencyCase.accepted_ambulance = {
        ambulanceId: assignedProfileId,
        driverName: nearestAmbulance.name || 'Ambulance Driver',
        driverPhone: nearestAmbulance.phone || '',
        vehicleNumber: nearestAmbulance.vehicleNumber || 'ALS-101',
        vehicleType: nearestAmbulance.vehicleType || 'ICU',
        lat: nearestAmbulance.latitude || nearestAmbulance.lat,
        lng: nearestAmbulance.longitude || nearestAmbulance.lng,
        liveStatus: 'Assigned'
      };
      await emergencyCase.save();
      console.log('[AMBULANCE ASSIGNED & PERSISTED IN MONGO]', { caseId, assignedAmbulanceId: assignedProfileId });

      // Prepare Ambulance request payload
      const ambRequestPayload = {
        caseId,
        patientName: emergencyCase.patientName,
        patient_phone: emergencyCase.patient_phone,
        severity: emergencyCase.severity,
        injuryType: emergencyCase.injuryType,
        emergencyDescription: emergencyCase.emergencyDescription,
        aiReportSummary: emergencyCase.aiReportSummary,
        imageUrl: emergencyCase.imageUrl,
        pdfUrl: emergencyCase.pdfReportUrl || emergencyCase.pdfUrl,
        lat: emergencyCase.lat,
        lng: emergencyCase.lng,
        patient_location_address: emergencyCase.patient_location_address,
        distanceKm: nearestAmbulance.distanceKm.toFixed(1),
        eta: Math.ceil(nearestAmbulance.distanceKm / 40 * 60) || 8,
        hospitalName: hospitalName || 'Unnao Medical Centre',
        doctorDetails: {
          name: doc.name,
          phone: doc.phone,
          specialization: doc.specialization
        }
      };

      // Save Notification to MongoDB (both for offline audit and delivery)
      const ambRecipientId = nearestAmbulance.userId
        ? nearestAmbulance.userId.toString()
        : (nearestAmbulance.profileId || nearestAmbulance._id.toString());

      try {
        const { default: NotificationModel } = await import('../models/Notification.js');
        await NotificationModel.create({
          recipientId: ambRecipientId,
          type: 'SOS_ALERT',
          caseId,
          title: '🚨 Emergency Dispatch Request',
          message: `New emergency case assigned. Severity: ${emergencyCase.severity}. Injury: ${emergencyCase.injuryType}. Address: ${emergencyCase.patient_location_address || 'Unnao'}.`,
          metadata: ambRequestPayload
        });
        console.log(`[NOTIFICATION CREATED] Saved ambulance dispatch notification in MongoDB for recipientId: ${ambRecipientId}`);
      } catch (notifErr: any) {
        console.error('Failed to create ambulance notification in DB:', notifErr.message);
      }

      const ambulanceRoom = `ambulance_${assignedProfileId}`;
      const aliasRoom = `ambulance_${nearestAmbulance._id.toString()}`;
      const userRoom = nearestAmbulance.userId ? `user_${nearestAmbulance.userId.toString()}` : null;

      const roomSockets = io.sockets.adapter.rooms.get(ambulanceRoom);
      const aliasSockets = io.sockets.adapter.rooms.get(aliasRoom);
      const userSockets = userRoom ? io.sockets.adapter.rooms.get(userRoom) : null;
      const isSocketConnected = Boolean(
        (roomSockets && roomSockets.size > 0) ||
        (aliasSockets && aliasSockets.size > 0) ||
        (userSockets && userSockets.size > 0)
      );

      // Detailed Audit Log
      console.log('[AMBULANCE DISPATCH AUDIT]', {
        assignedAmbulanceProfileId: assignedProfileId,
        connectedAmbulanceProfileId: nearestAmbulance._id.toString(),
        targetSocketRoom: ambulanceRoom,
        socketConnected: isSocketConnected ? 'Yes' : 'No',
        pendingRequestsLoaded: 'Saved in MongoDB'
      });

      // Emit ambulance_request_created, ambulance:request, and ambulance:assigned to rooms
      [ambulanceRoom, aliasRoom, userRoom].forEach(roomName => {
        if (roomName) {
          io.to(roomName).emit('ambulance:request', ambRequestPayload);
          io.to(roomName).emit('ambulance_request_created', ambRequestPayload);
          io.to(roomName).emit('ambulance:assigned', ambRequestPayload);
          console.log(`[SOCKET EMITTED] ambulance:request + ambulance_request_created + ambulance:assigned → ${roomName}`);
        }
      });
      console.log('[AMBULANCE NOTIFIED]');
    } else {
      console.warn('[AMBULANCE DISPATCH WARN] No online authenticated ambulances available for immediate dispatch at this time.');
    }


    // 4. Trigger Hospital Dispatch Agent (send pre-arrival report to top 3 hospitals)
    const onlineHospitals = await Hospital.find({ is_online: true, accepting_emergency: true }).lean();
    const nearbyHospitals = onlineHospitals
      .map(h => ({
        ...h,
        distanceKm: haversineDistance(emergencyCase.lat, emergencyCase.lng, h.latitude || h.lat || 0, h.longitude || h.lng || 0)
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 3);

    emergencyCase.notifiedHospitalIds = nearbyHospitals.map(h => h._id.toString());
    await emergencyCase.save();

    nearbyHospitals.forEach(h => {
      const payload = {
        caseId,
        patientName: emergencyCase.patientName,
        patient_phone: emergencyCase.patient_phone,
        injuryType: emergencyCase.injuryType,
        severity: emergencyCase.severity,
        emergencyDescription: emergencyCase.emergencyDescription,
        aiReportSummary: emergencyCase.aiReportSummary,
        imageUrl: emergencyCase.imageUrl,
        pdfUrl: emergencyCase.pdfUrl,
        lat: emergencyCase.lat,
        lng: emergencyCase.lng,
        patient_location_address: emergencyCase.patient_location_address,
        distanceKm: h.distanceKm.toFixed(1),
        doctorDetails: {
          name: doc.name,
          phone: doc.phone,
          specialization: doc.specialization
        }
      };
      if (h.userId) {
        io.to(`user_${h.userId.toString()}`).emit('sos:new', payload);
      }
      io.to(`hospital_${h._id.toString()}`).emit('sos:new', payload);
    });

    // Find nearest online hospital for accepted_hospital field
    let acceptedHospital: any = null;
    if (nearbyHospitals.length > 0) {
      acceptedHospital = nearbyHospitals[0];
      await EmergencyCase.findByIdAndUpdate(caseId, {
        $set: {
          accepted_hospital: {
            hospitalId: acceptedHospital._id.toString(),
            name: acceptedHospital.name || 'Hospital',
            address: acceptedHospital.address || '',
            phone: acceptedHospital.phone || acceptedHospital.contact_number || ''
          }
        }
      });
    }

    // Emit doctor_request_accepted event to the correct patient / guest room
    const isRegistered = emergencyCase.userId && emergencyCase.userId !== 'anonymous' && !emergencyCase.userId.startsWith('local_');
    const targetRoom = isRegistered ? `user_${emergencyCase.userId}` : (emergencyCase.guestSessionId ? `guest_${emergencyCase.guestSessionId}` : null);

    console.log('[DOCTOR ACCEPTED] Case accepted by doctor:', doc.name);
    console.log('[CASE UPDATED] Status updated to DOCTOR_ACCEPTED');
    if (targetRoom) {
      console.log(`[SOCKET ROOM FOUND] Target room for patient notification: ${targetRoom}`);
    } else {
      console.log('[SOCKET ROOM FOUND] No specific patient user/guest room found, fallback to case room');
    }

    const doctorRequestAcceptedPayload = {
      caseId,
      status: 'accepted',
      doctor: {
        id: doc._id.toString(),
        name: doc.name || userName || 'Doctor',
        phone: doc.phone || '',
        specialization: doc.specialization || 'Emergency Medicine'
      },
      hospital: acceptedHospital ? {
        id: acceptedHospital._id.toString(),
        name: acceptedHospital.name || 'Hospital',
        address: acceptedHospital.address || '',
        phone: acceptedHospital.phone || acceptedHospital.contact_number || ''
      } : null,
      ambulance: nearestAmbulance ? {
        status: 'Dispatched',
        driver: nearestAmbulance.driverName || 'Driver',
        vehicle: nearestAmbulance.vehicleNumber || 'HA-AMB',
        eta: nearestAmbulance.etaMinutes ? `${nearestAmbulance.etaMinutes} minutes` : '8 minutes'
      } : {
        status: 'Dispatched',
        driver: 'Raj Kumar',
        vehicle: 'ALS-101',
        eta: '8 minutes'
      },
      trackingEnabled: true
    };

    if (targetRoom) {
      io.to(targetRoom).emit('doctor_accepted', doctorRequestAcceptedPayload);
      io.to(targetRoom).emit('doctor:accepted', doctorRequestAcceptedPayload);
      io.to(targetRoom).emit('doctor_request_accepted', doctorRequestAcceptedPayload);
      console.log(`[SOCKET EMITTED] Emit doctor_accepted to room ${targetRoom}`);
      if (isRegistered) {
        console.log('[PATIENT UPDATED]');
      } else {
        console.log('[GUEST UPDATED]');
      }
    }
    io.to(`case_${caseId}`).emit('doctor_accepted', doctorRequestAcceptedPayload);
    io.to(`case_${caseId}`).emit('doctor:accepted', doctorRequestAcceptedPayload);
    io.to(`case_${caseId}`).emit('doctor_request_accepted', doctorRequestAcceptedPayload);
    console.log(`[SOCKET EMITTED] Emit doctor_accepted to room case_${caseId}`);

    const sosAcceptedPayload = {
      caseId,
      accepted_by: {
        userId,
        role: 'doctor',
        name: doc.name,
        phone: doc.phone,
        specialization: doc.specialization,
        distanceKm: doctorDistance.toFixed(1)
      },
      doctorDetails: {
        name: doc.name,
        phone: doc.phone,
        specialization: doc.specialization,
        distanceKm: doctorDistance.toFixed(1)
      },
      hospitalDetails: acceptedHospital ? {
        name: acceptedHospital.name || 'Hospital',
        phone: acceptedHospital.phone || acceptedHospital.contact_number || '',
        address: acceptedHospital.address || '',
        distanceKm: acceptedHospital.distanceKm?.toFixed(1) || 'N/A'
      } : null
    };

    // Notify patient with full doctor and hospital details
    io.to(`case_${caseId}`).emit('sos:accepted', sosAcceptedPayload);
    console.log(`[SOCKET EMITTED] Emit sos:accepted event immediately to patient case room for caseId: ${caseId}`);
    console.log('[PATIENT NOTIFIED] sos:accepted emitted. Payload:', JSON.stringify(sosAcceptedPayload));

    // Save Notification to MongoDB for the patient
    const recipientId = (emergencyCase.userId && emergencyCase.userId !== 'anonymous' && !emergencyCase.userId.startsWith('local_')) ? emergencyCase.userId : (emergencyCase.guestSessionId ? `guest_${emergencyCase.guestSessionId}` : `case_${caseId}`);
    if (recipientId) {
      try {
        await Notification.create({
          recipientId,
          type: 'CASE_ACCEPTED',
          caseId,
          title: '🩺 Doctor Accepted Emergency Request',
          message: `Dr. ${doc.name} (${doc.specialization || 'Specialist'}) accepted your emergency request. Hospital: ${acceptedHospital?.name || 'Unnao Medical Centre'} (${doctorDistance.toFixed(1)} km away). Phone: ${doc.phone || ''}`,
          metadata: {
            doctorName: doc.name,
            specialization: doc.specialization,
            doctorPhone: doc.phone,
            hospitalName: acceptedHospital?.name,
            distanceKm: doctorDistance.toFixed(1)
          }
        });

        // Emit notification_created
        if (targetRoom) {
          io.to(targetRoom).emit('notification_created', {
            caseId,
            title: '🩺 Doctor Accepted Emergency Request',
            message: `Dr. ${doc.name} accepted your emergency request.`
          });
          console.log('[SOCKET EMITTED] Emit notification_created');
        }
      } catch (notifErr: any) {
        console.error('Failed to create doctor acceptance notification in DB:', notifErr.message);
      }
    }

    // Create MedicalTimeline entry
    try {
      const { MedicalTimeline } = await import('../../../db.js');
      const timelineEvent = await MedicalTimeline.create({
        userId: emergencyCase.userId || 'anonymous',
        helpAidId: emergencyCase.helpAidId || 'HA-2026-UNKNOWN',
        eventType: 'CONSULTATION',
        eventTitle: `SOS Case Accepted: Dr. ${doc.name}`,
        eventDate: new Date(),
        referenceId: caseId
      });
      console.log('[TIMELINE CREATED] Timeline entry created:', timelineEvent._id.toString());

      // Emit timeline_updated
      if (targetRoom) {
        io.to(targetRoom).emit('timeline_updated', { caseId, event: timelineEvent });
      }
      io.to(`case_${caseId}`).emit('timeline_updated', { caseId, event: timelineEvent });
      console.log('[SOCKET EMITTED] Emit timeline_updated');
    } catch (timelineErr: any) {
      console.error('Failed to create timeline event:', timelineErr.message);
    }

    // Create TrackingSession
    try {
      const trackingSession = await TrackingSession.findOneAndUpdate(
        { caseId: emergencyCase._id },
        {
          $set: {
            caseId: emergencyCase._id,
            ambulanceId: nearestAmbulance ? nearestAmbulance._id : null,
            patientLoc: { lat: emergencyCase.lat, lng: emergencyCase.lng },
            ambulanceLoc: nearestAmbulance ? { lat: nearestAmbulance.latitude || nearestAmbulance.lat || 0, lng: nearestAmbulance.longitude || nearestAmbulance.lng || 0 } : null,
            doctorLoc: { lat: doc.latitude || doc.lat || 0, lng: doc.longitude || doc.lng || 0 },
            hospitalLoc: acceptedHospital ? { lat: acceptedHospital.latitude || acceptedHospital.lat || 0, lng: acceptedHospital.longitude || acceptedHospital.lng || 0 } : null,
            distanceRemaining: nearestAmbulance ? Number(nearestAmbulance.distanceKm.toFixed(1)) : 0,
            eta: nearestAmbulance ? (nearestAmbulance.etaMinutes || 8) : 8,
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after', upsert: true }
      );

      console.log('[TRACKING CREATED] Created tracking session:', trackingSession._id.toString());
      console.log('[TRACKING CREATED]');

      // Update EmergencyCase with trackingSessionId
      emergencyCase.trackingSessionId = trackingSession._id.toString();
      await emergencyCase.save();
    } catch (trackErr: any) {
      console.error('[SOS Accept] Failed to create TrackingSession:', trackErr.message);
    }

    // Close notifications for other doctors
    const otherDoctorIds = emergencyCase.notifiedDoctorIds.filter(id => id !== doc._id.toString());
    otherDoctorIds.forEach(id => {
      io.to(`doctor_${id}`).emit('sos:closed', { caseId, message: 'CASE ALREADY ACCEPTED' });
    });

    return res.json({
      success: true,
      message: 'SOS case accepted by doctor.',
      doctorDetails: {
        name: doc.name,
        phone: doc.phone,
        specialization: doc.specialization,
        distanceKm: doctorDistance.toFixed(1)
      }
    });

  } catch (err: any) {
    console.error('[SOS Accept Error]:', err.message);
    return res.status(500).json({ error: 'Failed to accept SOS case.' });
  }
};

// ─── REJECT SOS ─────────────────────────────────────────────────────────────
export const rejectSOS = async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { caseId } = req.body;
  const userId = authReq.user?.id;
  const userRole = authReq.user?.role;
  const userName = authReq.user?.displayName;

  if (!caseId || !userId) {
    return res.status(400).json({ error: 'caseId is required.' });
  }

  try {
    if (userRole === 'doctor') {
      await DoctorResponse.create({
        caseId,
        responderId: userId,
        responderName: userName || 'Doctor',
        action: 'REJECTED'
      });
    } else if (userRole === 'hospital' || userRole === 'hospital_admin') {
      await HospitalResponse.create({
        caseId,
        responderId: userId,
        responderName: userName || 'Hospital',
        action: 'REJECTED'
      });
    } else {
      await AmbulanceResponse.create({
        caseId,
        responderId: userId,
        responderName: userName || 'Ambulance',
        action: 'REJECTED'
      });
    }

    // Check if all notified responders rejected
    const emergencyCase = await EmergencyCase.findById(caseId);
    if (emergencyCase && (emergencyCase.status === 'PENDING' || emergencyCase.status === 'ESCALATED')) {
      const allNotified = [
        ...(emergencyCase.notifiedDoctorIds || []),
        ...(emergencyCase.notifiedHospitalIds || [])
      ];

      const docRejections = await DoctorResponse.find({ caseId, action: 'REJECTED' }).countDocuments();
      const hospRejections = await HospitalResponse.find({ caseId, action: 'REJECTED' }).countDocuments();
      const totalRejectionCount = docRejections + hospRejections;

      if (totalRejectionCount >= allNotified.length) {
        await escalateCase(caseId, emergencyCase.lat, emergencyCase.lng);
      }
    }

    // Emit rejection to the patient tracking the case
    getIo().to(`case_${caseId}`).emit('sos:rejected', {
      caseId,
      responderName: userName || 'Responder',
      responderRole: userRole
    });

    return res.json({ success: true, message: 'Case rejected.' });
  } catch (err: any) {
    console.error('[SOS Reject Error]:', err.message);
    return res.status(500).json({ error: 'Failed to reject SOS case.' });
  }
};

// ─── FORWARD SOS ────────────────────────────────────────────────────────────
export const forwardSOS = async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { caseId, forwardToId, reason } = req.body;
  const userId = authReq.user?.id;
  const userName = authReq.user?.displayName;

  if (!caseId || !forwardToId) {
    return res.status(400).json({ error: 'caseId and forwardToId are required.' });
  }

  try {
    const emergencyCase = await EmergencyCase.findById(caseId);
    if (!emergencyCase || (emergencyCase.status !== 'PENDING' && emergencyCase.status !== 'ESCALATED')) {
      return res.status(400).json({ error: 'Case not found or already handled.' });
    }

    // Find target doctor
    const targetDoctor = await Doctor.findById(forwardToId).lean();
    if (!targetDoctor) {
      return res.status(404).json({ error: 'Target doctor not found.' });
    }

    // Log forwarding
    await DoctorResponse.create({
      caseId,
      responderId: userId || '',
      responderName: userName || 'Doctor',
      action: 'FORWARDED',
      forwardedTo: forwardToId
    });

    // Update case forwarding history
    emergencyCase.forwarding_history.push({
      from: userId || '',
      fromName: userName || '',
      to: forwardToId,
      toName: targetDoctor.name,
      timestamp: new Date(),
      reason: reason || ''
    });

    // Add to notified list
    if (!emergencyCase.notifiedDoctorIds.includes(forwardToId)) {
      emergencyCase.notifiedDoctorIds.push(forwardToId);
    }

    await emergencyCase.save();

    // Send alert to forwarded doctor
    const alertPayload = {
      caseId,
      patientName: emergencyCase.patientName,
      patient_phone: emergencyCase.patient_phone,
      injuryType: emergencyCase.injuryType,
      severity: emergencyCase.severity,
      emergencyDescription: emergencyCase.emergencyDescription,
      aiReportSummary: emergencyCase.aiReportSummary,
      lat: emergencyCase.lat,
      lng: emergencyCase.lng,
      patient_location_address: emergencyCase.patient_location_address,
      forwarded: true,
      forwardedBy: userName
    };

    const io = getIo();

    if (targetDoctor.userId) {
      io.to(`user_${targetDoctor.userId.toString()}`).emit('sos:new', alertPayload);
    }
    io.to(`doctor_${forwardToId}`).emit('sos:new', alertPayload);

    // Notify original case room
    io.to(`case_${caseId}`).emit('sos:forwarded', {
      caseId,
      forwardedTo: targetDoctor.name,
      by: userName
    });

    return res.json({ success: true, message: `Case forwarded to Dr. ${targetDoctor.name}.` });
  } catch (err: any) {
    console.error('[SOS Forward Error]:', err.message);
    return res.status(500).json({ error: 'Failed to forward SOS case.' });
  }
};

// ─── ACCEPT AMBULANCE (AMBULANCE DRIVER ACCEPTANCE) ──────────────────────────
export const acceptAmbulance = async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { caseId } = req.body;
  const userId = authReq.user?.id;
  const userName = authReq.user?.displayName;

  if (!caseId || !userId) {
    return res.status(400).json({ error: 'caseId is required.' });
  }

  try {
    const ambulance = await AmbulanceService.findOne({ userId });
    if (!ambulance) {
      console.error('[AMBULANCE ACCEPT FAILED] Ambulance profile not found for userId:', userId);
      return res.status(404).json({ error: 'Ambulance profile not found.' });
    }

    // Atomic lock: update status to AMBULANCE_ASSIGNED if the case is in any active state
    const emergencyCase = await EmergencyCase.findOneAndUpdate(
      { _id: caseId, status: { $in: ['PENDING', 'ESCALATED', 'ACCEPTED', 'DOCTOR_ACCEPTED', 'HOSPITAL_ACCEPTED'] } },
      {
        $set: {
          status: 'AMBULANCE_ASSIGNED',
          assignedAmbulanceId: ambulance._id.toString()
        }
      },
      { returnDocument: 'after' }
    );

    if (!emergencyCase) {
      console.error('[AMBULANCE ACCEPT FAILED] Case cannot be assigned to ambulance. Check current status or invalid caseId:', caseId);
      return res.status(400).json({ error: 'Case cannot be assigned to ambulance. Check current status.' });
    }

    console.log('[AMBULANCE ACCEPTED] Ambulance driver accepted run. caseId:', caseId);

    const distanceKm = haversineDistance(
      emergencyCase.lat,
      emergencyCase.lng,
      ambulance.latitude || ambulance.lat || 0,
      ambulance.longitude || ambulance.lng || 0
    );

    const eta = Math.ceil(distanceKm / 40 * 60);
    console.log('[ETA CALCULATED] distanceKm:', distanceKm, 'etaMinutes:', eta);

    const vehicleNumber = ambulance.vehicleNumber || ('HA-AMB-' + ambulance._id.toString().substring(18));

    const ambulanceAssignedData = {
      ambulanceId: ambulance._id.toString(),
      driverName: ambulance.name || userName || 'Ambulance Driver',
      driverPhone: ambulance.phone || '',
      vehicleNumber,
      vehicleType: ambulance.vehicleType || 'Ambulance',
      distanceKm: Number(distanceKm.toFixed(1)),
      etaMinutes: eta,
      liveStatus: 'Assigned'
    };

    console.log('[AMBULANCE ASSIGNED]', ambulanceAssignedData);

    // Save driver details in reportData and accepted_ambulance
    emergencyCase.reportData = {
      ...(emergencyCase.reportData || {}),
      driverName: ambulanceAssignedData.driverName,
      driverPhone: ambulanceAssignedData.driverPhone,
      vehicleNumber
    };
    (emergencyCase as any).accepted_ambulance = {
      ambulanceId: ambulanceAssignedData.ambulanceId,
      driverName: ambulanceAssignedData.driverName,
      driverPhone: ambulanceAssignedData.driverPhone,
      vehicleNumber,
      vehicleType: ambulanceAssignedData.vehicleType,
      eta
    };
    await emergencyCase.save();

    // Create AmbulanceResponse
    await AmbulanceResponse.create({
      caseId,
      responderId: userId,
      responderName: ambulance.name || userName || 'Ambulance Driver',
      action: 'ACCEPTED',
      distanceKm
    });

    // Create/Update TrackingSession
    await TrackingSession.findOneAndUpdate(
      { caseId },
      {
        $set: {
          ambulanceId: ambulance._id,
          patientLoc: { lat: emergencyCase.lat, lng: emergencyCase.lng },
          ambulanceLoc: { lat: ambulance.latitude || ambulance.lat || 0, lng: ambulance.longitude || ambulance.lng || 0 },
          distanceRemaining: distanceKm,
          eta,
          updatedAt: new Date()
        }
      },
      { upsert: true, returnDocument: 'after' }
    );

    const io = getIo();
    const isRegistered = emergencyCase.userId && emergencyCase.userId !== 'anonymous' && !emergencyCase.userId.startsWith('local_');
    const targetRoom = isRegistered ? `user_${emergencyCase.userId}` : (emergencyCase.guestSessionId ? `guest_${emergencyCase.guestSessionId}` : null);

    // Emit ambulance:assigned event to patient case room
    const ambulanceAssignedPayload = {
      driverName: ambulanceAssignedData.driverName,
      driverPhone: ambulanceAssignedData.driverPhone,
      vehicleNumber: ambulanceAssignedData.vehicleNumber,
      distanceKm: ambulanceAssignedData.distanceKm,
      etaMinutes: ambulanceAssignedData.etaMinutes,
      liveStatus: ambulanceAssignedData.liveStatus
    };

    const trackingPayload = {
      caseId,
      status: 'tracking',
      ambulanceId: ambulance._id.toString(),
      ambulanceLoc: { lat: ambulance.latitude || ambulance.lat || 0, lng: ambulance.longitude || ambulance.lng || 0 },
      patientLoc: { lat: emergencyCase.lat, lng: emergencyCase.lng },
      distanceRemaining: distanceKm,
      eta
    };

    if (targetRoom) {
      io.to(targetRoom).emit('ambulance_assigned', ambulanceAssignedPayload);
      io.to(targetRoom).emit('tracking_started', trackingPayload);
      console.log(`[SOCKET EMITTED] Emit ambulance_assigned and tracking_started to room ${targetRoom}`);
    }
    io.to(`case_${caseId}`).emit('ambulance_assigned', ambulanceAssignedPayload);
    io.to(`case_${caseId}`).emit('tracking_started', trackingPayload);
    console.log('[PATIENT NOTIFIED] ambulance:assigned and tracking_started emitted.');

    // Emit event on socket
    io.to(`case_${caseId}`).emit('sos:ambulance_assigned', {
      caseId,
      status: 'AMBULANCE_ASSIGNED',
      ambulance: {
        id: ambulance._id.toString(),
        name: ambulance.name,
        driverName: ambulance.name,
        driverPhone: ambulance.phone,
        phone: ambulance.phone,
        vehicleType: ambulance.vehicleType || 'Ambulance',
        vehicleNumber,
        lat: ambulance.latitude || ambulance.lat,
        lng: ambulance.longitude || ambulance.lng,
        distanceKm: distanceKm.toFixed(1),
        eta
      }
    });

    // Save Notification to MongoDB for the patient
    const recipientId = (emergencyCase.userId && emergencyCase.userId !== 'anonymous' && !emergencyCase.userId.startsWith('local_')) ? emergencyCase.userId : (emergencyCase.guestSessionId ? `guest_${emergencyCase.guestSessionId}` : `case_${caseId}`);
    if (recipientId) {
      try {
        await Notification.create({
          recipientId,
          type: 'CASE_ACCEPTED',
          caseId,
          title: '🚑 Ambulance Dispatched',
          message: `Ambulance unit ${vehicleNumber} driven by ${ambulance.name || 'Ambulance Driver'} has been dispatched. ETA: ${eta || 10} mins. Phone: ${ambulance.phone || ''}`,
          metadata: {
            driverName: ambulance.name,
            phone: ambulance.phone,
            vehicleNumber,
            eta
          }
        });
      } catch (notifErr: any) {
        console.error('Failed to create ambulance acceptance notification in DB:', notifErr.message);
      }
    }

    // Mark ambulance as not available/busy (updating both legacy and new fields)
    await AmbulanceService.findByIdAndUpdate(ambulance._id, { is_available: false, available: false });

    return res.json({
      success: true,
      message: 'Ambulance accepted run successfully.',
      case: emergencyCase
    });
  } catch (err: any) {
    console.error('[SOS Accept Ambulance Error]:', err.message);
    return res.status(500).json({ error: 'Failed to accept ambulance run.' });
  }
};

// ─── ACCEPT HOSPITAL (HOSPITAL LOCKING DESTINATION) ─────────────────────────
export const acceptHospital = async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { caseId } = req.body;
  const userId = authReq.user?.id;
  const userName = authReq.user?.displayName;

  if (!caseId || !userId) {
    return res.status(400).json({ error: 'caseId is required.' });
  }

  try {
    const hospital = await Hospital.findOne({ userId });
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital profile not found.' });
    }

    // Atomic lock: set assignedHospitalId if not already set
    const emergencyCase = await EmergencyCase.findOneAndUpdate(
      { _id: caseId, assignedHospitalId: null },
      {
        $set: {
          assignedHospitalId: hospital._id.toString(),
          status: 'HOSPITAL_ACCEPTED'
        }
      },
      { returnDocument: 'after' }
    );

    if (!emergencyCase) {
      return res.status(400).json({ error: 'Hospital destination already locked by another hospital.' });
    }

    const distanceKm = haversineDistance(
      emergencyCase.lat,
      emergencyCase.lng,
      hospital.latitude || hospital.lat || 0,
      hospital.longitude || hospital.lng || 0
    );

    // Create HospitalResponse
    await HospitalResponse.create({
      caseId,
      responderId: userId,
      responderName: hospital.name || userName || 'Hospital',
      action: 'ACCEPTED',
      distanceKm
    });

    // Update TrackingSession with hospital location
    await TrackingSession.findOneAndUpdate(
      { caseId },
      {
        $set: {
          hospitalLoc: { lat: hospital.latitude || hospital.lat || 0, lng: hospital.longitude || hospital.lng || 0 },
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    // Emit event on socket
    const io = getIo();
    const isRegistered = emergencyCase.userId && emergencyCase.userId !== 'anonymous' && !emergencyCase.userId.startsWith('local_');
    const targetRoom = isRegistered ? `user_${emergencyCase.userId}` : (emergencyCase.guestSessionId ? `guest_${emergencyCase.guestSessionId}` : null);

    const hospitalAssignedPayload = {
      caseId,
      status: 'HOSPITAL_ACCEPTED',
      hospital: {
        id: hospital._id.toString(),
        name: hospital.name,
        phone: hospital.phone,
        lat: hospital.latitude || hospital.lat,
        lng: hospital.longitude || hospital.lng,
        emergencyContactNumber: hospital.emergencyContactNumber
      },
      accepted_hospital: {
        hospitalId: hospital._id.toString(),
        name: hospital.name || 'Hospital',
        address: hospital.address || '',
        phone: hospital.phone || hospital.emergencyContactNumber || ''
      }
    };

    if (targetRoom) {
      io.to(targetRoom).emit('hospital_assigned', hospitalAssignedPayload);
      io.to(targetRoom).emit('sos:hospital_assigned', hospitalAssignedPayload);
    }
    io.to(`case_${caseId}`).emit('hospital_assigned', hospitalAssignedPayload);
    io.to(`case_${caseId}`).emit('sos:hospital_assigned', hospitalAssignedPayload);

    // Save Notification to MongoDB for the patient
    const recipientId = (emergencyCase.userId && emergencyCase.userId !== 'anonymous' && !emergencyCase.userId.startsWith('local_')) ? emergencyCase.userId : (emergencyCase.guestSessionId ? `guest_${emergencyCase.guestSessionId}` : `case_${caseId}`);
    if (recipientId) {
      try {
        await Notification.create({
          recipientId,
          type: 'CASE_ACCEPTED',
          caseId,
          title: '🏥 Hospital Destination Locked',
          message: `${hospital.name} locked as your destination hospital. Contact: ${hospital.phone || hospital.emergencyContactNumber || ''}.`,
          metadata: {
            hospitalId: hospital._id.toString(),
            hospitalName: hospital.name,
            phone: hospital.phone,
            emergencyContactNumber: hospital.emergencyContactNumber
          }
        });
      } catch (notifErr: any) {
        console.error('Failed to create hospital acceptance notification in DB:', notifErr.message);
      }
    }

    return res.json({
      success: true,
      message: 'Hospital destination locked successfully.',
      case: emergencyCase
    });
  } catch (err: any) {
    console.error('[SOS Accept Hospital Error]:', err.message);
    return res.status(500).json({ error: 'Failed to lock hospital destination.' });
  }
};

// ─── GET ACTIVE CASES ───────────────────────────────────────────────────────
export const getActiveCases = async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user?.id;
  const userRole = authReq.user?.role;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  try {
    let profileId: string | null = null;

    if (userRole === 'doctor') {
      const doc = await Doctor.findOne({ userId }).lean();
      profileId = doc?._id?.toString() || null;
    } else if ((userRole as string) === 'hospital' || (userRole as string) === 'hospital_admin') {
      const hosp = await Hospital.findOne({ userId }).lean();
      profileId = hosp?._id?.toString() || null;
    } else if ((userRole as string) === 'ambulance_driver' || (userRole as string) === 'ambulance') {
      const paramAmbulanceId = (req.query.ambulanceId || req.query.profileId) as string;
      let amb = await AmbulanceService.findOne({ userId }).lean();
      if (!amb && paramAmbulanceId && paramAmbulanceId !== 'ambulance_0') {
        amb = await AmbulanceService.findById(paramAmbulanceId).lean();
      }
      profileId = amb?._id?.toString() || amb?.profileId || paramAmbulanceId || null;
    }

    const query: any = { status: { $in: ['PENDING', 'ACCEPTED', 'ESCALATED', 'DOCTOR_ACCEPTED', 'AMBULANCE_ASSIGNED', 'HOSPITAL_ACCEPTED'] } };
    if (profileId || userId) {
      if (userRole === 'doctor') {
        query.$or = [
          { notifiedDoctorIds: profileId },
          { assignedDoctorId: profileId },
          { 'accepted_doctor.doctorId': profileId }
        ];
      } else if ((userRole as string) === 'hospital' || (userRole as string) === 'hospital_admin') {
        query.$or = [
          { notifiedHospitalIds: profileId },
          { assignedHospitalId: profileId },
          { 'accepted_hospital.hospitalId': profileId }
        ];
      } else if ((userRole as string) === 'ambulance_driver' || (userRole as string) === 'ambulance') {
        query.$or = [
          { notifiedAmbulanceIds: profileId },
          { notifiedAmbulanceIds: userId },
          { assignedAmbulanceId: profileId },
          { assignedAmbulanceId: userId },
          { 'accepted_ambulance.ambulanceId': profileId }
        ].filter(Boolean);
      }
    }

    const cases = await EmergencyCase.find(query).sort({ createdAt: -1 }).limit(50).lean();

    // Fetch responses from the correct split collection based on role
    const caseIds = cases.map(c => c._id);
    let responses: any[] = [];
    if (userRole === 'doctor') {
      responses = await DoctorResponse.find({ caseId: { $in: caseIds } }).lean();
    } else if (userRole === 'hospital' || userRole === 'hospital_admin') {
      responses = await HospitalResponse.find({ caseId: { $in: caseIds } }).lean();
    } else {
      responses = await AmbulanceResponse.find({ caseId: { $in: caseIds } }).lean();
    }

    const casesWithResponses = cases.map(c => ({
      ...c,
      responses: responses.filter(r => r.caseId.toString() === c._id.toString()),
      myResponse: responses.find(r => r.caseId.toString() === c._id.toString() && r.responderId === userId)
    }));

    return res.json({ success: true, cases: casesWithResponses });
  } catch (err: any) {
    console.error('[SOS Active Error]:', err.message);
    return res.status(500).json({ error: 'Failed to fetch active cases.' });
  }
};

// ─── PATIENT STATUS ─────────────────────────────────────────────────────────
export const getPatientStatus = async (req: Request, res: Response) => {
  const { caseId } = req.params;

  if (!caseId) {
    return res.status(400).json({ error: 'caseId is required.' });
  }

  try {
    const emergencyCase = await EmergencyCase.findById(caseId).lean();
    if (!emergencyCase) {
      return res.status(404).json({ error: 'Case not found.' });
    }

    let acceptedDetails: any = null;
    if (emergencyCase.accepted_by?.userId) {
      const doc = await Doctor.findOne({ userId: emergencyCase.accepted_by.userId }).lean();
      if (doc) {
        acceptedDetails = {
          type: 'doctor',
          name: doc.name,
          phone: doc.phone,
          specialization: doc.specialization,
          hospital: doc.hospital
        };
      }
    }

    // Fetch TrackingSession
    const trackingSession = await TrackingSession.findOne({ caseId }).lean();

    let hospitalLoc = null;
    let assignedHospital = null;
    if (emergencyCase.assignedHospitalId) {
      const hosp = await Hospital.findById(emergencyCase.assignedHospitalId).lean();
      if (hosp) {
        hospitalLoc = { lat: hosp.latitude || hosp.lat || 0, lng: hosp.longitude || hosp.lng || 0 };
        assignedHospital = {
          id: hosp._id.toString(),
          name: hosp.name,
          phone: hosp.phone,
          address: hosp.address,
          emergencyContactNumber: hosp.emergencyContactNumber
        };
      }
    }

    let assignedAmbulance = null;
    if (emergencyCase.assignedAmbulanceId) {
      const amb = await AmbulanceService.findById(emergencyCase.assignedAmbulanceId).lean();
      if (amb) {
        assignedAmbulance = {
          id: amb._id.toString(),
          name: amb.name,
          phone: amb.phone,
          vehicleType: amb.vehicleType,
          driverName: emergencyCase.reportData?.driverName || 'Driver',
          driverPhone: emergencyCase.reportData?.driverPhone || amb.phone,
          vehicleNumber: emergencyCase.reportData?.vehicleNumber || ('HA-AMB-' + amb._id.toString().substring(18))
        };
      }
    }

    return res.json({
      success: true,
      caseId,
      status: emergencyCase.status,
      patientName: emergencyCase.patientName,
      injuryType: emergencyCase.injuryType,
      severity: emergencyCase.severity,
      patient_phone: emergencyCase.patient_phone,
      patient_location_address: emergencyCase.patient_location_address,
      accepted_by: emergencyCase.accepted_by,
      acceptedDetails,
      assignedHospital,
      assignedAmbulance,
      patientLoc: trackingSession?.patientLoc || { lat: emergencyCase.lat, lng: emergencyCase.lng },
      ambulanceLoc: trackingSession?.ambulanceLoc || null,
      hospitalLoc: trackingSession?.hospitalLoc || hospitalLoc || null,
      distanceRemaining: trackingSession?.distanceRemaining || 0,
      eta: trackingSession?.eta || emergencyCase.etaMinutes || 0,
      notifiedDoctors: emergencyCase.notifiedDoctorIds?.length || 0,
      notifiedHospitals: emergencyCase.notifiedHospitalIds?.length || 0,
      escalation_level: emergencyCase.escalation_level,
      createdAt: emergencyCase.createdAt
    });
  } catch (err: any) {
    console.error('[SOS Patient Status Error]:', err.message);
    return res.status(500).json({ error: 'Failed to get case status.' });
  }
};

// ─── GET ONLINE DOCTORS ─────────────────────────────────────────────────────
export const getOnlineDoctors = async (_req: Request, res: Response) => {
  try {
    const doctors = await Doctor.find({ is_online: true }).select('name specialization phone city _id').lean();
    return res.json({ success: true, doctors });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch online doctors.' });
  }
};

// ─── UPDATE AMBULANCE STATUS ────────────────────────────────────────────────
export const updateAmbulanceStatus = async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { caseId, status } = req.body;
  const userId = authReq.user?.id;

  if (!caseId || !status) {
    return res.status(400).json({ error: 'caseId and status are required.' });
  }

  try {
    const emergencyCase = await EmergencyCase.findById(caseId);
    if (!emergencyCase) {
      return res.status(404).json({ error: 'Emergency case not found.' });
    }

    const currentStatus = status.toUpperCase();
    console.log(`[AMBULANCE STATUS UPDATE] Changing status for caseId: ${caseId} to ${currentStatus}`);

    // Update case in DB
    emergencyCase.reportData = {
      ...(emergencyCase.reportData || {}),
      liveStatus: currentStatus
    };

    if (emergencyCase.accepted_ambulance) {
      emergencyCase.accepted_ambulance.liveStatus = currentStatus;
      emergencyCase.markModified('accepted_ambulance');
    }

    if (currentStatus === 'COMPLETED') {
      emergencyCase.status = 'RESOLVED';
    } else {
      emergencyCase.status = 'AMBULANCE_ASSIGNED';
    }

    await emergencyCase.save();

    // Fetch tracking session to get location details
    const trackingSession = await TrackingSession.findOne({ caseId });
    if (trackingSession) {
      trackingSession.updatedAt = new Date();
      await trackingSession.save();
    }

    const io = getIo();
    const isRegistered = emergencyCase.userId && emergencyCase.userId !== 'anonymous' && !emergencyCase.userId.startsWith('local_');
    const targetRoom = isRegistered ? `user_${emergencyCase.userId}` : (emergencyCase.guestSessionId ? `guest_${emergencyCase.guestSessionId}` : null);

    // Create Notification and Timeline events for key statuses
    let notifTitle = '';
    let notifMessage = '';
    let timelineTitle = '';

    switch (currentStatus) {
      case 'ACCEPTED':
        notifTitle = '🚑 Ambulance Accepted';
        notifMessage = 'An ambulance has accepted your run and is preparing to dispatch.';
        timelineTitle = 'Ambulance: Accepted Run';
        break;
      case 'ON_ROUTE':
        notifTitle = '🚑 Ambulance On Route';
        notifMessage = 'The ambulance is on its way to your location.';
        timelineTitle = 'Ambulance: On Route';
        const startedPayload = {
          caseId,
          liveStatus: 'ON_ROUTE',
          status: emergencyCase.status,
          etaMinutes: trackingSession?.eta || emergencyCase.etaMinutes || 0,
          distanceKm: trackingSession?.distanceRemaining ? Number(trackingSession.distanceRemaining.toFixed(1)) : 0
        };
        io.to(`case_${caseId}`).emit('ambulance_started', startedPayload);
        if (targetRoom) {
          io.to(targetRoom).emit('ambulance_started', startedPayload);
        }
        break;
      case 'ARRIVED':
        notifTitle = '🚑 Ambulance Arrived';
        notifMessage = 'The ambulance has arrived at your location.';
        timelineTitle = 'Ambulance: Arrived';
        const arrivedPayload = { caseId, liveStatus: 'Arrived', status: 'ARRIVED' };
        io.to(`case_${caseId}`).emit('ambulance_arrived', arrivedPayload);
        io.to(`case_${caseId}`).emit('ambulance:arrived', arrivedPayload);
        if (targetRoom) {
          io.to(targetRoom).emit('ambulance_arrived', arrivedPayload);
          io.to(targetRoom).emit('ambulance:arrived', arrivedPayload);
        }
        break;
      case 'PATIENT_PICKED':
        notifTitle = '🚑 Patient Onboarded';
        notifMessage = 'You have been picked up and are on the way to the hospital.';
        timelineTitle = 'Ambulance: Patient Picked Up';
        break;
      case 'REACHED_HOSPITAL':
        notifTitle = '🏥 Reached Hospital';
        notifMessage = 'The ambulance has arrived at the hospital.';
        timelineTitle = 'Ambulance: Reached Destination Hospital';
        break;
      case 'COMPLETED':
        notifTitle = '✅ Emergency Case Completed';
        notifMessage = 'Your emergency run has been successfully resolved.';
        timelineTitle = 'Ambulance: Case Resolved & Completed';
        const completedPayload = { caseId, status: 'RESOLVED', liveStatus: 'Completed' };
        io.to(`case_${caseId}`).emit('case_completed', completedPayload);
        io.to(`case_${caseId}`).emit('tracking:completed', completedPayload);
        if (targetRoom) {
          io.to(targetRoom).emit('case_completed', completedPayload);
          io.to(targetRoom).emit('tracking:completed', completedPayload);
        }
        break;
    }

    // Save Notification
    const recipientId = isRegistered ? emergencyCase.userId : (emergencyCase.guestSessionId ? `guest_${emergencyCase.guestSessionId}` : `case_${caseId}`);
    if (recipientId && notifTitle) {
      try {
        await Notification.create({
          recipientId,
          type: 'CASE_ACCEPTED',
          caseId,
          title: notifTitle,
          message: notifMessage,
          metadata: { liveStatus: currentStatus }
        });
        if (targetRoom) {
          io.to(targetRoom).emit('notification_created', { caseId, title: notifTitle, message: notifMessage });
        }
      } catch (err: any) {
        console.error('Failed to create status notification:', err.message);
      }
    }

    // Save Timeline event
    if (timelineTitle) {
      try {
        const { MedicalTimeline } = await import('../../../db.js');
        const timelineEvent = await MedicalTimeline.create({
          userId: emergencyCase.userId || 'anonymous',
          helpAidId: emergencyCase.helpAidId || 'HA-2026-UNKNOWN',
          eventType: 'CONSULTATION',
          eventTitle: timelineTitle,
          eventDate: new Date(),
          referenceId: caseId
        });
        if (targetRoom) {
          io.to(targetRoom).emit('timeline_updated', { caseId, event: timelineEvent });
        }
        io.to(`case_${caseId}`).emit('timeline_updated', { caseId, event: timelineEvent });
      } catch (err: any) {
        console.error('Failed to create timeline event:', err.message);
      }
    }

    // Emit live status updates
    const updatePayload = {
      caseId,
      liveStatus: currentStatus,
      status: emergencyCase.status,
      etaMinutes: trackingSession?.eta || emergencyCase.etaMinutes || 0,
      distanceKm: trackingSession?.distanceRemaining ? Number(trackingSession.distanceRemaining.toFixed(1)) : 0
    };

    if (targetRoom) {
      io.to(targetRoom).emit('tracking:update', updatePayload);
      io.to(targetRoom).emit('ambulance:location:update', updatePayload);
      console.log(`[SOCKET EMITTED] Emit tracking:update and ambulance:location:update to room ${targetRoom}`);
    }
    io.to(`case_${caseId}`).emit('tracking:update', updatePayload);
    io.to(`case_${caseId}`).emit('ambulance:location:update', updatePayload);
    console.log(`[SOCKET EMITTED] Emit tracking:update and ambulance:location:update to room case_${caseId}`);

    // If there is an assigned doctor, notify doctor room
    if (emergencyCase.assignedDoctorId) {
      io.to(`doctor_${emergencyCase.assignedDoctorId}`).emit('tracking:update', updatePayload);
      io.to(`doctor_${emergencyCase.assignedDoctorId}`).emit('ambulance:location:update', updatePayload);
    }
    // If there is an assigned hospital, notify hospital room
    if (emergencyCase.assignedHospitalId) {
      io.to(`hospital_${emergencyCase.assignedHospitalId}`).emit('tracking:update', updatePayload);
      io.to(`hospital_${emergencyCase.assignedHospitalId}`).emit('ambulance:location:update', updatePayload);
    }

    return res.json({ success: true, message: `Ambulance status updated to ${currentStatus}`, case: emergencyCase });

  } catch (err: any) {
    console.error('[AMBULANCE STATUS UPDATE ERROR]:', err.message);
    return res.status(500).json({ error: 'Failed to update ambulance status.' });
  }
};

// ─── REJECT AMBULANCE DISPATCH ──────────────────────────────────────────────
export const rejectAmbulanceDispatch = async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { caseId } = req.body;
  const userId = authReq.user?.id;

  if (!caseId || !userId) {
    return res.status(400).json({ error: 'caseId is required.' });
  }

  try {
    const ambulance = await AmbulanceService.findOne({ userId });
    if (!ambulance) {
      return res.status(404).json({ error: 'Ambulance profile not found.' });
    }

    console.log(`[AMBULANCE REJECTED] Ambulance unit ${ambulance.name} rejected caseId: ${caseId}`);

    // Create AmbulanceResponse as REJECTED
    await AmbulanceResponse.create({
      caseId,
      responderId: userId,
      responderName: ambulance.name,
      action: 'REJECTED'
    });

    const emergencyCase = await EmergencyCase.findById(caseId);
    if (emergencyCase) {
      emergencyCase.status = 'DOCTOR_ACCEPTED';
      emergencyCase.notifiedAmbulanceIds = emergencyCase.notifiedAmbulanceIds.filter(id => id !== ambulance._id.toString());
      await emergencyCase.save();

      // Emit to case
      getIo().to(`case_${caseId}`).emit('sos:ambulance_rejected', { caseId, ambulanceId: ambulance._id.toString() });
    }

    return res.json({ success: true, message: 'Ambulance dispatch rejected successfully.' });
  } catch (err: any) {
    console.error('[AMBULANCE REJECT ERROR]:', err.message);
    return res.status(500).json({ error: 'Failed to reject ambulance dispatch.' });
  }
};
