import { get, put } from '@vercel/blob';
import { isAdmin, unauthorized } from '../lib/auth.js';

const PATH = 'admin/layout.json';

export default async function handler(req, res) {
  if (!isAdmin(req)) return unauthorized(res);
  try {
    if (req.method === 'GET') {
      const result = await get(PATH, { access: 'private' });
      if (!result || result.statusCode !== 200) return res.status(200).json({});
      const chunks = [];
      for await (const chunk of result.stream) chunks.push(chunk);
      return res.status(200).json(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    }
    if (req.method === 'PUT') {
      const state = req.body || {};
      if (!Array.isArray(state.pages) || state.pages.length > 1000 || (state.jobs != null && (!Array.isArray(state.jobs) || state.jobs.length > 500))) return res.status(400).json({ error: 'Invalid print workspace.' });
      await put(PATH, JSON.stringify(state), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
      });
      return res.status(200).json({ saved: true });
    }
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Layout storage request failed.' });
  }
}
