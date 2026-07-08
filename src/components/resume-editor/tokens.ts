// resuscore/src/components/resume-editor/tokens.ts
//
// Re-export of the app's Meridian tokens plus the handful of colors that
// have no `M` equivalent (green-tint suggestion backgrounds, skeleton grays,
// the dark toast). Never hardcode a hex value in this feature outside this
// file — resolve through `M` or `A` below.
//
// Imported from the shared leaf module (not from dashboard/resumes/page.tsx)
// deliberately: that page also imports from this directory, and re-exporting
// M from the page created a circular import that broke Turbopack dev builds
// ("Cannot access 'M' before initialization"). Keep this import pointed at
// '@/lib/meridianTokens', not the page.
export { M } from '@/lib/meridianTokens'

export const A = {
    greenBg: '#f0faf4',       // applied-strip / "nothing left to fix" background
    greenGhostBg: '#f0fdf8',  // ghost-suggestion background in the live preview
    greenAfterBg: '#f8fffe',  // AFTER block background inside the diff card
    amberWash: '#fef9c3',     // amber keyword-highlight wash in the live preview
    beforeBg: '#fafafa',      // BEFORE block background inside the diff card
    beforeBorder: '#e2e8f0',  // BEFORE block left border (deliberately neutral, not `M.border`)
    skeletonBase: '#f1f5f9',
    skeletonHighlight: '#e2e8f0',
    darkToast: '#1e293b',
    toastLink: '#60a5fa',
} as const
