import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'helpaid-super-secret-key-13579';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: 'user' | 'admin' | 'hospital_admin' | 'doctor' | 'ambulance_driver' | 'hospital';
    displayName?: string;
  };
}

// 1. JWT authentication check middleware
export function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Access token is missing.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Access token is malformed.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      displayName: decoded.displayName
    };
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Access token is invalid or expired.' });
  }
}

// 2. Role-Based Access Control (RBAC) middleware
export function requireRole(allowedRoles: string | string[]) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'User is not authenticated.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access forbidden: Insufficient permissions. Required roles: ${roles.join(', ')}` });
    }
    next();
  };
}

// Helper to generate a new token
export function generateToken(payload: { id: string; email: string; role: string; displayName?: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

// 3. Lightweight Rate Limiter Middleware
interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitCache = new Map<string, RateLimitRecord>();

// Purge expired rate limit entries every 5 minutes to prevent memory leak
const RATE_LIMIT_CLEANUP_INTERVAL = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitCache.entries()) {
    if (now > record.resetTime) {
      rateLimitCache.delete(ip);
    }
  }
}, RATE_LIMIT_CLEANUP_INTERVAL).unref();

export function rateLimiter(windowMs: number = 15 * 60 * 1000, maxRequests: number = 200) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
    const now = Date.now();
    const record = rateLimitCache.get(ip);

    if (!record) {
      rateLimitCache.set(ip, {
        count: 1,
        resetTime: now + windowMs
      });
      return next();
    }

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      rateLimitCache.set(ip, record);
      return next();
    }

    record.count++;
    rateLimitCache.set(ip, record);

    if (record.count > maxRequests) {
      res.setHeader('Retry-After', Math.ceil((record.resetTime - now) / 1000));
      return res.status(429).json({
        error: 'Too many requests from this IP, please try again later.'
      });
    }

    next();
  };
}
