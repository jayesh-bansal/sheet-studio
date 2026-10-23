import { get, list } from '@vercel/blob';

function fitCapacity(page) {
  const sheetW = Number(page.sheetW) || 210;
  const sheetH = Number(page.sheetH) || 297;
  const itemW = Number(page.itemW) || 60;
  const itemH = Number(page.itemH) || 90;
  const gap = 3;
  return Math.max(1, Math.floor((sheetW - 6 + gap) / (itemW + gap)) * Math.floor((sheetH - 6 + gap) / (itemH + gap)));
}

async function countUploads(id) {
  let count = 0;
  let cursor;
  do {
    const result = await list({ access: 'private', prefix: `customer-uploads/${id}/`, limit: 1000, cursor });
    count += result.blobs.length;
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return count;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const id = String(req.query.id || '');
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Invalid upload template.' });
  try {
    const stored = await get('admin/layout.json', { access: 'private' });
    if (!stored || stored.statusCode !== 200) return res.status(404).json({ error: 'Upload template not found.' });
    const chunks = [];
    for await (const chunk of stored.stream) chunks.push(chunk);
    const layout = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const page = layout.pages?.find(item => String(item.id) === id);
    if (!page) return res.status(404).json({ error: 'This upload page is no longer available.' });
    const capacity = fitCapacity(page);
    const maxPhotos = Math.min(capacity, Math.max(1, Number(page.maxPhotos) || capacity));
    return res.status(200).json({
      id: page.id,
      name: page.name || `Sheet ${page.id}`,
      itemW: Number(page.itemW) || 60,
      itemH: Number(page.itemH) || 90,
      cropFill: Boolean(page.cropFill),
      sheetW: Number(page.sheetW) || 210,
      sheetH: Number(page.sheetH) || 297,
      maxPhotos,
      uploadedCount: await countUploads(id),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not load upload template.' });
  }
}
