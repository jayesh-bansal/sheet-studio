import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'sheet_studio_admin';
const MAX_AGE = 60 * 60 * 12;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
  return value;
}

function signature(payload) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function makeSession() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + MAX_AGE * 1000 })).toString('base64url');
  return `${payload}.${signature(payload)}`;
}

export function isAdmin(req) {
  try {
    const cookie = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`));
    if (!cookie) return false;
    const token = decodeURIComponent(cookie.slice(COOKIE.length + 1));
    const [payload, supplied] = token.split('.');
    if (!payload || !supplied) return false;
    const expected = Buffer.from(signature(payload));
    const actual = Buffer.from(supplied);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
  } catch {
    return false;
  }
}

export function setSession(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(makeSession())}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${MAX_AGE}${secure}`);
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Secure`);
}


export function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const protocol = (forwardedProto || (req.socket?.encrypted ? 'https' : 'http')).toLowerCase();
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}

export function rejectCrossOrigin(req, res) {
  if (sameOrigin(req)) return false;
  res.status(403).json({ error: 'Cross-origin request blocked.' });
  return true;
}

export function unauthorized(res) {
  res.status(401).json({ error: 'Admin sign-in required.' });
}
