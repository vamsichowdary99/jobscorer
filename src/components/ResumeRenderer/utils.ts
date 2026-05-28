/**
 * Ligature-defeat helper for ATS-safe PDF output.
 *
 * Why this exists: fonts like Lato, Lora, Roboto, and Merriweather embed
 * OpenType "liga" features that auto-form fi / fl / ff / ffi / ffl ligatures.
 * @react-pdf/renderer respects those features and writes the ligature glyph
 * to the PDF text stream. Most ATS parsers (Workday, Greenhouse, Lever,
 * iCIMS, Taleo) then decompose that glyph to just "f", silently dropping
 * the "i" or "l" — so "workflows" parses as "workfows", "Proficient" as
 * "Profcient", "firewalls" as "frewalls", and so on. Keywords vanish from
 * the JD match scan.
 *
 * Fix: insert a zero-width-non-joiner (U+200C) between the letters that
 * would otherwise form a ligature. ZWNJ suppresses OpenType shaping at
 * that boundary, so the renderer emits two separate glyphs. ATS parsers
 * strip ZWNJ during tokenization, so "workflows" parses correctly.
 *
 * Visually: humans see no change (ZWNJ has zero width, just no ligature).
 */
const ZWNJ = '‌'

export const defeatLigatures = (s: string | null | undefined): string => {
    if (!s) return ''
    // Order matters: handle 3-char clusters before 2-char so ffi/ffl don't
    // get processed twice.
    return s
        .replace(/(ffi|ffl)/g, (m) => m[0] + ZWNJ + m[1] + ZWNJ + m[2])
        .replace(/(fi|fl|ff)/g, (m) => m[0] + ZWNJ + m[1])
        .replace(/(Fi|Fl|Ff)/g, (m) => m[0] + ZWNJ + m[1])
}
