import { del, list, put } from '@vercel/blob';
import { isAdmin, rejectCrossOrigin, unauthorized } from '../lib/auth.js';
import { createDefaultLayout } from '../lib/default-layout.js';
import { db, dbAll, r2Ready, r2Requested, signedR2Url } from '../lib/r2.js';

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
  if (rejectCrossOrigin(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (req.body?.confirmation !== 'DELETE ALL STORED PHOTOS') return res.status(400).json({ error: 'Send confirmation: DELETE ALL STORED PHOTOS to remove stored images.' });
  try {
    if (r2Requested() && !r2Ready()) return res.status(503).json({ error: 'R2 is selected but the R2 or Supabase environment variables are incomplete.' });
    if (r2Ready()) {
      const [photos, batches] = await Promise.all([dbAll('photo_assets?select=pathname'), dbAll('photo_batches?select=pathnames')]);
      const paymentPaths = batches.map(batch => Array.isArray(batch.pathnames) ? null : batch.pathnames?.paymentPathname).filter(path => typeof path === 'string' && path.startsWith('payment-proofs/'));
      const objectPaths = [...new Set([...photos.map(photo => photo.pathname), ...paymentPaths])];
      for (let i = 0; i < objectPaths.length; i += 20) {
        const results = await Promise.all(objectPaths.slice(i, i + 20).map(path => fetch(signedR2Url('DELETE', path, 300), { method: 'DELETE' })));
        if (results.some(result => !result.ok)) throw new Error('Could not delete all R2 images during reset. The catalog was preserved.');
      }
      await Promise.all([
        db('photo_assets?pathname=not.is.null', { method: 'DELETE', headers: { Prefer: 'return=minimal' } }),
        db('photo_batches?id=not.is.null', { method: 'DELETE', headers: { Prefer: 'return=minimal' } }),
        db('photo_sequences?template_id=not.is.null', { method: 'DELETE', headers: { Prefer: 'return=minimal' } }),
      ]);
      const layout = createDefaultLayout();
      await db('app_state?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'print_layout', value: layout, updated_at: new Date().toISOString() }) });
      return res.status(200).json({ reset: true, deletedUploads: objectPaths.length, deletedAdminRecords: 0, layout });
    }
    const [photoCount, paymentCount] = await Promise.all([deletePrefix('customer-uploads/'), deletePrefix('payment-proofs/')]);
    const deletedUploads = photoCount + paymentCount;
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
