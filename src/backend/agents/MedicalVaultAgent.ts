import { AgentState, MedicalVaultState } from './AgentState';
import { getUserProfile, getMedicalHistory, getUserEmergencyContacts } from '../../../db';

export const MedicalVaultAgent = async (state: AgentState): Promise<Partial<AgentState>> => {
  const userId = state.inputs.userId;

  const defaultVault: MedicalVaultState = {
    bloodGroup: 'Unknown',
    allergies: [],
    chronicConditions: [],
    medications: [],
    emergencyContacts: [],
    hasVaultData: false
  };

  if (!userId || userId === 'guest') {
    return { vault: defaultVault };
  }

  try {
    // Query medical vault items in parallel
    const [profile, history, contacts] = await Promise.all([
      getUserProfile(userId).catch(() => null),
      getMedicalHistory(userId).catch(() => null),
      getUserEmergencyContacts(userId).catch(() => [])
    ]);

    if (!profile && !history) {
      return { vault: defaultVault };
    }

    // Merge profile and medical history values
    const allergiesSet = new Set<string>();
    if (profile?.allergies) {
      profile.allergies.forEach((a: string) => allergiesSet.add(a));
    }
    if (history?.allergies) {
      history.allergies.forEach((a: string) => allergiesSet.add(a));
    }

    const chronicConditionsSet = new Set<string>();
    if (history?.chronicConditions) {
      history.chronicConditions.forEach((c: string) => chronicConditionsSet.add(c));
    }
    if (history?.diseases) {
      history.diseases.forEach((d: string) => chronicConditionsSet.add(d));
    }

    const medicationsSet = new Set<string>();
    if (history?.currentMedications) {
      history.currentMedications.forEach((m: string) => medicationsSet.add(m));
    }
    if (profile?.medications) {
      profile.medications.forEach((m: string) => medicationsSet.add(m));
    }

    const bloodGroup = profile?.bloodGroup || history?.bloodGroup || 'Unknown';

    // Map emergency contacts
    const mappedContacts = contacts.map((c: any) => ({
      name: c.name || 'Emergency Contact',
      relation: c.relation || 'Family',
      phone: c.mobileNumber || c.phone || ''
    }));

    const vault: MedicalVaultState = {
      bloodGroup,
      allergies: Array.from(allergiesSet),
      chronicConditions: Array.from(chronicConditionsSet),
      medications: Array.from(medicationsSet),
      emergencyContacts: mappedContacts,
      hasVaultData: true
    };

    return { vault };

  } catch (error: any) {
    console.error('[MedicalVaultAgent] Error querying vault:', error.message);
    return { vault: defaultVault };
  }
};
