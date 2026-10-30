import { get, list } from '@vercel/blob';
import { db, r2Ready, r2Requested } from '../lib/r2.js';

function fitCapacity(page) {
  const sheetW = Number(page.sheetW) || 210;
  const sheetH = Number(page.sheetH) || 297;
  const itemW = Number(page.itemW) || 60;
  const itemH = Number(page.itemH) || 90;
  const marginX = Math.max(0, Number(page.marginX ?? page.margin ?? 3));
  const marginY = Math.max(0, Number(page.marginY ?? page.margin ?? 3));
  const spacingX = Math.max(0, Number(page.spacingX ?? page.spacing ?? 3));
  const spacingY = Math.max(0, Number(page.spacingY ?? page.spacing ?? 3));
  return Math.max(1, Math.floor((sheetW - 2 * marginX + spacingX) / (itemW + spacingX)) * Math.floor((sheetH - 2 * marginY + spacingY) / (itemH + spacingY)));
}

async function countUploads(id, jobId) {
  const prefixes = [`customer-uploads/${id}/${jobId}/`];
  if (jobId === 'job-default') prefixes.push(`customer-uploads/${id}/`);
  let count = 0;
  let largestPhotoNumber = 0;
  for (const prefix of prefixes) {
    let cursor;
    do {
      const result = await list({ access: 'private', prefix, limit: 1000, cursor });
      const matching = result.blobs.filter(blob => {
        const parts = blob.pathname.split('/');
        return prefix.endsWith(`/${jobId}/`) ? parts.length >= 4 && parts[2] === jobId : parts.length === 3 && jobId === 'job-default';
      });
      count += matching.length;
      for (const blob of matching) {
        const filename = blob.pathname.split('/').pop();
        const number = filename.match(/^[0-9a-f-]{36}-(\d+)/i)?.[1];
        if (number) largestPhotoNumber = Math.max(largestPhotoNumber, Number(number));
      }
      cursor = result.hasMore ? result.cursor : undefined;
    } while (cursor);
  }
  return { count, nextPhotoNumber: largestPhotoNumber + 1 };
}

async function storedLayout() {
  if (r2Ready()) {
    const rows = await db('app_state?select=value&key=eq.print_layout&limit=1');
    if (rows[0]?.value) return rows[0].value;
    let legacy;
    try { legacy = await get('admin/layout.json', { access: 'private' }); } catch { return null; }
    if (!legacy || legacy.statusCode !== 200) return null;
    const chunks = [];
    for await (const chunk of legacy.stream) chunks.push(chunk);
    const state = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    await db('app_state?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ key: 'print_layout', value: state }) });
    return state;
  }
  const stored = await get('admin/layout.json', { access: 'private' });
  if (!stored || stored.statusCode !== 200) return null;
  const chunks = [];
  for await (const chunk of stored.stream) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const id = String(req.query.id || '');
  const requestedJobId = String(req.query.jobId || '');
  if (!/^[1-3]$/.test(id) || requestedJobId && !/^job-[a-z0-9-]{6,64}$/i.test(requestedJobId)) return res.status(400).json({ error: 'Invalid upload template.' });
  try {
    if (r2Requested() && !r2Ready()) return res.status(503).json({ error: 'R2 is selected but the R2 or Supabase environment variables are incomplete.' });
    const layout = await storedLayout();
    if (!layout) return res.status(404).json({ error: 'Upload template not found.' });
    const jobId = requestedJobId || String(layout.activeJobId || 'job-default');
    const page = layout.pages?.find(item => String(item.id) === id);
    const job = (layout.jobs || [{ id: 'job-default', name: 'Current workspace', status: 'active' }]).find(item => item.id === jobId);
    if (!job || job.status === 'archived' || job.status === 'complete') return res.status(404).json({ error: 'This upload page is unavailable. Ask the print admin for a current QR code.' });
    if (!page) return res.status(404).json({ error: 'This upload page is no longer available.' });
    const capacity = fitCapacity(page);
    const maxPhotos = Math.min(capacity, Math.max(1, Number(page.maxPhotos) || capacity));
    let uploadSequence;
    if (r2Ready()) {
      const rows = await db(`photo_assets?select=pathname&template_id=eq.${encodeURIComponent(id)}&job_id=eq.${encodeURIComponent(jobId)}`);
      const seq = await db(`photo_sequences?select=next_number&template_id=eq.${encodeURIComponent(id)}&job_id=eq.${encodeURIComponent(jobId)}&limit=1`);
      uploadSequence = { count: rows.length, nextPhotoNumber: Number(seq[0]?.next_number || 1) };
    } else uploadSequence = await countUploads(id, jobId);
    return res.status(200).json({
      id: page.id,
      jobId,
      name: page.name || `Sheet ${page.id}`,
      itemW: Number(page.itemW) || 60,
      itemH: Number(page.itemH) || 90,
      cropFill: Boolean(page.cropFill),
      marginX: Number(page.marginX ?? page.margin ?? 3),
      marginY: Number(page.marginY ?? page.margin ?? 3),
      spacingX: Number(page.spacingX ?? page.spacing ?? 3),
      spacingY: Number(page.spacingY ?? page.spacing ?? 3),
      uploadLimit: 500,
      sheetW: Number(page.sheetW) || 210,
      sheetH: Number(page.sheetH) || 297,
      maxPhotos,
      uploadedCount: uploadSequence.count,
      nextPhotoNumber: uploadSequence.nextPhotoNumber,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not load upload template.' });
  }
}
