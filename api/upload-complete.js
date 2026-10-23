import { list, put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const { templateId, batchId, pathnames } = req.body || {};
  if (!/^\d+$/.test(String(templateId || '')) || !/^[a-f0-9-]{36}$/i.test(String(batchId || '')) || !Array.isArray(pathnames) || pathnames.length < 1 || pathnames.length > 500) {
    return res.status(400).json({ error: 'Invalid upload completion.' });
  }
  const prefix = `customer-uploads/${templateId}/`;
  if (pathnames.some(path => typeof path !== 'string' || !path.startsWith(prefix))) return res.status(400).json({ error: 'Upload paths do not match this template.' });
  try {
    const storedPaths = new Set();
    let cursor;
    do {
      const result = await list({ access: 'private', prefix, limit: 1000, cursor });
      result.blobs.forEach(blob => storedPaths.add(blob.pathname));
      cursor = result.hasMore ? result.cursor : undefined;
    } while (cursor);
    if (pathnames.some(path => !storedPaths.has(path))) return res.status(400).json({ error: 'An upload is not available in storage yet.' });
    const completion = { id: batchId, templateId: String(templateId), count: pathnames.length, completedAt: new Date().toISOString() };
    await put(`admin/upload-completions/${templateId}/${batchId}.json`, JSON.stringify(completion), {
      access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false,
    });
    return res.status(200).json({ completed: true });
  } catch (error) {
    if (/already exists|overwrite/i.test(error.message || '')) return res.status(200).json({ completed: true });
    return res.status(500).json({ error: error.message || 'Could not record upload completion.' });
  }
}
