import { r2Ready, r2Requested } from '../lib/r2.js';

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  res.setHeader('Cache-Control', 'no-store');
  if (r2Requested() && !r2Ready()) return res.status(503).json({ error: 'R2 is selected but the R2 or Supabase environment variables are incomplete.' });
  return res.status(200).json({ provider: r2Ready() ? 'r2' : 'blob' });
}
