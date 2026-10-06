import { Server as SocketIOServer } from 'socket.io';

let ioInstance: SocketIOServer | null = null;
export const userSocketMap = new Map<string, string>();

export function setIo(io: SocketIOServer) {
  ioInstance = io;
  console.log('[SocketService] Global Socket.io instance set.');
}

export function getIo(): SocketIOServer {
  if (!ioInstance) {
    throw new Error('[SocketService] Socket.io instance has not been initialized yet!');
  }
  return ioInstance;
}

/**
 * Canonical real-time state synchronization helper.
 * Fetches the latest EmergencyCase from MongoDB and broadcasts the fully enriched
 * state to all authorized case, patient, doctor, ambulance, and hospital rooms.
 */
export async function broadcastEmergencyCaseUpdate(
  caseId: string,
  eventType: string = 'emergency_updated',
  extraData: any = {}
) {
  try {
    if (!caseId) return;
    const { EmergencyCase } = await import('../models/EmergencyRequest.js');
    const emergencyCase = await EmergencyCase.findById(caseId).lean() as any;

    if (!emergencyCase) {
      console.warn(`[BROADCAST WARN] EmergencyCase not found for caseId: ${caseId}`);
      return;
    }

    const io = getIo();
    const caseIdStr = emergencyCase._id.toString();

    // Standardize Doctor Data
    const doctorData = emergencyCase.acceptedDoctor || (emergencyCase.accepted_doctor ? {
      id: emergencyCase.accepted_doctor.doctorId,
      doctorId: emergencyCase.accepted_doctor.doctorId,
      name: emergencyCase.accepted_doctor.name,
      doctorName: emergencyCase.accepted_doctor.name,
      phone: emergencyCase.accepted_doctor.phone,
      specialization: emergencyCase.accepted_doctor.specialization,
      hospitalName: emergencyCase.accepted_doctor.hospital,
      acceptedAt: emergencyCase.accepted_by?.time || emergencyCase.updatedAt
    } : null);

    // Standardize Hospital Data
    const hospitalData = emergencyCase.accepted_hospital ? {
      id: emergencyCase.accepted_hospital.hospitalId,
      hospitalId: emergencyCase.accepted_hospital.hospitalId,
      name: emergencyCase.accepted_hospital.name,
      phone: emergencyCase.accepted_hospital.phone,
      address: emergencyCase.accepted_hospital.address
    } : null;

    // Standardize Ambulance Data
    const ambulanceData = emergencyCase.accepted_ambulance ? {
      id: emergencyCase.accepted_ambulance.ambulanceId,
      ambulanceId: emergencyCase.accepted_ambulance.ambulanceId,
      driver: emergencyCase.accepted_ambulance.driverName,
      driverName: emergencyCase.accepted_ambulance.driverName,
      driverPhone: emergencyCase.accepted_ambulance.driverPhone,
      phone: emergencyCase.accepted_ambulance.driverPhone,
      vehicle: emergencyCase.accepted_ambulance.vehicleNumber,
      vehicleNumber: emergencyCase.accepted_ambulance.vehicleNumber,
      vehicleType: emergencyCase.accepted_ambulance.vehicleType,
      status: emergencyCase.accepted_ambulance.liveStatus || emergencyCase.ambulanceStatus || 'Assigned',
      liveStatus: emergencyCase.accepted_ambulance.liveStatus || emergencyCase.ambulanceStatus || 'Assigned',
      eta: emergencyCase.accepted_ambulance.eta || emergencyCase.etaMinutes || 8,
      lat: emergencyCase.accepted_ambulance.lat,
      lng: emergencyCase.accepted_ambulance.lng
    } : null;

    const payload = {
      event: eventType,
      type: eventType,
      caseId: caseIdStr,
      emergencyCase,
      doctor: doctorData,
      acceptedDoctor: doctorData,
      hospital: hospitalData,
      acceptedHospital: hospitalData,
      ambulance: ambulanceData,
      acceptedAmbulance: ambulanceData,
      status: emergencyCase.status,
      doctorStatus: emergencyCase.doctorStatus || (doctorData ? 'accepted' : 'pending'),
      hospitalStatus: emergencyCase.hospitalStatus || (hospitalData ? 'accepted' : 'pending'),
      ambulanceStatus: emergencyCase.ambulanceStatus || (ambulanceData ? 'assigned' : 'pending'),
      timeline: emergencyCase.timeline || [],
      timestamp: new Date(),
      ...extraData
    };

    // Collect all relevant rooms
    const targetRooms = new Set<string>();
    targetRooms.add(`case_${caseIdStr}`);

    if (emergencyCase.userId && emergencyCase.userId !== 'anonymous' && !emergencyCase.userId.startsWith('local_')) {
      targetRooms.add(`user_${emergencyCase.userId}`);
    }
    if (emergencyCase.guestSessionId) {
      targetRooms.add(`guest_${emergencyCase.guestSessionId}`);
    }
    if (emergencyCase.assignedDoctorId) {
      targetRooms.add(`doctor_${emergencyCase.assignedDoctorId}`);
    }
    if (emergencyCase.accepted_doctor?.doctorId) {
      targetRooms.add(`doctor_${emergencyCase.accepted_doctor.doctorId}`);
    }
    if (emergencyCase.assignedAmbulanceId) {
      targetRooms.add(`ambulance_${emergencyCase.assignedAmbulanceId}`);
    }
    if (emergencyCase.accepted_ambulance?.ambulanceId) {
      targetRooms.add(`ambulance_${emergencyCase.accepted_ambulance.ambulanceId}`);
    }
    if (emergencyCase.assignedHospitalId) {
      targetRooms.add(`hospital_${emergencyCase.assignedHospitalId}`);
    }
    if (Array.isArray(emergencyCase.notifiedHospitalIds)) {
      emergencyCase.notifiedHospitalIds.forEach((hId: string) => targetRooms.add(`hospital_${hId}`));
    }
    if (Array.isArray(emergencyCase.notifiedAmbulanceIds)) {
      emergencyCase.notifiedAmbulanceIds.forEach((aId: string) => targetRooms.add(`ambulance_${aId}`));
    }
    if (Array.isArray(emergencyCase.notifiedDoctorIds)) {
      emergencyCase.notifiedDoctorIds.forEach((dId: string) => targetRooms.add(`doctor_${dId}`));
    }

    // Emit standardized events
    targetRooms.forEach((roomName) => {
      io.to(roomName).emit('emergency_updated', payload);
      io.to(roomName).emit('emergency_case_updated', payload);
      io.to(roomName).emit('case_updated', payload);

      if (eventType && eventType !== 'emergency_updated') {
        io.to(roomName).emit(eventType, payload);
      }

      if (emergencyCase.status === 'DOCTOR_ACCEPTED' || eventType === 'doctor_accepted') {
        io.to(roomName).emit('doctor_accepted', payload);
        io.to(roomName).emit('doctor:accepted', payload);
        io.to(roomName).emit('doctor_request_accepted', payload);
      }

      if (emergencyCase.status === 'AMBULANCE_ASSIGNED' || eventType === 'ambulance_assigned' || eventType === 'ambulance_accepted') {
        io.to(roomName).emit('ambulance_assigned', payload);
        io.to(roomName).emit('ambulance:assigned', payload);
        io.to(roomName).emit('ambulance_accepted', payload);
      }

      if (emergencyCase.status === 'HOSPITAL_ACCEPTED' || eventType === 'hospital_accepted') {
        io.to(roomName).emit('hospital_assigned', payload);
        io.to(roomName).emit('hospital_accepted', payload);
        io.to(roomName).emit('case_accepted', payload);
      }
    });

    console.log(`[BROADCAST] caseId=${caseIdStr} event=${eventType} status=${emergencyCase.status} rooms=${Array.from(targetRooms).join(', ')}`);
  } catch (broadcastErr: any) {
    console.error(`[BROADCAST ERROR] Failed to broadcast update for caseId ${caseId}:`, broadcastErr.message);
  }
}
