# Sheet Studio

Sheet Studio provides a public photo upload page and a password-protected print workspace. Customers upload original images through a QR link. Admins manage photos, place and resize them on configurable sheets, and export original files or a print sheet. Image files and the admin workspace are shared across devices through Cloudflare R2 and Supabase.

## Deploy from Git to Vercel

1. Import this repository into Vercel and set its Root Directory to this project folder.
2. Run the SQL in `supabase/migrations/202610290001_photo_catalog.sql` in the Supabase SQL editor.
3. Connect a private Cloudflare R2 bucket and create an R2 token limited to that bucket with object read/write access.
4. Add these Vercel environment variables in each environment you deploy:
   - `STORAGE_PROVIDER=r2`
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET` (generate with `openssl rand -base64 48`)
5. Configure R2 CORS to allow your deployed site origin, `PUT`, and the `Content-Type` request header. Add localhost only if local browser uploads are needed.
6. Deploy from Git. The project pins Node 22 for consistent Vercel builds.

Open `https://your-site.vercel.app/?admin=1` to access the admin workspace. The normal homepage remains upload-only. Never put service-role keys, R2 secrets, or admin credentials in Git or client code.

## Storage and workload notes

- Customer uploads preserve the original file bytes. Image resizing and placement affect the print layout/export only; originals remain available for export.
- Supported customer image types are JPEG, PNG, and WebP. Vercel Blob upload signing is capped at 25 MB per file. R2 uploads use short-lived, single-object presigned PUT URLs with the content type signed into the URL. R2 itself accepts much larger objects; the browser currently does not provide a hard server-enforced 25 MB limit for direct R2 uploads. Apply an upload gateway or Cloudflare rate/size controls before using this as an unrestricted public upload endpoint.
- QR templates accept up to 500 catalogued photos per page/job. The public upload route does not require an account; anyone with a QR link can upload until that limit is reached. The database catalog and atomic photo numbering are shared between admins.
- Admin image metadata and completed upload batches are loaded as one workspace request. At the current 500-photo per-template limit, the expected catalog is around 1,500 template photos plus unassigned photos. If this grows substantially, add cursor pagination and virtualized thumbnails before raising limits.
- Bulk export fetches up to five originals at a time and refuses archives over 500 MB or the classic ZIP format's entry/size limits. Use selective export for larger libraries.
- Layout saves are serialized and coalesced so a slower older save cannot overwrite newer edits. A layout payload over 3.8 MB or a page with over 500 placements is rejected with an error.
- R2 stores image objects. Supabase stores image metadata, batches, photo-number sequences, and the print layout. Admin access is required to list, fetch, replace, or delete photos.

## Local checks

```sh
npm ci
npm run build
npm audit
```

The Vercel API routes require Vercel's serverless runtime and configured R2/Supabase values for end-to-end storage checks. Use a Vercel Preview deployment to verify admin sign-in, customer uploads, payment proof linking, admin sync, delete, and export before production traffic.
