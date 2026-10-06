import { Request, Response } from 'express';
import { Hospital, getHospitals, upsertHospital, upsertDoctor, deleteDoctor, getDoctors } from '../../../db.js';

export const getHospitalCapacity = async (req: Request, res: Response) => {
  const { hospitalId } = req.query;

  if (!hospitalId) {
    return res.status(400).json({ success: false, error: 'Missing hospitalId.' });
  }

  try {
    const list = await getHospitals({ _id: hospitalId });
    if (!list || list.length === 0) {
      return res.status(404).json({ success: false, error: 'Hospital not found.' });
    }

    const h = list[0];
    return res.json({
      success: true,
      capacity: {
        emergencyBedsTotal: h.emergencyBedsTotal ?? 10,
        emergencyBedsAvailable: h.emergencyBedsAvailable ?? 5,
        icuBedsTotal: h.icuBedsTotal ?? 5,
        icuBedsAvailable: h.icuBedsAvailable ?? 2,
        ventilatorsTotal: h.ventilatorsTotal ?? 3,
        ventilatorsAvailable: h.ventilatorsAvailable ?? 1
      }
    });
  } catch (err: any) {
    console.error('Failed to get hospital capacity:', err);
    return res.status(500).json({ success: false, error: 'Server error retrieving capacity.' });
  }
};

export const updateHospitalCapacity = async (req: Request, res: Response) => {
  const {
    hospitalId,
    emergencyBedsTotal,
    emergencyBedsAvailable,
    icuBedsTotal,
    icuBedsAvailable,
    ventilatorsTotal,
    ventilatorsAvailable
  } = req.body;

  if (!hospitalId) {
    return res.status(400).json({ success: false, error: 'Missing hospitalId.' });
  }

  try {
    const list = await getHospitals({ _id: hospitalId });
    if (!list || list.length === 0) {
      return res.status(404).json({ success: false, error: 'Hospital not found.' });
    }

    const current = list[0];
    const updateData = {
      ...current.toObject?.() || current,
      emergencyBedsTotal: Number(emergencyBedsTotal),
      emergencyBedsAvailable: Number(emergencyBedsAvailable),
      icuBedsTotal: Number(icuBedsTotal),
      icuBedsAvailable: Number(icuBedsAvailable),
      ventilatorsTotal: Number(ventilatorsTotal),
      ventilatorsAvailable: Number(ventilatorsAvailable)
    };

    await upsertHospital({ _id: hospitalId }, updateData);

    return res.json({ success: true, message: 'Hospital capacity updated successfully.' });
  } catch (err: any) {
    console.error('Failed to update capacity:', err);
    return res.status(500).json({ success: false, error: 'Server error updating capacity.' });
  }
};

export const addDoctorToRoster = async (req: Request, res: Response) => {
  const {
    hospitalId,
    name,
    specialization,
    experience,
    phone,
    availability
  } = req.body;

  if (!hospitalId || !name || !specialization) {
    return res.status(400).json({ success: false, error: 'Missing required fields: hospitalId, name, specialization.' });
  }

  try {
    const list = await getHospitals({ _id: hospitalId });
    if (!list || list.length === 0) {
      return res.status(404).json({ success: false, error: 'Hospital not found.' });
    }

    const hospital = list[0];

    const doctorData = {
      name,
      specialization,
      hospital: hospital.name,
      phone: phone || '',
      city: hospital.city || '',
      district: hospital.district || '',
      experience: Number(experience || 0),
      availability: availability || ['Mon-Fri 9AM-5PM'],
      verified: true,
      latitude: hospital.latitude || hospital.lat || 0,
      longitude: hospital.longitude || hospital.lng || 0,
      lat: hospital.latitude || hospital.lat || 0,
      lng: hospital.longitude || hospital.lng || 0
    };

    // Use a unique name + hospital combo query to prevent duplicates
    const newDoc = await upsertDoctor({ name, hospital: hospital.name }, doctorData);

    return res.json({ success: true, message: 'Doctor added to roster successfully.', doctor: newDoc });
  } catch (err: any) {
    console.error('Failed to add doctor:', err);
    return res.status(500).json({ success: false, error: 'Server error adding doctor.' });
  }
};

export const removeDoctorFromRoster = async (req: Request, res: Response) => {
  const { doctorId } = req.params;

  if (!doctorId) {
    return res.status(400).json({ success: false, error: 'Missing doctorId in parameters.' });
  }

  try {
    const result = await deleteDoctor(doctorId);
    if (result && result.deletedCount) {
      return res.json({ success: true, message: 'Doctor removed from roster successfully.' });
    }
    return res.status(404).json({ success: false, error: 'Doctor not found.' });
  } catch (err: any) {
    console.error('Failed to remove doctor:', err);
    return res.status(500).json({ success: false, error: 'Server error removing doctor.' });
  }
};

export const getHospitalDoctors = async (req: Request, res: Response) => {
  const { hospitalId } = req.query;

  if (!hospitalId) {
    return res.status(400).json({ success: false, error: 'Missing hospitalId.' });
  }

  try {
    const list = await getHospitals({ _id: hospitalId });
    if (!list || list.length === 0) {
      return res.status(404).json({ success: false, error: 'Hospital not found.' });
    }

    const hospital = list[0];
    const doctors = await getDoctors({ hospital: hospital.name });

    return res.json({ success: true, doctors });
  } catch (err: any) {
    console.error('Failed to retrieve roster:', err);
    return res.status(500).json({ success: false, error: 'Server error retrieving doctors list.' });
  }
};
