import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { User, isDbConnected, getHospitals, getDoctors, getBloodBanks, getMedicalStores, getPoliceStations, getImportLogs, UserProfile, saveUserProfile } from '../../../db.js';
import { Doctor } from '../models/Doctor.js';
import { Hospital } from '../models/Hospital.js';
import { AmbulanceService } from '../models/Ambulance.js';
import { EmergencyCase } from '../models/EmergencyRequest.js';
import { TrackingSession } from '../models/TrackingSession.js';
import { generateToken, AuthenticatedRequest } from '../middleware/auth.js';

async function getNextHelpAidId(): Promise<string> {
  let maxNum = 0;
  const regex = /^HA-2026-(\d{6})$/;
  try {
    const users = await User.find({ helpAidId: { $regex: '^HA-2026-\\d{6}$' } }).lean();
    for (const u of users) {
      if (u.helpAidId) {
        const match = u.helpAidId.match(regex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }
  } catch (e) {
    console.error('Error fetching users for HelpAid ID sequence:', e);
  }

  try {
    const profiles = await UserProfile.find({ publicId: { $regex: '^HA-2026-\\d{6}$' } }).lean();
    for (const p of profiles) {
      if (p.publicId) {
        const match = p.publicId.match(regex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }
  } catch (e) {
    console.error('Error fetching profiles for HelpAid ID sequence:', e);
  }

  const nextNum = maxNum + 1;
  return `HA-2026-${String(nextNum).padStart(6, '0')}`;
}

export async function migrateGuestCases(userId: string, helpAidId: string, guestCaseIds: string[], guestSessionId?: string) {
  try {
    const caseIdsToMigrate = [...(guestCaseIds || [])];

    // Fallback: If guestSessionId or phone number matching is possible, query them
    const userObj = await User.findById(userId).lean();
    const userPhone = userObj?.phone;

    const queryConditions: any[] = [];
    if (guestSessionId) {
      queryConditions.push({ guestSessionId });
    }
    if (userPhone) {
      queryConditions.push({ patientContact: userPhone });
      queryConditions.push({ patient_phone: userPhone });
    }

    if (queryConditions.length > 0) {
      const extraCases = await EmergencyCase.find({
        $and: [
          { userId: { $in: ['anonymous', 'guest', null] } },
          { $or: queryConditions }
        ]
      }).select('_id').lean();

      extraCases.forEach(c => {
        const idStr = c._id.toString();
        if (!caseIdsToMigrate.includes(idStr)) {
          caseIdsToMigrate.push(idStr);
        }
      });
    }

    if (caseIdsToMigrate.length === 0) {
      console.log(`[GUEST MIGRATION] No cases found to migrate for userId: ${userId}`);
      return;
    }

    console.log(`[GUEST MIGRATION] Migrating ${caseIdsToMigrate.length} cases: ${caseIdsToMigrate.join(', ')} to userId: ${userId}`);

    // 1. Update EmergencyCase records
    for (const cid of caseIdsToMigrate) {
      await EmergencyCase.findByIdAndUpdate(cid, {
        $set: { userId, firebaseUid: userId, helpAidId, profileId: userId, caseId: cid }
      });
    }
    console.log(`[GUEST MIGRATION] Updated EmergencyCase records.`);

    // 2. Update TrackingSession
    const trackingResult = await TrackingSession.updateMany(
      { caseId: { $in: caseIdsToMigrate } },
      { $set: { userId } }
    );
    console.log(`[GUEST MIGRATION] Updated ${trackingResult.modifiedCount} TrackingSession records.`);

    // 3. Update Notifications
    const { default: NotificationModel } = await import('../models/Notification.js');
    const notifResult = await NotificationModel.updateMany(
      { caseId: { $in: caseIdsToMigrate } },
      { $set: { recipientId: userId } }
    );
    console.log(`[GUEST MIGRATION] Updated ${notifResult.modifiedCount} Notification records.`);

    // 4. Update timeline and reports
    const { MedicalTimeline, SymptomReport, InjuryReport, ChatHistory } = await import('../../../db.js');
    const { MedicalReport } = await import('../models/MedicalReport.js');

    await MedicalTimeline.updateMany(
      { referenceId: { $in: caseIdsToMigrate } },
      { $set: { userId, helpAidId } }
    );

    await MedicalReport.updateMany(
      { caseId: { $in: caseIdsToMigrate } },
      { $set: { userId } }
    );

    // If there are timeline events, migrate clinical records broadly as well
    await SymptomReport.updateMany(
      { userId: { $in: ['anonymous', 'guest', 'null', ''] } },
      { $set: { userId } }
    );
    await InjuryReport.updateMany(
      { userId: { $in: ['anonymous', 'guest', 'null', ''] } },
      { $set: { userId } }
    );
    await ChatHistory.updateMany(
      { userId: { $in: ['anonymous', 'guest', 'null', ''] } },
      { $set: { userId } }
    );

    console.log(`[GUEST MIGRATION COMPLETED] [GUEST MIGRATION COMPLETED] For userId: ${userId}`);
  } catch (err: any) {
    console.error(`[GUEST MIGRATION FAILED] Error:`, err.message);
  }
}

export async function register(req: Request, res: Response) {
  const {
    email,
    password,
    displayName,
    role,
    phone,
    patientName,
    phoneNumber,
    age,
    gender,
    bloodGroup,
    emergencyContact,
    guestCaseIds,
    guestSessionId,
    ...profileFields
  } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    if (isDbConnected) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ error: 'Email is already registered.' });
      }

      // Determine status based on role
      const isProvider = role === 'doctor' || role === 'hospital';
      const userStatus = isProvider ? 'pending_verification' : 'active';

      // Generate HelpAid ID if patient (role is 'user' or default)
      let helpAidId = '';
      if (!role || role === 'user') {
        helpAidId = await getNextHelpAidId();
      }

      const phoneVal = phone || phoneNumber || '';
      const nameVal = patientName || displayName || profileFields.name || '';

      const newUser = await User.create({
        email,
        password,
        displayName: nameVal,
        role: role || 'user',
        phone: phoneVal,
        status: userStatus,
        helpAidId,
        patientName: nameVal,
        age: age ? parseInt(age, 10) : null,
        gender: gender || '',
        bloodGroup: bloodGroup || '',
        emergencyContact: emergencyContact || ''
      });

      let doctorProfileId = null;
      let hospitalProfileId = null;

      // Create Patient profile (UserProfile) in db if role is 'user'
      if (!role || role === 'user') {
        try {
          const profileData = {
            fullName: nameVal,
            displayName: nameVal,
            email: newUser.email,
            mobileNumber: phoneVal,
            age: age ? parseInt(age, 10) : null,
            gender: gender || '',
            bloodGroup: bloodGroup || '',
            publicId: helpAidId,
            emergencyContacts: emergencyContact ? [{ name: 'Emergency Contact', phone: emergencyContact }] : []
          };
          await saveUserProfile(newUser._id.toString(), profileData);
        } catch (profileErr: any) {
          console.error('[Auth Register] Failed to create patient UserProfile:', profileErr.message);
        }

        // Migrate guest SOS cases comprehensively
        await migrateGuestCases(newUser._id.toString(), helpAidId, guestCaseIds || [], guestSessionId);
      }

      // Create Doctor profile if role is doctor
      if (role === 'doctor') {
        const doctorProfile = await Doctor.create({
          name: profileFields.name || displayName || '',
          specialization: profileFields.specialization || 'General Physician',
          hospital: profileFields.hospitalName || '',
          phone: phone || '',
          city: profileFields.city || '',
          state: profileFields.state || '',
          experience: profileFields.experience ? parseInt(profileFields.experience) : 0,
          registrationNumber: profileFields.registrationNumber || '',
          userId: newUser._id,
          is_online: false,
          status: 'pending_verification',
          source: 'Registration',
          latitude: profileFields.latitude || 0,
          longitude: profileFields.longitude || 0
        });
        doctorProfileId = doctorProfile._id;
        newUser.doctorProfileId = doctorProfileId;
        await newUser.save();
      }

      // Create Hospital profile if role is hospital
      if (role === 'hospital') {
        const hospitalProfile = await Hospital.create({
          name: profileFields.hospitalName || displayName || '',
          phone: phone || '',
          email: email,
          address: profileFields.address || '',
          city: profileFields.city || '',
          state: profileFields.state || '',
          emergencyContactNumber: profileFields.emergencyContactNumber || '',
          licenseNumber: profileFields.licenseNumber || '',
          userId: newUser._id,
          is_online: false,
          accepting_emergency: true,
          status: 'pending_verification',
          source: 'Registration',
          latitude: profileFields.latitude || 0,
          longitude: profileFields.longitude || 0,
          emergencyAvailable: true
        });
        hospitalProfileId = hospitalProfile._id;
        newUser.hospitalProfileId = hospitalProfileId;
        newUser.hospitalId = hospitalProfile._id.toString();
        await newUser.save();
      }

      // Create Ambulance profile if role is ambulance_driver or ambulance
      if (role === 'ambulance_driver' || role === 'ambulance') {
        const ambulanceProfile = await AmbulanceService.create({
          name: profileFields.name || displayName || 'Ambulance Unit',
          phone: phone || '',
          vehicleType: profileFields.vehicleType || 'Basic',
          latitude: profileFields.latitude || 0,
          longitude: profileFields.longitude || 0,
          is_online: true,
          is_available: true,
          verified: true,
          source: 'Registration',
          userId: newUser._id,
          profileId: '',
          socketRoom: '',
          lastSeen: new Date(),
          onlineStatus: 'online'
        });
        ambulanceProfile.profileId = ambulanceProfile._id.toString();
        ambulanceProfile.socketRoom = `ambulance_${ambulanceProfile._id.toString()}`;
        await ambulanceProfile.save();

        newUser.ambulanceProfileId = ambulanceProfile?._id;
        newUser.ambulanceId = ambulanceProfile?._id?.toString() || '';
        await newUser.save();
      }

      const token = generateToken({
        id: newUser._id.toString(),
        email: newUser.email,
        role: newUser.role,
        displayName: newUser.displayName
      });

      console.log('REGISTER_SUCCESS', { userId: newUser._id.toString(), email: newUser.email, role: newUser.role });

      return res.status(201).json({
        success: true,
        token,
        user: {
          id: newUser._id,
          email: newUser.email,
          role: newUser.role,
          displayName: newUser.displayName,
          phone: newUser.phone,
          status: newUser.status,
          helpAidId: newUser.helpAidId,
          doctorProfileId,
          hospitalProfileId,
          ambulanceProfileId: newUser.ambulanceProfileId,
          ambulanceId: newUser.ambulanceId
        }
      });
    } else {
      return res.status(500).json({ error: 'Database is disconnected.' });
    }
  } catch (error: any) {
    console.error('REGISTER_FAILED', error?.message || error);
    console.error('[Auth Register Error]:', error.message);
    return res.status(500).json({ error: 'Registration failed.' });
  }
}

