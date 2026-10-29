import { get, list } from '@vercel/blob';
import { isAdmin, unauthorized } from '../lib/auth.js';
import { db, r2Ready, r2Requested, signedR2Url } from '../lib/r2.js';

async function readJsonBlob(pathname) {
  const item = await get(pathname, { access: 'private' });
  if (!item || item.statusCode !== 200) return null;
  const chunks = [];
  for await (const chunk of item.stream) chunks.push(chunk);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}

export default async function handler(req, res) {
  if (!isAdmin(req)) return unauthorized(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!r2Requested() || !r2Ready()) return res.status(503).json({ error: 'Configure R2 and Supabase before migrating existing Blob files.' });
  const phase = req.body?.phase === 'batches' ? 'batches' : 'photos';
  const cursor = typeof req.body?.cursor === 'string' ? req.body.cursor : undefined;
  try {
    if (phase === 'photos') {
      const page = await list({ access: 'private', prefix: 'customer-uploads/', limit: 5, cursor, mode: 'expanded' });
      const records = [], nextBySequence = new Map();
      let copied = 0, skipped = 0;
      for (const blob of page.blobs) {
        const item = await get(blob.pathname, { access: 'private' });
        if (!item || item.statusCode !== 200) { skipped++; continue; }
        const chunks = [];
        for await (const chunk of item.stream) chunks.push(chunk);
        const bytes = Buffer.concat(chunks);
        const uploaded = await fetch(signedR2Url('PUT', blob.pathname, 300), { method: 'PUT', headers: { 'Content-Type': blob.contentType || 'image/jpeg' }, body: bytes });
        if (!uploaded.ok) throw new Error(`R2 copy failed for ${blob.pathname} (${uploaded.status}).`);
        const parts = blob.pathname.split('/');
        const templateId = parts[1] === 'unassigned' ? 'unassigned' : parts[1];
        const jobId = templateId === 'unassigned' ? 'job-default' : (parts.length >= 4 ? parts[2] : 'job-default');
        const name = parts.at(-1).replace(/^[0-9a-f-]{36}-/i, '');
        records.push({ pathname: blob.pathname, name, template_id: templateId, job_id: jobId, size: bytes.length, content_type: blob.contentType || 'image/jpeg', uploaded_at: blob.uploadedAt || new Date().toISOString() });
        const number = Number(name.match(/^(\d+)/)?.[1] || 0);
        if (number) {
          const key = `${templateId}\n${jobId}`;
          nextBySequence.set(key, Math.max(nextBySequence.get(key) || 1, number + 1));
        }
        copied++;
      }
      if (records.length) await db('photo_assets?on_conflict=pathname', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(records) });
      for (const [key, next] of nextBySequence) {
        const [templateId, jobId] = key.split('\n');
        await db('rpc/advance_photo_sequence', { method: 'POST', body: JSON.stringify({ p_template_id: templateId, p_job_id: jobId, p_next_number: next }) });
      }
      if (!page.hasMore) {
        const layout = await readJsonBlob('admin/layout.json');
        if (layout && Array.isArray(layout.pages)) await db('app_state?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'print_layout', value: layout, updated_at: new Date().toISOString() }) });
      }
      return res.status(200).json({ phase: page.hasMore ? 'photos' : 'batches', cursor: page.hasMore ? page.cursor : null, copied, skipped, done: false });
    }

    const page = await list({ access: 'private', prefix: 'admin/upload-completions/', limit: 10, cursor });
    const batches = [];
    for (const blob of page.blobs) {
      const batch = await readJsonBlob(blob.pathname);
      if (batch?.id && Array.isArray(batch.pathnames)) batches.push({ id: batch.id, template_id: String(batch.templateId), job_id: batch.jobId || 'job-default', count: batch.count || batch.pathnames.length, pathnames: batch.pathnames, completed_at: batch.completedAt || new Date().toISOString() });
    }
    if (batches.length) await db('photo_batches?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(batches) });
    return res.status(200).json({ phase: 'batches', cursor: page.hasMore ? page.cursor : null, copied: batches.length, skipped: 0, done: !page.hasMore });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not migrate Blob files to R2.' });
  }
}
