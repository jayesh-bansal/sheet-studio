import { get } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    // A missing layout file is normal for a new project; a successful lookup
    // (including a not-found result) confirms the deployment can reach Blob.
    await get('admin/layout.json', { access: 'private' });
    return res.status(200).json({ connected: true, message: 'Vercel Blob is reachable.' });
  } catch (error) {
    const message = error.message || '';
    const setupError = /token|blob|store|credential|permission|authoriz/i.test(message);
    return res.status(503).json({
      connected: false,
      message: setupError
        ? 'Blob is not reachable. Connect a Vercel Blob store to this project and deployment environment, then redeploy.'
        : 'Blob check failed. Review the Vercel function logs for this request.',
    });
  }
}
