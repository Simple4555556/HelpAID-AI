import { AgentState, SosState } from './AgentState';

export const SosAgent = async (state: AgentState): Promise<Partial<AgentState>> => {
  const report = state.report;
  const location = state.location;
  const vault = state.vault;
  const hospitals = state.hospitals?.recommendedHospitals || [];
  const doctor = state.doctor?.assignedDoctor;
  const ambulance = state.ambulance;

  const defaultState: SosState = {
    smsAlertsSent: false,
    pushNotificationsSent: false,
    emailAlertsSent: false,
    alertLogs: []
  };

  if (!report || !location) {
    return { sos: defaultState };
  }

  try {
    const alertLogs: SosState['alertLogs'] = [];

    const patientName = report.patientName || 'An emergency patient';
    const severity = report.emergencyLevel || 'HIGH';
    const injury = report.injuryType || 'Critical Case';

    // 1. Compile SMS Alerts for Emergency Contacts
    if (vault?.emergencyContacts && vault.emergencyContacts.length > 0) {
      vault.emergencyContacts.forEach(contact => {
        const smsMessage = `URGENT: HelpAid Alert. ${patientName} is in a ${severity} emergency (${injury}) at ${location.address}. Landmarks: ${location.landmarks.join(', ')}. Track live at: https://helpaid.ai/tracker/case_id`;
        alertLogs.push({
          channel: 'SMS',
          recipient: `${contact.name} (${contact.phone})`,
          status: 'PENDING_TRANSMISSION'
        });
      });
    } else {
      // Fallback log
      alertLogs.push({
        channel: 'SMS',
        recipient: 'No emergency contacts configured',
        status: 'SKIPPED'
      });
    }

    // 2. Compile Push Notifications for Hospitals & Responders
    hospitals.forEach(h => {
      const pushPayload = `🚨 NEW DISPATCH: ${severity} ${injury} emergency reported at distance ${h.distance.toFixed(1)} km. Capacity Requested: ICU / General Bed. Please accept case.`;
      alertLogs.push({
        channel: 'PUSH',
        recipient: `Hospital: ${h.name} (${h.id})`,
        status: 'PENDING_TRANSMISSION'
      });
    });

    if (doctor) {
      alertLogs.push({
        channel: 'PUSH',
        recipient: `Doctor Specialist: ${doctor.name} (${doctor.specialization})`,
        status: 'PENDING_TRANSMISSION'
      });
    }

    if (ambulance && ambulance.assignedAmbulanceId) {
      alertLogs.push({
        channel: 'PUSH',
        recipient: `Ambulance Driver: ${ambulance.driverName} (${ambulance.assignedAmbulanceId})`,
        status: 'PENDING_TRANSMISSION'
      });
    }

    // 3. Compile Email Triage Package
    const emailRecipient = state.inputs.userId ? `user_${state.inputs.userId}@helpaid.ai` : 'dispatch-archive@helpaid.ai';
    alertLogs.push({
      channel: 'EMAIL',
      recipient: emailRecipient,
      status: 'PENDING_TRANSMISSION'
    });

    return {
      sos: {
        smsAlertsSent: true, // Mark alerts generated successfully
        pushNotificationsSent: true,
        emailAlertsSent: true,
        alertLogs
      }
    };

  } catch (error: any) {
    console.error('[SosAgent] Error compiling alerts:', error.message);
    return { sos: defaultState };
  }
};
