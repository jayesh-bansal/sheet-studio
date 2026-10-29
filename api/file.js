import { get } from '@vercel/blob';
import { Readable } from 'node:stream';
import { isAdmin, unauthorized } from '../lib/auth.js';
import { r2Ready, r2Requested, signedR2Url } from '../lib/r2.js';

export default async function handler(req, res) {
  if (!isAdmin(req)) return unauthorized(res);
  const pathname = String(req.query.pathname || '');
  if (!pathname.startsWith('customer-uploads/')) return res.status(400).send('Invalid image path.');
  try {
    if (r2Requested() && !r2Ready()) return res.status(503).send('R2 is selected but the R2 or Supabase environment variables are incomplete.');
    if (r2Ready()) return res.redirect(302, signedR2Url('GET', pathname, 300));
    const result = await get(pathname, { access: 'private' });
    if (!result || result.statusCode !== 200) return res.status(404).send('Image not found.');
    res.setHeader('Content-Type', result.blob.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return Readable.fromWeb(result.stream).pipe(res);
  } catch (error) {
    return res.status(500).send(error.message || 'Could not load image.');
  }
}
