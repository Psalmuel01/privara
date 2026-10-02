# Privara landing site

The marketing site for **www.useprivara.xyz**. The web app moves to
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

## Cutover: landing on www, app on app.useprivara.xyz

Do these steps in order. The app keeps working throughout.

1. **Allow the new app origin on the relayer.** In Railway, append the new origin to
   `PRIVARA_ALLOWED_ORIGINS` (comma-separated). Keep the old one until cutover is complete.

   ```text
   PRIVARA_ALLOWED_ORIGINS=https://www.useprivara.xyz,https://app.useprivara.xyz
   ```

   Verify:

   ```bash
   curl -sI -H "Origin: https://app.useprivara.xyz" \
     https://privara-production.up.railway.app/v1/config | grep -i access-control-allow-origin
   ```

2. **Add `app.useprivara.xyz` to the existing app project** in Vercel (Settings →
   Domains). Add the DNS record Vercel shows (normally `CNAME app → cname.vercel-dns.com`).
   Wait until the app loads at https://app.useprivara.xyz and can connect a wallet.

3. **Create the landing project.** In Vercel, use **New Project**, pick this repository,
   set **Root Directory** to `landing`, and confirm Node.js 22. The framework (Astro) is
   auto-detected. Deploy it and review the preview URL.

4. **Move the main domain.** Remove `www.useprivara.xyz` (and the apex
   `useprivara.xyz`, if attached) from the app project, then add them to the landing
   project. `vercel.json` permanently redirects the old app paths `/guide`,
   `/developers`, and `/app/*` to the app subdomain, so existing links keep working.

5. **Optional: enable Web Analytics** on the landing project. The page already
   includes the cookieless Vercel Analytics script.

6. **Clean up.** After a few days, remove `https://www.useprivara.xyz` from
   `PRIVARA_ALLOWED_ORIGINS`. Then update the links that point to the app:
   - the root README: "Open the app" → app.useprivara.xyz, and the guide link →
     app.useprivara.xyz/guide
   - `app/.env*.example` and any docs that name www.useprivara.xyz as the app

## Checks before shipping changes

- `npm run landing:build` passes with 0 errors and 0 warnings.
- The page works at 390px wide: no horizontal scroll, and every section readable.
- `prefers-reduced-motion` disables the route animation and the scroll reveals.
