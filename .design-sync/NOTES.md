# Design Sync Notes — jobscorer

## Repo shape
- Next.js 16 app (not a standalone component library). Synth-entry mode — no dist/.
- Components in src/components/. srcDir=src/components narrows discovery.
- Tailwind 4 is used BUT components style primarily via inline styles + CSS variables.
- Custom utility classes (.card, .btn, .btn-primary, .input, etc.) live in src/app/globals.css.

## CSS
- cssEntry points at .design-sync/design-tokens.css — a curated extract of globals.css
  without the `@import "tailwindcss"` line (which requires a PostCSS pipeline to compile).
- Google Fonts (Plus Jakarta Sans, DM Mono) served at runtime; listed in runtimeFontPrefixes.
- The `@import "tailwindcss"` line in globals.css is NOT included — Tailwind utility classes
  (if used directly) won't be available in previews. Most components use CSS vars instead.

## Excluded components
- All ResumeRenderer/* — use @react-pdf/renderer which renders PDFs, not DOM elements.
- AuthProvider — wraps Supabase server-side auth context.

## Path aliases
- tsconfig.json has @/* → ./src/* — the converter reads this via --tsconfig flag.
- Components import @/lib/types (TS interfaces, no runtime code) and @/lib/* utilities.
  These will be bundled; if they pull in server-side deps (supabase, etc.), stub them.

## Known risks for re-sync
- next/link and next/image imports bundled from node_modules — may need provider stubs
  if Next.js navigation APIs fail outside Next.js runtime context.
- Any component that calls a Supabase hook at module-load time may fail to render.
- ChatPanel (chat/ChatPanel.tsx) has heavy runtime deps — may need skip or provider config.
- landing/tokens.ts exports design token constants (C, SANS, MONO) used by landing components.
  Not a component itself — if it shows up as a false positive, add "Tokens" to componentSrcMap: null.
