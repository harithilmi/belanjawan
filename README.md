# Malaysia's disk is full

Live: https://harithilmi.com/belanjawan/

Static Vite + React app. No backend: data JSON is bundled, the plan lives in localStorage.

```sh
npm install
npm run dev      # local dev
npm run build    # tsc + vite build into dist/
npm run check
```

## Deploy (harithilmi.com/belanjawan/)

Served by its own Cloudflare Worker (`belanjawan`, static assets only), next to the
`harithilmi-com` Worker that serves `/tuju/` (repo: `~/Documents/tuju-article/site`).

- `wrangler.jsonc` adds zone routes `harithilmi.com/belanjawan` and `harithilmi.com/belanjawan/*`.
  Routes run before the `harithilmi-com` Custom Domain, so tuju is untouched.
- `npm run deploy` builds into `.deploy/belanjawan/` (so file paths match the URL path) and runs `wrangler deploy`.
- Needs `npx wrangler login` with access to the `harithilmi.com` zone.
- Check without uploading: `npx vite build --outDir .deploy/belanjawan --emptyOutDir && npx wrangler deploy --dry-run`

Change the path: replace `belanjawan` in `wrangler.jsonc` (both routes) and in the `deploy` script.
`base: './'` and `src/share.ts` need no change.

Undo: `npx wrangler delete belanjawan` removes the Worker and its routes.
