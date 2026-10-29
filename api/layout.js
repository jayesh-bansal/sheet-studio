import { get, put } from '@vercel/blob';
import { isAdmin, unauthorized } from '../lib/auth.js';
import { db, r2Ready, r2Requested } from '../lib/r2.js';

const PATH = 'admin/layout.json';

export default async function handler(req, res) {
  if (!isAdmin(req)) return unauthorized(res);
  try {
    if (r2Requested() && !r2Ready()) return res.status(503).json({ error: 'R2 is selected but the R2 or Supabase environment variables are incomplete.' });
    if (req.method === 'GET') {
      if (r2Ready()) {
        const rows = await db('app_state?select=value&key=eq.print_layout&limit=1');
        if (rows[0]?.value) return res.status(200).json(rows[0].value);
        let legacy;
        try { legacy = await get(PATH, { access: 'private' }); } catch { return res.status(200).json({}); }
        if (!legacy || legacy.statusCode !== 200) return res.status(200).json({});
        const chunks = [];
        for await (const chunk of legacy.stream) chunks.push(chunk);
        const state = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        await db('app_state?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ key: 'print_layout', value: state }) });
        return res.status(200).json(state);
      }
      const result = await get(PATH, { access: 'private' });
      if (!result || result.statusCode !== 200) return res.status(200).json({});
      const chunks = [];
      for await (const chunk of result.stream) chunks.push(chunk);
      return res.status(200).json(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    }
    if (req.method === 'PUT') {
      const state = req.body || {};
      if (!Array.isArray(state.pages) || state.pages.length > 1000 || (state.jobs != null && (!Array.isArray(state.jobs) || state.jobs.length > 500))) return res.status(400).json({ error: 'Invalid print workspace.' });
      if (r2Ready()) {
        await db('app_state?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'print_layout', value: state, updated_at: new Date().toISOString() }) });
        return res.status(200).json({ saved: true });
      }
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
