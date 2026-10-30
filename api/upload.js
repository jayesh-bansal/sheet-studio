import { randomUUID } from 'node:crypto';
import { get, issueSignedToken, list } from '@vercel/blob';
import { handleUploadPresigned } from '@vercel/blob/client';
import { db, reservePhotoNumber, r2Ready, r2Requested, signedR2Url } from '../lib/r2.js';

async function storedLayout() {
  if (r2Ready()) {
    const rows = await db('app_state?select=value&key=eq.print_layout&limit=1');
    if (rows[0]?.value) return rows[0].value;
    let stored;
    try { stored = await get('admin/layout.json', { access: 'private' }); } catch { return {}; }
    if (!stored || stored.statusCode !== 200) return {};
    const chunks = [];
    for await (const chunk of stored.stream) chunks.push(chunk);
    const state = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    await db('app_state?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ key: 'print_layout', value: state }) });
    return state;
  }
  const stored = await get('admin/layout.json', { access: 'private' });
  if (!stored || stored.statusCode !== 200) return {};
  const chunks = [];
  for await (const chunk of stored.stream) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function templateUploads(id, jobId) {
  const prefixes = [`customer-uploads/${id}/${jobId}/`];
  if (jobId === 'job-default') prefixes.push(`customer-uploads/${id}/`);
  const blobs = [];
  for (const prefix of prefixes) {
    let cursor;
    do {
      const result = await list({ access: 'private', prefix, limit: 1000, cursor });
      blobs.push(...result.blobs);
      cursor = result.hasMore ? result.cursor : undefined;
    } while (cursor);
  }
  return [...new Map(blobs.map(blob => [blob.pathname, blob])).values()];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = req.body;
    if (r2Requested() && !r2Ready()) return res.status(503).json({ error: 'R2 is selected but the R2 or Supabase environment variables are incomplete.' });
    if (r2Ready()) {
      const { kind = 'photo', templateId: requestedTemplate, jobId = 'job-default', originalName = 'photo.jpg', contentType = 'image/jpeg' } = body || {};
      const templateId = requestedTemplate == null ? 'unassigned' : String(requestedTemplate);
      if (!(templateId === 'unassigned' || /^\d+$/.test(templateId)) || !/^job-[a-z0-9-]{6,64}$/i.test(jobId)) return res.status(400).json({ error: 'Invalid upload page or print job.' });
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) return res.status(400).json({ error: 'Only JPEG, PNG, and WebP images are supported.' });
      if (kind !== 'photo' && kind !== 'payment') return res.status(400).json({ error: 'Invalid upload type.' });
      if (kind === 'payment') {
        if (templateId !== 'unassigned') {
          const layout = await storedLayout();
          const template = layout.pages?.find(page => String(page.id) === templateId);
          const job = (layout.jobs || [{ id: 'job-default', status: 'active' }]).find(item => item.id === jobId);
          if (!template || !job || job.status === 'archived' || job.status === 'complete') return res.status(400).json({ error: 'This upload page or print job is no longer available.' });
        }
        const ext = (String(originalName).match(/\.(jpg|jpeg|png|webp)$/i) || ['.jpg'])[0].toLowerCase();
        const pathname = `payment-proofs/${templateId}/${jobId}/${randomUUID()}${ext}`;
        return res.status(200).json({ provider: 'r2', pathname, templateId, jobId, uploadUrl: signedR2Url('PUT', pathname, 300), contentType });
      }
      if (templateId !== 'unassigned') {
        const layout = await storedLayout();
        const template = layout.pages?.find(page => String(page.id) === templateId);
        const job = (layout.jobs || [{ id: 'job-default', status: 'active' }]).find(item => item.id === jobId);
        if (!template || !job || job.status === 'archived' || job.status === 'complete') return res.status(400).json({ error: 'This upload page or print job is no longer available.' });
      }
      const current = await db(`photo_assets?select=pathname&template_id=eq.${encodeURIComponent(templateId)}&job_id=eq.${encodeURIComponent(jobId)}&limit=501`);
      if (current.length >= 500) return res.status(400).json({ error: 'This upload link has reached its 500-photo queue limit.' });
      const number = await reservePhotoNumber(templateId, jobId);
      const ext = (String(originalName).match(/\.[a-zA-Z0-9]+$/) || ['.jpg'])[0].toLowerCase();
      const name = `${String(number).padStart(3, '0')}${ext}`;
      const pathname = `customer-uploads/${templateId === 'unassigned' ? 'unassigned' : `${templateId}/${jobId}`}/${randomUUID()}-${name}`;
      return res.status(200).json({ provider: 'r2', pathname, name, templateId, jobId, uploadUrl: signedR2Url('PUT', pathname, 300), contentType });
    }
    const result = await handleUploadPresigned({
      body,
      request: req,
      getSignedToken: async (pathname, clientPayload) => {
        const isPayment = /^payment-proofs\/(?:unassigned|\d+)\/job-[a-z0-9-]{6,64}\/[a-z0-9-]{36}\.(?:jpg|jpeg|png|webp)$/i.test(pathname);
        const isPhoto = /^customer-uploads\/(?:unassigned\/[a-z0-9-]{36}-[a-zA-Z0-9._-]+|\d+\/(?:job-[a-z0-9-]{6,64}\/)?[a-z0-9-]{36}-[a-zA-Z0-9._-]+)$/i.test(pathname);
        if (!isPhoto && !isPayment) throw new Error('Invalid upload path.');
        const parts = pathname.split('/');
        const templateId = parts[1];
        if (templateId !== 'unassigned') {
          const jobId = isPayment ? parts[2] : (parts.length >= 4 ? parts[2] : 'job-default');
          const layout = await storedLayout();
          const template = layout.pages?.find(page => String(page.id) === templateId);
          const job = (layout.jobs || [{ id: 'job-default', status: 'active' }]).find(item => item.id === jobId);
          if (!template || !job || job.status === 'archived' || job.status === 'complete') throw new Error('This upload page or print job is no longer available. Ask the print admin for a current upload link.');
          const uploadLimit = 500;
          const uploads = await templateUploads(templateId, jobId);
          const currentJobUploads = uploads.filter(blob => { const pathParts = blob.pathname.split('/'); return pathParts.length >= 4 ? pathParts[2] === jobId : jobId === 'job-default'; });
          let replacing = '';
          try { replacing = JSON.parse(clientPayload || '{}').replace || ''; } catch {}
          const canReplace = currentJobUploads.some(blob => blob.pathname === replacing);
          const currentCount = currentJobUploads.length - (canReplace ? 1 : 0);
          if (currentCount >= uploadLimit) throw new Error(`This upload link has reached its ${uploadLimit}-photo queue limit. Please contact the print team.`);
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
