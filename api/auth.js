import { createHash, timingSafeEqual } from 'node:crypto';
import { clearSession, isAdmin, setSession } from '../lib/auth.js';

function equalSecret(a, b) {
  const left = createHash('sha256').update(String(a || '')).digest();
  const right = createHash('sha256').update(String(b || '')).digest();
  return timingSafeEqual(left, right);
}

export default function handler(req, res) {
  if (req.method === 'GET') return res.status(isAdmin(req) ? 200 : 401).json({ authenticated: isAdmin(req) });
  if (req.method === 'DELETE') {
    clearSession(res);
    return res.status(200).json({ authenticated: false });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const { username, password } = req.body || {};
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
    return res.status(503).json({ error: 'Admin environment variables are not configured.' });
  }
  if (!equalSecret(username, process.env.ADMIN_USERNAME) || !equalSecret(password, process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  setSession(res);
  return res.status(200).json({ authenticated: true });
}
