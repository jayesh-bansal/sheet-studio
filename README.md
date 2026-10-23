# Sheet Studio

Print layout studio with a public, upload-only page and a private admin workspace. Images are stored in a **private Vercel Blob store**. The admin layout is saved to the same private store, so both uploads and print sheets are shared across devices.

## Deploy from Git to Vercel

1. Commit this project folder to a Git repository and import that repository in Vercel. If the project lives in a subfolder, set Vercel's **Root Directory** to the folder containing this `package.json`.
2. In the Vercel project, create a **private** Blob store and connect it to the project for Production, Preview, and Development. Connect the store to the deployment environment. The upload route issues short-lived, path-scoped upload URLs using Vercel Blob credentials, so no Blob secret is exposed in browser code.
3. In **Project Settings → Environment Variables**, add:
   - `ADMIN_USERNAME` — for example, `admin`
   - `ADMIN_PASSWORD` — a long, unique password of your choice
   - `SESSION_SECRET` — a random value with at least 32 characters. It signs the admin session cookie. Generate one with `openssl rand -base64 48`.
4. Deploy from the Git integration. Vercel builds the Vite page and deploys the `/api` functions alongside it.

Open the deployed site with `?admin=1` to sign in (for example, `https://your-site.vercel.app/?admin=1`). The public home page stays upload-only and does not show an admin login link. The username and password are checked by a server function and are never shipped in the page JavaScript. Add the three values above as Vercel Project Environment Variables, choose the environments you deploy to, and redeploy after changing them. Do not add real secrets to Git or commit a `.env` file.

## Verify Vercel Blob

After deployment, open `/api/blob-status` on the deployed site. A ready upload route returns `{"connected":true,"uploadsReady":true}`. This check signs a short-lived upload token but does not create a file. If it returns `connected:false`, connect the Blob store to the same Vercel project and environment, then redeploy. A 404 means the latest API route has not been deployed yet.

## Local development

```sh
npm install
npm run dev
```

The Vercel Blob API routes require Vercel's serverless runtime and a Blob store connected to the same Vercel project and deployment environment. If uploads report that Blob is not connected, check Vercel → Storage → Blob, connect the store to Production (and Preview if used), then redeploy. Use a Vercel Preview deployment to exercise uploads and admin access.

## Storage behavior

- Public visitors can upload JPG, PNG, or WEBP files up to 25 MB each.
- Uploaded images stay private; only an authenticated admin can list, view, replace, or delete them.
- Each QR upload page is a named print template with its own photo size, sheet size, per-sheet photo limit, horizontal and vertical margins, horizontal and vertical photo gaps, and auto-arrange order (across rows or down columns). Admin sheet dimensions and layouts are stored in private Blob storage and restored after signing in from another device.
- Each print template has a QR upload link. Images uploaded from that QR are resized to the configured photo dimensions at 300 DPI, saved in that template's private folder, and tagged for the matching print page. When the admin workspace is open, new QR uploads are synced and placed into the matching sheet automatically. The selected per-sheet photo limit cannot exceed the number of slots that fit using the page's configured margins and gaps. QR links accept a queue of up to 500 uploads so overflow can continue onto later sheets.
- The admin can drag, resize, and position images manually, or use Auto arrange with the current page's order and axis-specific margins and gaps. New sheet adds a blank page using the current settings and keeps all existing pages and their layouts. After a QR upload batch completes, the admin is prompted to print; once the print dialog closes, a follow-up page is created and remaining queued images are placed on it.
- The QR upload flow stores the resized 300 DPI JPEG, not the original. Resizing can reduce storage for large images; small source images may grow when upscaled.
- Sheet sizes and placement settings are saved in a private `admin/layout.json` Blob. QR links resolve their current dimensions from this saved layout.
- Uploaders see per-image transfer progress and a completion status. Each template QR opens the same upload page with its own saved print settings.
