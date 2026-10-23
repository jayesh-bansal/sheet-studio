# Sheet Studio

Print layout studio with a public, upload-only page and a private admin workspace. Images are stored in a **private Vercel Blob store**. The admin layout is saved to the same private store, so both uploads and print sheets are shared across devices.

## Deploy from Git to Vercel

1. Commit this project folder to a Git repository and import that repository in Vercel. If the project lives in a subfolder, set Vercel's **Root Directory** to the folder containing this `package.json`.
2. In the Vercel project, create a **private** Blob store and connect it to the project for Production, Preview, and Development. The connection must provide `BLOB_READ_WRITE_TOKEN` so the upload route can authorize browser uploads.
3. In **Project Settings → Environment Variables**, add:
   - `ADMIN_USERNAME` — for example, `admin`
   - `ADMIN_PASSWORD` — a long, unique password of your choice
   - `SESSION_SECRET` — a random value with at least 32 characters. Generate one with `openssl rand -base64 48`.
4. Deploy from the Git integration. Vercel builds the Vite page and deploys the `/api` functions alongside it.

The username and password are checked by a server function and are never shipped in the page's JavaScript. Do not add real secrets to Git or commit a `.env` file.

## Local development

```sh
npm install
npm run dev
```

The Vercel Blob API routes require Vercel's serverless runtime and a connected Blob store. Use a Vercel Preview deployment to exercise uploads and admin access.

## Storage behavior

- Public visitors can upload JPG, PNG, or WEBP files up to 25 MB each.
- Uploaded images stay private; only an authenticated admin can list, view, replace, or delete them.
- Each sheet can use its own paper size. Admin sheet dimensions and layouts are stored in private Blob storage and restored after signing in from another device.
- “New sheet” clears the current layout while keeping uploaded images in the library.
