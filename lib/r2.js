import { createHash, createHmac } from 'node:crypto';

const enc = value => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const sha = value => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();

export function r2Ready() {
  return process.env.STORAGE_PROVIDER === 'r2' && ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].every(k => process.env[k]);
}
export function r2Requested() { return process.env.STORAGE_PROVIDER === 'r2'; }

export async function db(path, options = {}) {
  // Accept either the project URL or the Data API URL copied from Supabase.
  const base = process.env.SUPABASE_URL.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeaders = key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` };
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: key, ...authHeaders, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error(`Supabase catalog request failed (${response.status}): ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

export async function dbAll(path) {
  const results = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await db(path, { headers: { Range: `${offset}-${offset + 999}` } });
    results.push(...page);
    if (page.length < 1000) return results;
  }
}

export function signedR2Url(method, pathname, ttl = 300) {
  const region = 'auto', service = 's3', host = `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const key = `${process.env.R2_BUCKET}/${pathname}`;
  const uri = `/${key.split('/').map(enc).join('/')}`;
  const now = new Date(), stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, ''), day = stamp.slice(0, 8);
  const scope = `${day}/${region}/${service}/aws4_request`, credential = `${process.env.R2_ACCESS_KEY_ID}/${scope}`;
  const params = [['X-Amz-Algorithm','AWS4-HMAC-SHA256'],['X-Amz-Credential',credential],['X-Amz-Date',stamp],['X-Amz-Expires',String(ttl)],['X-Amz-SignedHeaders','host']].sort((a,b)=>a[0].localeCompare(b[0]));
  const query = params.map(([k,v])=>`${enc(k)}=${enc(v)}`).join('&');
  const canonical = `${method}\n${uri}\n${query}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const toSign = `AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${sha(canonical)}`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${process.env.R2_SECRET_ACCESS_KEY}`, day), region), service), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');
  return `https://${host}${uri}?${query}&X-Amz-Signature=${signature}`;
}

export async function reservePhotoNumber(templateId, jobId) {
  const result = await db('rpc/reserve_photo_number', { method: 'POST', body: JSON.stringify({ p_template_id: String(templateId), p_job_id: jobId }) });
  return Number(result?.photo_number ?? result);
}
