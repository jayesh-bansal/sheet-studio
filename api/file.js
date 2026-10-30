import { get } from '@vercel/blob';
import { Readable } from 'node:stream';
import { isAdmin, unauthorized } from '../lib/auth.js';
import { r2Ready, r2Requested, signedR2Url } from '../lib/r2.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed.');
  if (!isAdmin(req)) return unauthorized(res);
  const pathname = String(req.query.pathname || '');
  if (!pathname.startsWith('customer-uploads/') && !pathname.startsWith('payment-proofs/')) return res.status(400).send('Invalid image path.');
  try {
    if (r2Requested() && !r2Ready()) return res.status(503).send('R2 is selected but the R2 or Supabase environment variables are incomplete.');
    if (r2Ready()) {
      const upstream = await fetch(signedR2Url('GET', pathname, 300));
      if (!upstream.ok || !upstream.body) return res.status(upstream.status || 502).send('Could not load image from R2.');
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const length = upstream.headers.get('content-length');
      if (length) res.setHeader('Content-Length', length);
      return Readable.fromWeb(upstream.body).pipe(res);
    }
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
