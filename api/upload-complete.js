import { list, put } from '@vercel/blob';
import { db, r2Ready, r2Requested, signedR2Url } from '../lib/r2.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const { templateId, jobId = 'job-default', batchId, pathnames, paymentPathname = null } = req.body || {};
  if (!(String(templateId) === 'unassigned' || /^\d+$/.test(String(templateId || ''))) || !/^job-[a-z0-9-]{6,64}$/i.test(String(jobId)) || !/^[a-f0-9-]{36}$/i.test(String(batchId || '')) || !Array.isArray(pathnames) || pathnames.length < 1 || pathnames.length > 500) {
    return res.status(400).json({ error: 'Invalid upload completion.' });
  }
  const activePrefix = templateId === 'unassigned' ? 'customer-uploads/unassigned/' : `customer-uploads/${templateId}/${jobId}/`;
  const legacyPrefix = `customer-uploads/${templateId}/`;
  const hasLegacyPaths = jobId === 'job-default' && Array.isArray(pathnames) && pathnames.some(path => typeof path === 'string' && path.startsWith(legacyPrefix) && !path.slice(legacyPrefix.length).includes('/'));
  const prefixes = hasLegacyPaths ? [legacyPrefix] : [activePrefix];
  const validPath = path => typeof path === 'string' && (path.startsWith(activePrefix) && (templateId === 'unassigned' || !path.slice(activePrefix.length).includes('/')) || (templateId !== 'unassigned' && jobId === 'job-default' && path.startsWith(legacyPrefix) && !path.slice(legacyPrefix.length).includes('/')));
  if (pathnames.some(path => !validPath(path))) return res.status(400).json({ error: 'Upload paths do not match this template and job.' });
  const paymentPrefix = `payment-proofs/${templateId}/${jobId}/`;
  if (paymentPathname != null && (typeof paymentPathname !== 'string' || !paymentPathname.startsWith(paymentPrefix) || paymentPathname.slice(paymentPrefix.length).includes('/'))) return res.status(400).json({ error: 'Payment proof path does not match this upload page.' });
  try {
    if (r2Requested() && !r2Ready()) return res.status(503).json({ error: 'R2 is selected but the R2 or Supabase environment variables are incomplete.' });
    if (r2Ready()) {
      const records = [];
      for (const pathname of pathnames) {
        const head = await fetch(signedR2Url('HEAD', pathname, 300), { method: 'HEAD' });
        if (!head.ok) return res.status(400).json({ error: 'An upload is not available in R2 yet.' });
        records.push({ pathname, template_id: String(templateId), job_id: jobId, name: pathname.split('/').pop().replace(/^[0-9a-f-]{36}-/i, ''), size: Number(head.headers.get('content-length') || 0), content_type: head.headers.get('content-type') || 'image/jpeg', uploaded_at: new Date().toISOString(), batch_id: batchId });
      }
      if (paymentPathname) {
        const proof = await fetch(signedR2Url('HEAD', paymentPathname, 300), { method: 'HEAD' });
        if (!proof.ok) return res.status(400).json({ error: 'Payment proof is not available in R2 yet.' });
      }
      await db('photo_assets?on_conflict=pathname', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(records) });
      const batchPaths = paymentPathname ? { photos: pathnames, paymentPathname } : pathnames;
      await db('photo_batches?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ id: batchId, template_id: String(templateId), job_id: jobId, count: pathnames.length, pathnames: batchPaths, completed_at: new Date().toISOString() }) });
      return res.status(200).json({ completed: true });
    }
    const storedPaths = new Set();
    for (const prefix of prefixes) { let cursor; do { const result = await list({ access: 'private', prefix, limit: 1000, cursor }); result.blobs.forEach(blob => storedPaths.add(blob.pathname)); cursor = result.hasMore ? result.cursor : undefined; } while (cursor); }
    if (pathnames.some(path => !storedPaths.has(path))) return res.status(400).json({ error: 'An upload is not available in storage yet.' });
    if (paymentPathname) {
      const paymentStored = new Set(); let cursor;
      do { const result = await list({ access: 'private', prefix: paymentPrefix, limit: 1000, cursor }); result.blobs.forEach(blob => paymentStored.add(blob.pathname)); cursor = result.hasMore ? result.cursor : undefined; } while (cursor);
      if (!paymentStored.has(paymentPathname)) return res.status(400).json({ error: 'Payment proof is not available in storage yet.' });
    }
    const completion = { id: batchId, templateId: String(templateId), jobId, count: pathnames.length, pathnames, paymentPathname, completedAt: new Date().toISOString() };
    await put(`admin/upload-completions/${jobId}/${templateId}-${batchId}.json`, JSON.stringify(completion), {
      access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false,
    });
    return res.status(200).json({ completed: true });
  } catch (error) {
    if (/already exists|overwrite/i.test(error.message || '')) return res.status(200).json({ completed: true });
    return res.status(500).json({ error: error.message || 'Could not record upload completion.' });
  }
}
