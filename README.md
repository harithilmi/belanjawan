# Malaysia's disk is full

Static Vite + React app. No backend: data JSON is bundled, the plan lives in localStorage.

```sh
npm install
npm run dev      # local dev
npm run build    # tsc + vite build into dist/
npm run check
```

## Deploy (harithilmi.com/disk/)

Served by its own Cloudflare Worker (`malaysias-disk`, static assets only), next to the
`harithilmi-com` Worker that serves `/tuju/` (repo: `~/Documents/tuju-article/site`).

- `wrangler.jsonc` adds zone routes `harithilmi.com/disk` and `harithilmi.com/disk/*`.
  Routes run before the `harithilmi-com` Custom Domain, so tuju is untouched.
- `npm run deploy` builds into `.deploy/disk/` (so file paths match the URL path) and runs `wrangler deploy`.
- Needs `npx wrangler login` with access to the `harithilmi.com` zone.
- Check without uploading: `npx vite build --outDir .deploy/disk --emptyOutDir && npx wrangler deploy --dry-run`

Change the path: replace `disk` in `wrangler.jsonc` (both routes) and in the `deploy` script.
`base: './'` and `src/share.ts` need no change.

Undo: `npx wrangler delete malaysias-disk` removes the Worker and its routes.
