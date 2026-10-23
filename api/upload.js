import { get, issueSignedToken, list } from '@vercel/blob';
import { handleUploadPresigned } from '@vercel/blob/client';

async function storedLayout() {
  const stored = await get('admin/layout.json', { access: 'private' });
  if (!stored || stored.statusCode !== 200) return {};
  const chunks = [];
  for await (const chunk of stored.stream) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function templateUploads(id) {
  const blobs = [];
  let cursor;
  do {
    const result = await list({ access: 'private', prefix: `customer-uploads/${id}/`, limit: 1000, cursor });
    blobs.push(...result.blobs);
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return blobs;
}

function fitCapacity(page) {
  const sheetW = Number(page.sheetW) || 210;
  const sheetH = Number(page.sheetH) || 297;
  const itemW = Number(page.itemW) || 60;
  const itemH = Number(page.itemH) || 90;
  const gap = 3;
  return Math.max(1, Math.floor((sheetW - 6 + gap) / (itemW + gap)) * Math.floor((sheetH - 6 + gap) / (itemH + gap)));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = req.body;
    const result = await handleUploadPresigned({
      body,
      request: req,
      getSignedToken: async (pathname, clientPayload) => {
        if (!/^customer-uploads\/(?:unassigned|\d+)\/[a-z0-9-]{36}-[a-zA-Z0-9._-]+$/i.test(pathname)) {
          throw new Error('Invalid upload path.');
        }
        const templateId = pathname.split('/')[1];
        if (templateId !== 'unassigned') {
          const layout = await storedLayout();
          const template = layout.pages?.find(page => String(page.id) === templateId);
          if (!template) throw new Error('This upload page is no longer available. Ask the print admin for a current QR code.');
          const maxPhotos = Math.min(fitCapacity(template), Math.max(1, Number(template.maxPhotos) || fitCapacity(template)));
          const uploads = await templateUploads(templateId);
          let replacing = '';
          try { replacing = JSON.parse(clientPayload || '{}').replace || ''; } catch {}
          const canReplace = uploads.some(blob => blob.pathname === replacing);
          const currentCount = uploads.length - (canReplace ? 1 : 0);
          if (currentCount >= maxPhotos) {
            throw new Error(`This page has reached its photo limit of ${maxPhotos}. Please contact the print team.`);
          }
        }
        const allowedContentTypes = ['image/jpeg', 'image/png', 'image/webp'];
        const validUntil = Date.now() + 5 * 60 * 1000;
        const token = await issueSignedToken({
          pathname,
          operations: ['put'],
          allowedContentTypes,
          maximumSizeInBytes: 25 * 1024 * 1024,
          validUntil,
        });
        return {
          token,
          urlOptions: {
            allowedContentTypes,
            maximumSizeInBytes: 25 * 1024 * 1024,
            validUntil,
          },
        };
      },
    });
    return res.status(200).json(result);
  } catch (error) {
    const message = error.message || 'Upload could not be authorized.';
    const storageError = /token|blob|store|credential|permission|authoriz/i.test(message);
    return res.status(storageError ? 503 : 400).json({
      error: storageError
        ? 'Vercel Blob is not connected for this deployment. In Vercel, open Storage → Blob, connect the store to this project and environment, then redeploy.'
        : message,
    });
  }
}
