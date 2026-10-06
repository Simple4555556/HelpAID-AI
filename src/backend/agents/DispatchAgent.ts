import { AgentState, DispatchState } from './AgentState';
import { EmergencyCase, createConsentLog, isDbConnected } from '../../../db';

export const DispatchAgent = async (state: AgentState): Promise<Partial<AgentState>> => {
  const inputs = state.inputs;
  const report = state.report;
  const location = state.location;
  const hospitals = state.hospitals?.recommendedHospitals || [];
  const doctor = state.doctor?.assignedDoctor;
  const ambulance = state.ambulance;

  const defaultState: DispatchState = {
    caseId: null,
    status: 'PENDING',
    dispatchTime: null,
    lockAcquired: false
  };

  if (!inputs.lat || !inputs.lng) {
    return { dispatch: defaultState };
  }

  try {
    const caseData = {
      userId: inputs.userId || 'guest',
      patientName: report?.patientName || 'Unknown Patient',
      patientContact: report?.mobileNumber || '',
      injuryType: report?.injuryType || 'Unspecified Emergency',
      severity: report?.emergencyLevel || 'HIGH',
      lat: inputs.lat,
      lng: inputs.lng,
      status: 'PENDING' as const,
      assignedHospitalId: null,
      notifiedHospitalIds: hospitals.map(h => h.id),
      assignedAmbulanceId: ambulance?.assignedAmbulanceId || null,
      notifiedAmbulanceIds: ambulance?.assignedAmbulanceId ? [ambulance.assignedAmbulanceId] : [],
      assignedDoctorId: doctor?.id || null,
      notifiedDoctorIds: doctor?.id ? [doctor.id] : [],
      familyNotified: state.sos?.smsAlertsSent || false,
      etaMinutes: ambulance?.estimatedResponseTimeMinutes || 0,
      reportData: {
        observations: state.vision?.observations || '',
        summary: report?.reportSummary || '',
        recommendedAction: report?.recommendedAction || '',
        bloodGroup: state.vault?.bloodGroup || 'Unknown',
        allergies: state.vault?.allergies || [],
        chronicConditions: state.vault?.chronicConditions || []
      }
    };

    let caseId = `case_local_${Date.now()}`;
    
    // Save to Database if connected
    if (isDbConnected) {
      const newCase = new EmergencyCase(caseData);
      await newCase.save();
      caseId = String(newCase._id);
    } else {
      console.warn('[DispatchAgent] Database offline. Created in-memory dispatch ticket:', caseId);
    }

    // Register Patient Consent Log
    try {
      await createConsentLog({
        userId: inputs.userId || 'guest',
        caseId: caseId,
        consentType: 'EMERGENCY_DISPATCH',
        granted: true,
        ipAddress: '127.0.0.1',
        userAgent: 'HelpAid HEDA Multi-Agent Orchestrator'
      });
      console.log(`[DispatchAgent] Triage consent logged successfully for case ${caseId}`);
    } catch (consentErr: any) {
      console.error('[DispatchAgent] Failed to write consent log:', consentErr.message);
    }

    const dispatch: DispatchState = {
      caseId,
      status: 'PENDING',
      dispatchTime: new Date().toISOString(),
      lockAcquired: true
    };

    return { dispatch };

  } catch (error: any) {
    console.error('[DispatchAgent] Error executing dispatch database entry:', error.message);
    return { dispatch: defaultState };
  }
};
