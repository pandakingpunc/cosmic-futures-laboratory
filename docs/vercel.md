# Vercel deployment

The Vercel adapter was added to `main` after the Zenodo 0.1.0 archive. Existing release tags and the DOI archive are preserved. Deploy the current `main` branch for Vercel support.

## New project

1. In Vercel, select **Add New → Project** and import `pandakingpunc/cosmic-futures-laboratory`.
2. Use the repository root as **Root Directory**; do not select `app`, `dist` or `public`.
3. Use **Node.js 24.x**. No application secrets or environment variables are needed.
4. The repository's `vercel.json` configures the build. If entering settings manually, use the values below.
5. Deploy the current `main` branch. Once ready, open the deployment URL and run a simulation.

| Setting | Value |
| --- | --- |
| Framework Preset | Other |
| Install Command | `npm ci` |
| Build Command | `npm run build:vercel` |
| Output Directory | Automatic; leave the dashboard override disabled |
| Node.js Version | 24.x |

## Existing deployment returning `404: NOT_FOUND`

Open **Project → Settings → Build and Deployment** and check the root directory and settings above. Remove stale `dist`, `public`, `.next` or `.output` output-directory overrides. The committed `outputDirectory: null` requests automatic detection.

Deploy the latest `main` commit. When redeploying an existing deployment, first check that it belongs to the commit containing `vite.vercel.config.ts`; redeploying an older commit rebuilds the old Cloudflare output. Disable **Use existing Build Cache** for the first retry if it is offered.

The build log should show `npm run build:vercel`, Nitro's `vercel` preset, and generated `.vercel/output` assets and functions. The final routing manifest must include a filesystem handler and a fallback to `/__server`. The root page is server-rendered, so an `index.html` file is not required.

## Local verification and CI

```sh
npm ci
npm run build:vercel
npm run validate:vercel
```

The validation script imports the actual packaged Vercel function. It checks the routing manifest, rendered homepage, referenced client assets, favicon, both APIs, all analysis modes, malformed JSON and oversized requests. This verifies the generated package locally; a Vercel account's deployment settings, domains and remote execution still require checking the deployed URL. GitHub CI runs this build and validation on Linux alongside the existing scientific checks and Cloudflare build.

`vite.vercel.config.ts` uses the pinned Nitro adapter with Node.js 24 and a 60-second function budget. CSS packages remain bundled in the RSC/SSR build so the server build resolves their stylesheet imports. `vite.config.ts`, `npm run dev`, `npm run build`, `npm start`, and `.openai/hosting.json` retain the existing Cloudflare/Sites path.

The generated `.vercel/output` directory contains the [Vercel Build Output API](https://vercel.com/docs/build-output-api) manifest, static assets and server function. It is not committed. This follows the official [Vinext Nitro deployment path](https://github.com/cloudflare/vinext#other-platforms-via-nitro) and [Nitro Vercel preset](https://nitro.build/deploy/providers/vercel).
