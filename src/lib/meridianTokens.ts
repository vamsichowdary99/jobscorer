// Meridian design tokens — the single source of truth, imported by both
// `dashboard/resumes/page.tsx` and `components/resume-editor/tokens.ts`.
//
// This lives in its own leaf module (no imports) so neither of those two
// files ever imports the other. `page.tsx` used to `export const M` directly
// and `resume-editor/tokens.ts` re-exported it from there — that created a
// real circular import (page.tsx -> resume-editor/* -> tokens.ts -> page.tsx)
// which Turbopack's dev-mode module evaluation order breaks on ("Cannot
// access 'M' before initialization"), even though webpack's production
// build tolerated it. Do not reintroduce that cycle.
export const M = {
    accent: '#1d6af5',
    accentMid: '#4b8df8',
    accentLight: 'rgba(29,106,245,0.10)',
    accentBorder: 'rgba(29,106,245,0.28)',
    accentTint: 'rgba(29,106,245,0.05)',
    white: '#ffffff',
    surface: '#f5f9ff',
    surfaceAlt: '#edf4ff',
    border: '#cfe2ff',
    borderLight: '#e8f1ff',
    text: '#0f1e40',
    textMid: '#1e3a6e',
    textMuted: '#4a6fa5',
    textFaint: '#8dafd8',
    green: '#16a34a',
    greenLight: '#dcfce7',
    greenBorder: '#a7f3d0',
    amber: '#d97706',
    amberLight: '#fef3c7',
    amberBorder: '#fde68a',
    red: '#dc2626',
    fontHeading: "'Lora', Georgia, serif",
    fontBody: "'DM Sans', 'Inter', sans-serif",
    fontMono: "'JetBrains Mono', monospace",
}