export async function login(req: Request, res: Response) {
  const { email, password, guestCaseIds, guestSessionId } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    if (isDbConnected) {
      const user = await User.findOne({ email });
      if (!user) {
        console.error('LOGIN_FAILED', { reason: 'user_not_found', email });
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const isMatch = await (user as any).comparePassword(password);
      if (!isMatch) {
        console.error('LOGIN_FAILED', { reason: 'invalid_password', email });
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      // Set online status
      user.is_online = true;
      user.lastLoginAt = new Date();
      await user.save();

      // Also set online on profile
      if (user.role === 'doctor') {
        await Doctor.findOneAndUpdate({ userId: user._id }, { is_online: true });
      }
      if (user.role === 'hospital' || user.role === 'hospital_admin') {
        await Hospital.findOneAndUpdate({ userId: user._id }, { is_online: true });
      }
      if (user.role === 'ambulance_driver') {
        await AmbulanceService.findOneAndUpdate({ userId: user._id }, { is_online: true, is_available: true });
      }

      // Migrate guest SOS cases comprehensively on login
      if (!user.role || user.role === 'user') {
        await migrateGuestCases(user._id.toString(), user.helpAidId || '', guestCaseIds || [], guestSessionId);
      }

      // Fetch profile data with self-healing linkage updates
      let profileData: any = null;
      if (user.role === 'doctor') {
        profileData = await Doctor.findOne({ userId: user._id.toString() }).lean();
        if (profileData && !user.doctorProfileId) {
          user.doctorProfileId = profileData._id;
          await user.save();
        }
      }
      if (user.role === 'hospital' || user.role === 'hospital_admin') {
        profileData = await Hospital.findOne({ userId: user._id.toString() }).lean();
        if (profileData && !user.hospitalProfileId) {
          user.hospitalProfileId = profileData._id;
          user.hospitalId = profileData._id.toString();
          await user.save();
        }
      }
      if (user.role === 'ambulance_driver' || user.role === 'ambulance') {
        let amb = await AmbulanceService.findOne({ userId: user._id });
        if (!amb) {
          amb = await AmbulanceService.findOne({ phone: user.phone });
        }
        if (amb) {
          amb.userId = user._id;
          amb.profileId = amb._id.toString();
          amb.socketRoom = `ambulance_${amb._id.toString()}`;
          amb.lastSeen = new Date();
          amb.onlineStatus = 'online';
          amb.is_online = true;
          amb.is_available = true;
          await amb.save();

          profileData = amb.toObject ? amb.toObject() : amb;

          if (!user.ambulanceProfileId || !user.ambulanceId) {
            user.ambulanceProfileId = amb._id;
            user.ambulanceId = amb._id.toString();
            await user.save();
          }
        }
      }

      const token = generateToken({
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        displayName: user.displayName
      });

      console.log('LOGIN_SUCCESS', { userId: user._id.toString(), email: user.email, role: user.role });

      return res.json({
        success: true,
        token,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          displayName: user.displayName,
          phone: user.phone,
          status: user.status,
          doctorProfileId: user.doctorProfileId,
          hospitalProfileId: user.hospitalProfileId,
          hospitalId: user.hospitalId,
          ambulanceProfileId: user.ambulanceProfileId,
          ambulanceId: user.ambulanceId,
          helpAidId: user.helpAidId || '',
          patientName: user.patientName || '',
          age: user.age || null,
          gender: user.gender || '',
          bloodGroup: user.bloodGroup || '',
          emergencyContact: user.emergencyContact || '',
          is_online: true,
          profile: profileData
        }
      });
    } else {
      return res.status(500).json({ error: 'Database is disconnected.' });
    }
  } catch (error: any) {
    console.error('LOGIN_FAILED', error?.message || error);
    console.error('[Auth Login Error]:', error.message);
    return res.status(500).json({ error: 'Login failed.' });
  }
}

