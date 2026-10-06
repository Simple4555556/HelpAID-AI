import { AgentState, CommunicationState } from './AgentState.js';
import { createNotificationLog } from '../../../db.js';
import { getIo } from '../services/socketService.js';

export const CommunicationAgent = async (state: AgentState): Promise<Partial<AgentState>> => {
  const io = getIo();
  const dispatch = state.dispatch;
  const report = state.report;
  const location = state.location;
  const hospitals = state.hospitals?.recommendedHospitals || [];
  const doctor = state.doctor?.assignedDoctor;
  const ambulance = state.ambulance;
  const sosAlerts = state.sos?.alertLogs || [];

  const defaultState: CommunicationState = {
    webSocketBroadcasted: false,
    notifiedCount: 0,
    broadcastLogs: []
  };

  if (!dispatch?.caseId) {
    return { communication: defaultState };
  }

  try {
    const broadcastLogs: string[] = [];
    let notifiedCount = 0;

    // 1. Prepare Socket Payload
    const socketPayload = {
      caseId: dispatch.caseId,
      patientName: report?.patientName || 'Unknown Patient',
      patientContact: report?.mobileNumber || '',
      injuryType: report?.injuryType || 'General Emergency',
      severity: report?.emergencyLevel || 'HIGH',
      lat: state.inputs.lat,
      lng: state.inputs.lng,
      reportData: {
        summary: report?.reportSummary || '',
        recommendedAction: report?.recommendedAction || '',
        bloodGroup: state.vault?.bloodGroup || 'Unknown',
        allergies: state.vault?.allergies || [],
        chronicConditions: state.vault?.chronicConditions || []
      }
    };

    // 2. Broadcast via Socket.io to hospitals, doctors, and ambulance rooms
    if (io) {
      hospitals.forEach(h => {
        const roomName = `hospital_${h.id}`;
        io.to(roomName).emit('new_emergency', {
          ...socketPayload,
          distanceKm: h.distance.toFixed(1)
        });
        broadcastLogs.push(`WebSocket: Emitted case to ${roomName} (${h.name})`);
        notifiedCount++;
      });

      if (doctor) {
        const roomName = `doctor_${doctor.id}`;
        io.to(roomName).emit('new_emergency', {
          ...socketPayload,
          distanceKm: (hospitals[0]?.distance || 2.0).toFixed(1)
        });
        broadcastLogs.push(`WebSocket: Emitted case to ${roomName} (Dr. ${doctor.name})`);
        notifiedCount++;
      }

      if (ambulance && ambulance.assignedAmbulanceId) {
        const roomName = `ambulance_${ambulance.assignedAmbulanceId}`;
        io.to(roomName).emit('new_emergency', {
          ...socketPayload,
          distanceKm: (ambulance.estimatedResponseTimeMinutes / 3).toFixed(1)
        });
        broadcastLogs.push(`WebSocket: Emitted case to ${roomName} (${ambulance.driverName})`);
        notifiedCount++;
      }
    } else {
      broadcastLogs.push('WebSocket: Socket.io engine unavailable, skipped live broadcasts.');
    }

    // 3. Persist notification logs to MongoDB
    for (const log of sosAlerts) {
      if (log.status !== 'SKIPPED') {
        try {
          await createNotificationLog({
            userId: state.inputs.userId || null,
            caseId: dispatch.caseId,
            title: log.channel === 'SMS' ? 'Family SOS SMS Alert' : 'First Responder Push Alert',
            message: `Emergency Alert sent via ${log.channel} to ${log.recipient}. Case: ${dispatch.caseId}`,
            channel: log.channel
          });
          broadcastLogs.push(`Database Log: Created audit entry for ${log.channel} notification to ${log.recipient}`);
        } catch (dbErr: any) {
          console.error('[CommunicationAgent] Failed to save notification log:', dbErr.message);
        }
      }
    }

    const communication: CommunicationState = {
      webSocketBroadcasted: !!io,
      notifiedCount,
      broadcastLogs
    };

    return { communication };

  } catch (error: any) {
    console.error('[CommunicationAgent] Error executing communications:', error.message);
    return { communication: defaultState };
  }
};
