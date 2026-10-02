# Privara landing site

The marketing site for **www.useprivara.xyz**. The web app lives at
**app.useprivara.xyz**.

It's a static [Astro](https://astro.build/) site with no client framework. The few
small scripts it needs (nav, scroll reveal, click-to-play video, copy button) are
inlined. Fonts are self-hosted, and the YouTube demo loads only when a visitor
presses play.

## Develop

Requires Node.js 22.12 or later (see `.nvmrc`).

```bash
npm install --prefix landing
npm run landing:dev      # http://localhost:4321
npm run landing:build    # type-check (astro check) + static build to landing/dist
```

## Structure

| Path | Purpose |
| --- | --- |
| `src/data/site.ts` | Every outbound URL, contract ID, and stated fact. Change links here |
| `src/pages/index.astro` | Page composition, in section order |
| `src/components/` | One component per section, each with its own scoped styles |
| `src/styles/global.css` | Brand tokens (shared with the app and launch film), type scale, buttons |
| `public/og.png` | 1200×630 social preview, rendered from `marketing/launch-video` (`Thumbnail` still) |
| `public/demo-poster.jpg` | Video poster: a frame from the launch film |
| `vercel.json` | Redirects for old app URLs, security headers, asset caching |

Content claims follow the repository README and `docs/privacy-model.md`. The privacy
guarantee is stated narrowly: the recipient's long-term wallet is never the settlement
destination. Amounts, timing, and later links stay public. Update `src/data/site.ts`
and the FAQ whenever those documents change.

## Domains

Live since October 2026:

| Domain | Vercel project | Serves |
| --- | --- | --- |
| `www.useprivara.xyz` (apex redirects here) | landing (Root Directory `landing`) | This site |
| `app.useprivara.xyz` | app | The React app, including `/guide` and `/developers` |

`vercel.json` permanently redirects the old app paths (`/guide`, `/developers`,
`/app/*`) from www to the app subdomain, so links shared before the move still work.

The relayer's `PRIVARA_ALLOWED_ORIGINS` must include `https://app.useprivara.xyz`. The
landing site never calls the relayer, so `www` does not need to be listed.

Web Analytics is enabled per Vercel project. The landing page ships the cookieless
script, but it only reports once Analytics is turned on for the landing project.

## Checks before shipping changes

- `npm run landing:build` passes with 0 errors and 0 warnings.
- The page works at 390px wide: no horizontal scroll, and every section readable.
- `prefers-reduced-motion` disables the route animation and the scroll reveals.
