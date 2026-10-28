import { get, list } from '@vercel/blob';

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
  for (const prefix of prefixes) {
    let cursor;
    do {
      const result = await list({ access: 'private', prefix, limit: 1000, cursor });
      count += result.blobs.filter(blob => {
        const parts = blob.pathname.split('/');
        return prefix.endsWith(`/${jobId}/`) ? parts.length >= 4 && parts[2] === jobId : parts.length === 3 && jobId === 'job-default';
      }).length;
      cursor = result.hasMore ? result.cursor : undefined;
    } while (cursor);
  }
  return count;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const id = String(req.query.id || '');
  const jobId = String(req.query.jobId || 'job-default');
  if (!/^[1-3]$/.test(id) || !/^job-[a-z0-9-]{6,64}$/i.test(jobId)) return res.status(400).json({ error: 'Invalid upload template or print job.' });
  try {
    const stored = await get('admin/layout.json', { access: 'private' });
    if (!stored || stored.statusCode !== 200) return res.status(404).json({ error: 'Upload template not found.' });
    const chunks = [];
    for await (const chunk of stored.stream) chunks.push(chunk);
    const layout = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const page = layout.pages?.find(item => String(item.id) === id);
    const job = (layout.jobs || [{ id: 'job-default', name: 'Current job', status: 'active' }]).find(item => item.id === jobId);
    if (!job || job.status === 'archived' || job.status === 'complete') return res.status(404).json({ error: 'This print job is closed. Ask the print admin for a current upload link.' });
    if (!page) return res.status(404).json({ error: 'This upload page is no longer available.' });
    const capacity = fitCapacity(page);
    const maxPhotos = Math.min(capacity, Math.max(1, Number(page.maxPhotos) || capacity));
    return res.status(200).json({
      id: page.id,
      jobId,
      jobName: job.name,
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
      uploadedCount: await countUploads(id, jobId),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not load upload template.' });
  }
}
