import { get } from '@vercel/blob';
import { Readable } from 'node:stream';
import { isAdmin, unauthorized } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!isAdmin(req)) return unauthorized(res);
  const pathname = String(req.query.pathname || '');
  if (!pathname.startsWith('customer-uploads/')) return res.status(400).send('Invalid image path.');
  try {
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