export async function logout(req: Request, res: Response) {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  try {
    if (isDbConnected) {
      if (mongoose.Types.ObjectId.isValid(userId)) {
        const user = await User.findById(userId);
        if (user) {
          user.is_online = false;
          await user.save();

          if (user.role === 'doctor') {
            await Doctor.findOneAndUpdate({ userId: user._id }, { is_online: false });
          }
          if (user.role === 'hospital' || user.role === 'hospital_admin') {
            await Hospital.findOneAndUpdate({ userId: user._id }, { is_online: false });
          }
          if (user.role === 'ambulance_driver') {
            await AmbulanceService.findOneAndUpdate({ userId: user._id }, { is_online: false });
          }
        }
      } else {
        console.log(`[Auth] userId '${userId}' is not a valid ObjectId. Skipping MongoDB User online status toggle.`);
      }
    }

    // Clear any auth cookie if client used cookies for token storage
    try {
      res.clearCookie && res.clearCookie('helpaid_token');
    } catch (e) { /* best-effort */ }

    console.log('LOGOUT_SUCCESS', { userId });

    return res.json({ success: true, message: 'Logged out successfully.' });
  } catch (error: any) {
    console.error('[Auth Logout Error]:', error.message);
    return res.status(500).json({ error: 'Logout failed.' });
  }
}

