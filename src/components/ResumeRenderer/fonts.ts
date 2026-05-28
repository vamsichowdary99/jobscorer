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
const _FONT = (name: string) => `${_ORIGIN}/api/fonts/${name}`

Font.register({
    family: 'Roboto',
    fonts: [
        { src: _FONT('Roboto-Regular.ttf'), fontWeight: 'normal' },
        { src: _FONT('Roboto-Bold.ttf'), fontWeight: 'bold' },
        { src: _FONT('Roboto-Regular.ttf'), fontWeight: 'normal', fontStyle: 'italic' },
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
