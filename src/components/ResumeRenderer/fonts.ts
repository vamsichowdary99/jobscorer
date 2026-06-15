/**
 * Centralized font registration for @react-pdf/renderer.
 *
 * Why this exists: every template module used to call Font.register() with
 * its own copy of the same family ("Lora", "Roboto", "Merriweather", "Lato").
 * When multiple templates share a family name and each module re-registers
 * it at import time, the embedded font subset / ToUnicode CMap in the
 * generated PDF can come out corrupted. Symptom: the PDF renders perfectly
 * visually but text extraction returns garbled glyph indices instead of
 * Unicode characters. ATS systems extracting from those PDFs get junk and
 * match zero keywords.
 *
 * Fix: register each family exactly once here at module load. Templates
 * just `import './fonts'` for the side effect — no per-template Font.register.
 *
 * If a template needs a new font, add the family here, not in the template.
 */
import { Font } from '@react-pdf/renderer'

const _ORIGIN = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
// Cache-bust token. The /api/fonts route serves with `Cache-Control: immutable,
// max-age=1y`, so a browser that already fetched a font keeps the OLD bytes
// forever even after the .ttf on disk is replaced. BUMP THIS whenever any TTF
// in public/fonts changes — it forces a fresh fetch under a new URL.
// v2 (2026-06-04): replaced broken OpenSans-Italic.ttf + Roboto-Italic.ttf
// (woff2-conversion subsets, 0/52 Latin letters → italic fell back to Helvetica)
// with complete static TTFs.
const FONT_VERSION = '2'
const _FONT = (name: string) => `${_ORIGIN}/api/fonts/${name}?v=${FONT_VERSION}`

Font.register({
    family: 'Roboto',
    fonts: [
        { src: _FONT('Roboto-Regular.ttf'), fontWeight: 'normal' },
        { src: _FONT('Roboto-Bold.ttf'), fontWeight: 'bold' },
        // True italic face (added for the Cobalt template's company·location line).
        // Previously this slot pointed at Roboto-Regular.ttf, so fontStyle:'italic'
        // rendered upright; now Roboto-using templates get genuine italics.
        { src: _FONT('Roboto-Italic.ttf'), fontWeight: 'normal', fontStyle: 'italic' },
        { src: _FONT('Roboto-Bold.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
    ],
})

Font.register({
    family: 'Lora',
    fonts: [
        { src: _FONT('Lora-Regular.ttf'), fontWeight: 'normal' },
        { src: _FONT('Lora-Bold.ttf'), fontWeight: 'bold' },
        { src: _FONT('Lora-Regular.ttf'), fontWeight: 'normal', fontStyle: 'italic' },
        { src: _FONT('Lora-Bold.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
    ],
})

Font.register({
    family: 'Lato',
    fonts: [
        { src: _FONT('Lato-Regular.ttf'), fontWeight: 'normal' },
        { src: _FONT('Lato-Bold.ttf'), fontWeight: 'bold' },
        { src: _FONT('Lato-Regular.ttf'), fontWeight: 'normal', fontStyle: 'italic' },
        { src: _FONT('Lato-Bold.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
    ],
})

// Open Sans — used by the Onyx template (minimalist). Includes true italic
// (OpenSans-Italic.ttf) for the company·location line.
Font.register({
    family: 'Open Sans',
    fonts: [
        { src: _FONT('OpenSans-Regular.ttf'), fontWeight: 'normal' },
        { src: _FONT('OpenSans-Bold.ttf'), fontWeight: 'bold' },
        // OpenSans-Italic.ttf was a deficient subset (Latin letter outlines
        // missing → italic fell back to Helvetica-Oblique); replaced with a full
        // static instance. Cache-bust is handled centrally via FONT_VERSION.
        { src: _FONT('OpenSans-Italic.ttf'), fontWeight: 'normal', fontStyle: 'italic' },
        { src: _FONT('OpenSans-Bold.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
    ],
})

// Merriweather is no longer used by any active template (Harvard, London,
// Stitch were migrated to Lora) but keep the registration in case future
// templates want it.
Font.register({
    family: 'Merriweather',
    fonts: [
        { src: _FONT('Merriweather-Regular.ttf'), fontWeight: 'normal' },
        { src: _FONT('Merriweather-Bold.ttf'), fontWeight: 'bold' },
        { src: _FONT('Merriweather-Regular.ttf'), fontWeight: 'normal', fontStyle: 'italic' },
        { src: _FONT('Merriweather-Bold.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
    ],
})

Font.registerHyphenationCallback((word) => [word])
