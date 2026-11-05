<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Avi web notes

- This app is `@avi/web` in the Avi monorepo. The Android client lives in `../android` and the SwiftUI placeholder in `../ios`.
- Stack: Next.js App Router, React 19, TypeScript, Tailwind CSS v4, Supabase.
- The Avi API in `../../services/api` is the provider gateway. Do not ship provider or Supabase secret keys to the browser.
- Preserve the aviation cockpit design language: deep-space surfaces, radar cyan, aero blue,
  instrument borders, monospace flight codes, and the universal flight-status palette.
- All flight/route/terminal catalogs live in `src/data/`. Types are in `src/lib/types.ts`.
- App state, local caching, alert scheduling, and theme persistence live in `src/lib/store.tsx`.
- API routes are server-side only; never expose AeroDataBox or other private keys to the client.
- Validate changes with `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
