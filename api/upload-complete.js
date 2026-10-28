import { list, put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const { templateId, jobId = 'job-default', batchId, pathnames } = req.body || {};
  if (!/^\d+$/.test(String(templateId || '')) || !/^job-[a-z0-9-]{6,64}$/i.test(String(jobId)) || !/^[a-f0-9-]{36}$/i.test(String(batchId || '')) || !Array.isArray(pathnames) || pathnames.length < 1 || pathnames.length > 500) {
    return res.status(400).json({ error: 'Invalid upload completion.' });
  }
  const activePrefix = `customer-uploads/${templateId}/${jobId}/`;
  const legacyPrefix = `customer-uploads/${templateId}/`;
  const hasLegacyPaths = jobId === 'job-default' && Array.isArray(pathnames) && pathnames.some(path => typeof path === 'string' && path.startsWith(legacyPrefix) && !path.slice(legacyPrefix.length).includes('/'));
  const prefixes = hasLegacyPaths ? [legacyPrefix] : [activePrefix];
  const validPath = path => typeof path === 'string' && (path.startsWith(activePrefix) || (jobId === 'job-default' && path.startsWith(legacyPrefix) && !path.slice(legacyPrefix.length).includes('/')));
  if (pathnames.some(path => !validPath(path))) return res.status(400).json({ error: 'Upload paths do not match this template and job.' });
  try {
    const storedPaths = new Set();
    for (const prefix of prefixes) { let cursor; do { const result = await list({ access: 'private', prefix, limit: 1000, cursor }); result.blobs.forEach(blob => storedPaths.add(blob.pathname)); cursor = result.hasMore ? result.cursor : undefined; } while (cursor); }
    if (pathnames.some(path => !storedPaths.has(path))) return res.status(400).json({ error: 'An upload is not available in storage yet.' });
    const completion = { id: batchId, templateId: String(templateId), jobId, count: pathnames.length, pathnames, completedAt: new Date().toISOString() };
    await put(`admin/upload-completions/${jobId}/${templateId}-${batchId}.json`, JSON.stringify(completion), {
      access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false,
    });
    return res.status(200).json({ completed: true });
  } catch (error) {
    if (/already exists|overwrite/i.test(error.message || '')) return res.status(200).json({ completed: true });
    return res.status(500).json({ error: error.message || 'Could not record upload completion.' });
  }
}
