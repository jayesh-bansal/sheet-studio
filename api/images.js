import { del, get, list } from '@vercel/blob';
import { isAdmin, unauthorized } from '../lib/auth.js';
import { db, dbAll, r2Ready, r2Requested, signedR2Url } from '../lib/r2.js';

async function completedUploads() {
  const records = [];
  let cursor;
  do {
    const result = await list({ access: 'private', prefix: 'admin/upload-completions/', limit: 1000, cursor });
    for (const blob of result.blobs) {
      const stored = await get(blob.pathname, { access: 'private' });
      if (!stored || stored.statusCode !== 200) continue;
      const chunks = [];
      for await (const chunk of stored.stream) chunks.push(chunk);
      try { records.push(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch {}
    }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return records.sort((a, b) => String(a.completedAt).localeCompare(String(b.completedAt)));
}

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
    if (r2Requested() && !r2Ready()) return res.status(503).json({ error: 'R2 is selected but the R2 or Supabase environment variables are incomplete.' });
    if (req.method === 'POST' && r2Ready()) {
      const { pathname, templateId = 'unassigned', jobId = 'job-default', name } = req.body || {};
      if (typeof pathname !== 'string' || !pathname.startsWith('customer-uploads/') || !/^(unassigned|\d+)$/.test(String(templateId))) return res.status(400).json({ error: 'Invalid image record.' });
      const head = await fetch(signedR2Url('HEAD', pathname, 300), { method: 'HEAD' });
      if (!head.ok) return res.status(400).json({ error: 'Image is not available in R2.' });
      await db('photo_assets?on_conflict=pathname', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ pathname, name: String(name || pathname.split('/').pop()), template_id: String(templateId), job_id: jobId, size: Number(head.headers.get('content-length') || 0), content_type: head.headers.get('content-type') || 'image/jpeg', uploaded_at: new Date().toISOString() }) });
      return res.status(200).json({ saved: true });
    }
    if (req.method === 'GET') {
      if (r2Ready()) {
        const after = String(req.query.after || '');
        const filter = after ? `&uploaded_at=gte.${encodeURIComponent(after)}` : '';
        const [rows, batches] = await Promise.all([
          dbAll(`photo_assets?select=pathname,name,template_id,job_id,size,content_type,uploaded_at&order=uploaded_at.asc${filter}`),
          dbAll(`photo_batches?select=id,template_id,job_id,count,pathnames,completed_at&order=completed_at.asc${after ? `&completed_at=gte.${encodeURIComponent(after)}` : ''}`),
        ]);
        const images = rows.map(row => ({ pathname: row.pathname, name: row.name, templateId: row.template_id === 'unassigned' ? null : row.template_id, jobId: row.template_id === 'unassigned' ? null : row.job_id, size: row.size, contentType: row.content_type, uploadedAt: row.uploaded_at }));
        const completedBatches = batches.map(row => ({ id: row.id, templateId: row.template_id, jobId: row.job_id, count: row.count, pathnames: row.pathnames, completedAt: row.completed_at }));
        return res.status(200).json({ images, completedBatches });
      }
      const images = (await allImages()).map(blob => ({
        pathname: blob.pathname,
        name: blob.pathname.split('/').pop().replace(/^[0-9a-f-]{36}-/i, ''),
        templateId: blob.pathname.split('/')[1] === 'unassigned' ? null : (/^\d+$/.test(blob.pathname.split('/')[1] || '') ? blob.pathname.split('/')[1] : null),
        jobId: blob.pathname.split('/')[1] === 'unassigned' ? null : (blob.pathname.split('/').length >= 4 ? blob.pathname.split('/')[2] : 'job-default'),
        size: blob.size,
        contentType: blob.contentType,
        uploadedAt: blob.uploadedAt,
      }));
      return res.status(200).json({ images, completedBatches: await completedUploads() });
    }
    if (req.method === 'DELETE') {
      const pathname = String(req.query.pathname || '');
      if (!pathname.startsWith('customer-uploads/')) return res.status(400).json({ error: 'Invalid image path.' });
      if (r2Ready()) {
        const response = await fetch(signedR2Url('DELETE', pathname, 300), { method: 'DELETE' });
        if (!response.ok) return res.status(502).json({ error: 'Could not delete the R2 object.' });
        await db(`photo_assets?pathname=eq.${encodeURIComponent(pathname)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
        return res.status(200).json({ deleted: true });
      }
      await del(pathname, { access: 'private' });
      return res.status(200).json({ deleted: true });
    }
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Image library request failed.' });
  }
}
