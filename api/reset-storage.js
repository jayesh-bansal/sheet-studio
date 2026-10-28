import { del, list, put } from '@vercel/blob';
import { isAdmin, unauthorized } from '../lib/auth.js';
import { createDefaultLayout } from '../lib/default-layout.js';

async function deletePrefix(prefix) {
  const paths = [];
  let cursor;
  do {
    const result = await list({ access: 'private', prefix, limit: 1000, cursor });
    paths.push(...result.blobs.map(blob => blob.pathname));
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  for (let i = 0; i < paths.length; i += 500) {
    await del(paths.slice(i, i + 500), { access: 'private' });
  }
  return paths.length;
}

export default async function handler(req, res) {
  if (!isAdmin(req)) return unauthorized(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (req.body?.settingsVersion !== 3) return res.status(400).json({ error: 'Reset confirmation is required.' });
  try {
    const deletedUploads = await deletePrefix('customer-uploads/');
    const deletedAdminRecords = await deletePrefix('admin/');
    const layout = createDefaultLayout();
    await put('admin/layout.json', JSON.stringify(layout), {
      access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true,
    });
    return res.status(200).json({ reset: true, deletedUploads, deletedAdminRecords, layout });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not reset stored sheet data.' });
  }
}
