export interface VisionState {
  observations: string;
  visibleInjuries: string[];
  urgencyLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidenceScore: number;
}

export interface ReportState {
  patientName: string;
  age: number | null;
  gender: string;
  mobileNumber: string;
  emergencyLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  injuryType: string;
  confidenceScore: number;
  recommendedAction: string;
  reportSummary: string;
}

export interface LocationState {
  address: string;
  city: string;
  district: string;
  state: string;
  landmarks: string[];
  accessibilityScore: number; // 0 to 10 scale
}

export interface MedicalVaultState {
  bloodGroup: string;
  allergies: string[];
  chronicConditions: string[];
  medications: string[];
  emergencyContacts: Array<{ name: string; relation: string; phone: string }>;
  hasVaultData: boolean;
}

export interface HospitalInfo {
  id: string;
  name: string;
  distance: number; // in km
  latitude: number;
  longitude: number;
  bedsAvailable: number;
  icuBedsAvailable: number;
  ventilatorsAvailable: number;
}

export interface HospitalFinderState {
  recommendedHospitals: HospitalInfo[];
  searchRadius: number; // 5, 10, or 15 km
}

export interface DoctorInfo {
  id: string;
  name: string;
  specialization: string;
  phone: string;
}

export interface DoctorMatchingState {
  assignedDoctor: DoctorInfo | null;
  backupDoctors: DoctorInfo[];
}

export interface AmbulanceState {
  dispatchRequired: boolean;
  priorityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  assignedAmbulanceId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  estimatedResponseTimeMinutes: number;
}

export interface SosState {
  smsAlertsSent: boolean;
  pushNotificationsSent: boolean;
  emailAlertsSent: boolean;
  alertLogs: Array<{ channel: 'SMS' | 'PUSH' | 'EMAIL'; status: string; recipient: string }>;
}

export interface DispatchState {
  caseId: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'RESOLVED';
  dispatchTime: string | null;
  lockAcquired: boolean;
}

export interface CommunicationState {
  webSocketBroadcasted: boolean;
  notifiedCount: number;
  broadcastLogs: string[];
}

export interface AgentState {
  inputs: {
    userId?: string;
    symptoms?: string;
    lat?: number;
    lng?: number;
    imageBase64?: string;
  };
  vision?: VisionState;
  report?: ReportState;
  location?: LocationState;
  vault?: MedicalVaultState;
  hospitals?: HospitalFinderState;
  doctor?: DoctorMatchingState;
  ambulance?: AmbulanceState;
  sos?: SosState;
  dispatch?: DispatchState;
  communication?: CommunicationState;
  errors: string[];
}

export const createInitialState = (inputs: AgentState['inputs']): AgentState => {
  return {
    inputs,
    errors: []
  };
};
