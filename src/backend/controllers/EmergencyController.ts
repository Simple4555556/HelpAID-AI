import { Request, Response } from 'express';
import { EmergencyContact } from '../../../db.js';

const FALLBACK_CONTACTS = [
  { serviceName: 'Ambulance', phone: '108', state: 'National', district: 'All' },
  { serviceName: 'Police', phone: '112', state: 'National', district: 'All' },
  { serviceName: 'Fire Brigade', phone: '101', state: 'National', district: 'All' },
  { serviceName: 'Women Helpline', phone: '1091', state: 'National', district: 'All' },
  { serviceName: 'Child Helpline', phone: '1098', state: 'National', district: 'All' }
];

export async function getEmergencyContacts(req: Request, res: Response) {
  const { state, district } = req.query;

  try {
    let query: any = {};
    if (state) query.state = new RegExp(state as string, 'i');
    if (district) query.district = new RegExp(district as string, 'i');

    const dbContacts = await EmergencyContact.find(query);

    // If no specific contacts are registered in DB for this region, return the national defaults merged with any matching db contacts
    const results = dbContacts.length > 0 ? dbContacts : FALLBACK_CONTACTS;

    return res.json({
      success: true,
      state: state || 'National',
      district: district || 'All',
      contacts: results
    });

  } catch (error: any) {
    console.error(`[Emergency Controller Error] Failed to get emergency contacts:`, error.message);
    return res.status(500).json({ error: 'Failed to retrieve emergency services directory.' });
  }
}

export async function addEmergencyContact(req: Request, res: Response) {
  const { serviceName, phone, state, district } = req.body;

  if (!serviceName || !phone || !state || !district) {
    return res.status(400).json({ error: 'serviceName, phone, state, and district are all required.' });
  }

  try {
    const newContact = await EmergencyContact.findOneAndUpdate(
      { serviceName, state, district },
      { serviceName, phone, state, district },
      { upsert: true, returnDocument: 'after' }
    );

    return res.json({
      success: true,
      message: 'Emergency contact added/updated successfully.',
      contact: newContact
    });
  } catch (error: any) {
    console.error(`[Emergency Controller Error] Failed to save contact:`, error.message);
    return res.status(500).json({ error: 'Failed to save emergency contact.' });
  }
}
