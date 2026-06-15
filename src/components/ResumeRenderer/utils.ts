/**
 * Text passthrough for PDF renderers (formerly a ligature-defeat helper).
 *
 * History: this used to insert a zero-width-non-joiner (U+200C) between
 * f-cluster letters (fi / fl / ff / ffi / ffl) on the theory that
 * @react-pdf/renderer would emit a single ligature glyph that ATS parsers
 * decompose to just "f", dropping the following letter ("workflows" →
 * "workfows").
 *
 * That theory was tested and DISPROVEN for @react-pdf/renderer 4.3.2.
 * Rendering the words "efficiency office affluent firewall proficient
 * workflows fluffy difficult financial flagship" in every body font the
 * templates use (Open Sans, Roboto, Lora, Lato, Merriweather, Montserrat,
 * Caladea, Raleway, Playfair Display, Roboto Slab, plus base-14 Times-Roman
 * and Helvetica) and extracting with PyMuPDF returns each word 100% intact —
 * no ligature glyphs (U+FB00–FB06), no dropped letters.
 *
 * Worse, the ZWNJ "fix" was actively harmful: most embedded font subsets do
 * not include a U+200C glyph, so the renderer fell back to Helvetica for each
 * ZWNJ and the PDF text stream came out as "ef\x0cf\x0ciciency" — a form-feed
 * (U+000C) wedged into every f-word, which is far worse for ATS keyword
 * matching than the (non-existent) ligature problem it was meant to solve.
 *
 * So this is now an identity passthrough. The name and signature are kept so
 * the templates that call `dL(...)` don't need to change.
 */
export const defeatLigatures = (s: string | null | undefined): string => s ?? ''
