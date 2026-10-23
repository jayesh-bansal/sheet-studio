import { get } from '@vercel/blob';

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
    return res.status(200).json({
      id: page.id,
      itemW: Number(page.itemW) || 60,
      itemH: Number(page.itemH) || 90,
      cropFill: Boolean(page.cropFill),
      sheetW: Number(page.sheetW) || 210,
      sheetH: Number(page.sheetH) || 297,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not load upload template.' });
  }
}
