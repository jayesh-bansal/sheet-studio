import { issueSignedToken } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    // Minting a short-lived, path-scoped token checks the same OIDC/signing
    // capability used by uploads without creating a file in the store.
    await issueSignedToken({
      pathname: `health-check/${Date.now()}.jpg`,
      operations: ['put'],
      allowedContentTypes: ['image/jpeg'],
      maximumSizeInBytes: 1024,
      validUntil: Date.now() + 60_000,
    });
    return res.status(200).json({ connected: true, uploadsReady: true, message: 'Vercel Blob upload signing is ready.' });
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
