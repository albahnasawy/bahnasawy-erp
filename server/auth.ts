import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getDb, getSetting, setSetting } from './db.ts';

export type UserRole = 'admin' | 'cashier' | 'warehouse';

export interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHash] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const origBuf = Buffer.from(originalHash, 'hex');
  if (derived.length !== origBuf.length) return false;
  return crypto.timingSafeEqual(derived, origBuf);
}

function getAuthSecret(): string {
  const db = getDb();
  let secret = getSetting(db, 'auth_secret');
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    setSetting(db, 'auth_secret', secret);
  }
  return secret;
}

interface TokenPayload {
  uid: number;
  role: UserRole;
  exp: number;
}

export function signToken(user: AuthUser): string {
  const payload: TokenPayload = {
    uid: user.id,
    role: user.role,
    exp: Date.now() + 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getAuthSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getAuthSecret())
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed || typeof parsed.uid !== 'number' || typeof parsed.exp !== 'number') {
      return null;
    }
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (typeof req.query.token === 'string') {
    token = req.query.token.trim();
  }

  if (!token) {
    res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً' });
    return;
  }

  const db = getDb();
  const userRow = db
    .prepare('SELECT id, username, full_name, role, is_active FROM users WHERE id = ?')
    .get(payload.uid) as
    | { id: number; username: string; full_name: string; role: UserRole; is_active: number }
    | undefined;

  if (!userRow || userRow.is_active !== 1) {
    res.status(401).json({ error: 'الحساب غير نشط أو غير موجود' });
    return;
  }

  req.user = {
    id: userRow.id,
    username: userRow.username,
    full_name: userRow.full_name,
    role: userRow.role,
  };
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'ليست لديك صلاحية لتنفيذ هذا الإجراء' });
      return;
    }
    next();
  };
}
