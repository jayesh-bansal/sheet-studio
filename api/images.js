import { del, list } from '@vercel/blob';
import { isAdmin, unauthorized } from '../lib/auth.js';

async function allImages() {
  const blobs = [];
  let cursor;
  do {
    const result = await list({ access: 'private', prefix: 'customer-uploads/', limit: 1000, cursor, mode: 'expanded' });
    blobs.push(...result.blobs);
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return blobs;
}

export default async function handler(req, res) {
  if (!isAdmin(req)) return unauthorized(res);
  try {
    if (req.method === 'GET') {
      const images = (await allImages()).map(blob => ({
        pathname: blob.pathname,
        name: blob.pathname.split('/').pop().replace(/^[0-9a-f-]{36}-/i, ''),
        templateId: blob.pathname.split('/').length < 3 || blob.pathname.split('/')[1] === 'unassigned'
          ? null
          : blob.pathname.split('/')[1],
        size: blob.size,
        contentType: blob.contentType,
        uploadedAt: blob.uploadedAt,
      }));
      return res.status(200).json({ images });
    }
    if (req.method === 'DELETE') {
      const pathname = String(req.query.pathname || '');
      if (!pathname.startsWith('customer-uploads/')) return res.status(400).json({ error: 'Invalid image path.' });
      await del(pathname, { access: 'private' });
      return res.status(200).json({ deleted: true });
    }
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Image library request failed.' });
  }
}