// Stats for Admin Dashboard
export async function getAdminStats(req: AuthenticatedRequest, res: Response) {
  try {
    const [hospitals, doctors, bloodBanks, medicalStores, policeStations, importLogs] = await Promise.all([
      getHospitals({}),
      getDoctors({}),
      getBloodBanks({}),
      getMedicalStores({}),
      getPoliceStations({}),
      getImportLogs()
    ]);

    const countVerified = (arr: any[]) => arr.filter(item => item.verified === true).length;
    const countUnverified = (arr: any[]) => arr.filter(item => item.verified !== true).length;

    const stats = {
      hospitals: hospitals.length,
      hospitalsVerified: countVerified(hospitals),
      hospitalsUnverified: countUnverified(hospitals),

      doctors: doctors.length,
      doctorsVerified: countVerified(doctors),
      doctorsUnverified: countUnverified(doctors),

      bloodBanks: bloodBanks.length,
      bloodBanksVerified: countVerified(bloodBanks),
      bloodBanksUnverified: countUnverified(bloodBanks),

      medicalStores: medicalStores.length,
      medicalStoresVerified: countVerified(medicalStores),
      medicalStoresUnverified: countUnverified(medicalStores),

      policeStations: policeStations.length,
      policeStationsVerified: countVerified(policeStations),
      policeStationsUnverified: countUnverified(policeStations),
    };

    const lastLog = importLogs && importLogs.length > 0 ? importLogs[0] : null;

    return res.json({
      success: true,
      stats,
      lastImportTime: lastLog ? lastLog.timestamp : null,
      importErrors: lastLog ? lastLog.errors || [] : [],
      lastImportLog: lastLog
    });
  } catch (error: any) {
    console.error('[Admin Stats Error]:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve metrics.' });
  }
}
