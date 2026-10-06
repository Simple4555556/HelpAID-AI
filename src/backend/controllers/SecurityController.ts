import { Request, Response } from 'express';
import { getConsentLogs, createConsentLog } from '../../../db.js';

export const fetchConsentLogs = async (req: Request, res: Response) => {
  try {
    const logs = await getConsentLogs({});
    return res.json({ success: true, logs });
  } catch (err: any) {
    console.error('Failed to fetch consent logs:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch consent logs.' });
  }
};

export const logPatientConsent = async (req: Request, res: Response) => {
  const { userId, caseId, consentType, granted } = req.body;

  if (!userId || !consentType) {
    return res.status(400).json({ success: false, error: 'Missing userId or consentType.' });
  }

  try {
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    const newLog = await createConsentLog({
      userId,
      caseId: caseId || null,
      consentType,
      granted: granted !== undefined ? granted : true,
      ipAddress,
      userAgent
    });

    return res.json({ success: true, log: newLog });
  } catch (err: any) {
    console.error('Failed to log consent:', err);
    return res.status(500).json({ success: false, error: 'Failed to record consent log.' });
  }
};
