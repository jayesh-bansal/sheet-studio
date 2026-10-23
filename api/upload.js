import { handleUpload } from '@vercel/blob/client';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = req.body;
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async pathname => {
        if (!pathname.startsWith('customer-uploads/')) throw new Error('Invalid upload path.');
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
          maximumSizeInBytes: 25 * 1024 * 1024,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ source: 'public-upload' }),
        };
      },
      onUploadCompleted: async () => {},
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Upload could not be authorized.' });
  }
}
