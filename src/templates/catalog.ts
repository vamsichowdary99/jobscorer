/**
 * Resume Template Catalog
 *
 * This file catalogs all available and future-planned resume templates.
 * Templates marked status:'active' are fully implemented with PDF renderers.
 * Templates marked status:'pending' need PDF renderer implementation.
 *
 * Source files for pending templates:
 *   - Original 7 + competitor designs: resuscore/.superpowers/brainstorm/2042-1774507943/
 *     - view-original-7.html      (Classic, Minimalist, Modern Navy, Executive, Sharp, Tech-Forward, Rezi)
 *     - view-competitor-10.html   (Rezi Standard, Zety Cascade, Novoresume Clean, Kickresume Gradient,
 *                                  Enhancv Timeline, Zety Concept, Resume.io London, Kickresume Smart,
 *                                  Rezi Modern, Resume.io Athens)
 *   - RenderCV themes: resuscore/rendercv/docs/assets/images/examples/
 *     - classic.png, harvard.png, moderncv.png, ember.png, engineeringclassic.png,
 *       engineeringresumes.png, ink.png, opal.png, sb2nov.png
 *   - RenderCV 9-template preview: view-rendercv-9.html
 */

export interface TemplateMeta {
  id: string
  name: string
  tagline: string
  category: 'serif' | 'sans-serif' | 'academic' | 'modern' | 'executive'
  atsScore: 'full' | 'visual-only'  // 'visual-only' = passes ATS text scan but has visual two-col layout
  source: 'original' | 'competitor' | 'rendercv'
  fonts: string[]
  accent: string | null
  status: 'active' | 'pending'
  rendererPath?: string  // relative path to PDF renderer component
  tags: string[]
  notes?: string
  // Resume Layout Manager (plans/25) — default order of the 8 movable
  // sections ('profile' is always a fixed header, never in this array),
  // matching each template's current hardcoded output exactly. Undefined
  // = template not yet wired into the layout manager.
  sectionOrder?: string[]
}

export const TEMPLATES: TemplateMeta[] = [
  // ── ACTIVE (fully implemented) ────────────────────────────────────────────

  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Timeless professional',
    category: 'serif',
    atsScore: 'full',
    source: 'original',
    fonts: ['Times New Roman', 'Roboto'],
    accent: null,
    status: 'active',
    rendererPath: '@/components/ResumeRenderer/ClassicPdfDocument',
    tags: ['serif', 'uppercase headers', 'bullet points', 'centered name'],
    notes: 'Kept over Rezi Standard 2026-07-19 — the two were near-identical twins (same left-aligned bold-caps-underline header layout, same bullet style), only differing by font (Roboto vs Lato). Classic kept as the plain sans-serif anchor.',
    sectionOrder: ['summary', 'education', 'experience', 'projects', 'skills', 'certifications', 'achievements', 'leadership'],
  },
  {
    id: 'rezi',
    name: 'Rezi',
    tagline: 'Serif elegance with generous spacing',
    category: 'serif',
    atsScore: 'full',
    source: 'original',
    fonts: ['Lora'],
    accent: null,
    status: 'active',
    rendererPath: '@/components/ResumeRenderer/ReziPdfDocument',
    tags: ['serif', 'lora', 'em-dash bullets', 'inline bold skills', 'generous spacing'],
    sectionOrder: ['summary', 'education', 'experience', 'projects', 'skills', 'certifications', 'achievements', 'leadership'],
  },
  {
    id: 'london',
    name: 'London',
    tagline: 'Centered serif with extending section lines',
    category: 'serif',
    atsScore: 'full',
    source: 'competitor',
    fonts: ['Lora'],
    accent: null,
    status: 'active',
    rendererPath: '@/components/ResumeRenderer/LondonPdfDocument',
    tags: ['serif', 'lora', 'extending section lines', 'italic', 'editorial'],
    notes: 'Resume.io London style. Lora extracts cleanly when not co-rendered with another Lora template.',
    sectionOrder: ['summary', 'education', 'experience', 'projects', 'skills', 'certifications', 'achievements', 'leadership'],
  },
  {
    id: 'harvard',
    name: 'Harvard',
    tagline: 'HBS-style academic with underlined section heads',
    category: 'academic',
    atsScore: 'full',
    source: 'rendercv',
    fonts: ['Times-Roman'],
    accent: null,
    status: 'active',
    rendererPath: '@/components/ResumeRenderer/HarvardPdfDocument',
    tags: ['serif', 'times-roman', 'underlined headers', 'centered name', 'academic', 'hbs', 'built-in font'],
    notes: 'Font is Times-Roman (PDF base-14 built-in) for guaranteed ATS extraction in strict parsers like Workday and Taleo. Kept as the sole plain-serif/academic option — Stitch and sb2nov were removed 2026-07-18 (same font, near-identical header treatment, no real differentiation; see audit).',
    sectionOrder: ['summary', 'education', 'experience', 'projects', 'leadership', 'skills', 'certifications', 'achievements'],
  },
  {
    id: 'open-resume',
    name: 'Open Resume',
    tagline: 'Modern sans with sky-blue accent bar',
    category: 'modern',
    atsScore: 'full',
    source: 'competitor',
    fonts: ['Roboto'],
    accent: '#38bdf8',
    status: 'active',
    rendererPath: '@/components/ResumeRenderer/OpenResumePdfDocument',
    tags: ['sans-serif', 'roboto', 'accent bar', 'modern', 'open-resume.io'],
    // 'summary' is NOT movable for this template — it renders fixed between
    // the name and contact line (part of the header treatment), not as its
    // own SectionHeading block like the other templates.
    sectionOrder: ['experience', 'education', 'projects', 'skills', 'leadership', 'certifications', 'achievements'],
  },
  {
    id: 'cobalt',
    name: 'Cobalt',
    tagline: 'Navy single-column with blue section headers',
    category: 'modern',
    atsScore: 'full',
    source: 'original',
    fonts: ['Roboto'],
    accent: '#06296b',
    status: 'active',
    rendererPath: '@/components/ResumeRenderer/CobaltPdfDocument',
    tags: ['sans-serif', 'roboto', 'navy', 'blue headers', 'single-column', 'left-aligned name', 'it-fresher'],
    notes: 'Recreates the aarav-sharma landing carousel design. Two inks only: blue #06296b accent + black. Uses true Roboto-Italic for the company·location line.',
    sectionOrder: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'achievements', 'leadership'],
  },
  {
    id: 'onyx',
    name: 'Onyx',
    tagline: 'Minimalist single-column with wide-tracked headers',
    category: 'modern',
    atsScore: 'full',
    source: 'original',
    fonts: ['Open Sans'],
    accent: '#224a85',
    status: 'active',
    rendererPath: '@/components/ResumeRenderer/OnyxPdfDocument',
    tags: ['sans-serif', 'open sans', 'minimalist', 'monochrome', 'letter-spaced headers', 'navy divider', 'single-column', 'it-fresher'],
    notes: 'Recreates the rohan-mehta landing carousel design. Monochrome black text + one thin navy #224a85 divider rule under the header; rule-less wide-letter-spaced section headers. Open Sans (incl. true OpenSans-Italic).',
    sectionOrder: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'achievements', 'leadership'],
  },
  {
    id: 'jade',
    name: 'Jade',
    tagline: 'Single-column teal with ruled section headers',
    category: 'modern',
    atsScore: 'full',
    source: 'original',
    fonts: ['Open Sans'],
    accent: '#026857',
    status: 'active',
    rendererPath: '@/components/ResumeRenderer/JadePdfDocument',
    tags: ['sans-serif', 'open sans', 'teal', 'single-column', 'ruled headers', 'it-fresher'],
    notes: 'Converted from two-column to single-column 2026-07-19 (was a recreation of the priya-nair landing carousel design). Two inks only, ink-core pixel-sampled: teal #026857 accent (name, headers, header rules) + black. Skills render as "Label: comma, separated, items" (same convention as Cobalt/Onyx/Lapis) — the original grouped one-bullet-per-item format was carried over from the two-column build at first but wasted a full line per skill once the sidebar’s ~178pt width constraint was gone; fixed same day. atsScore now full — no more column-order ambiguity for text extraction. Open Sans (incl. true OpenSans-Italic for the project tech line).',
    sectionOrder: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'achievements', 'leadership'],
  },
  {
    id: 'lapis',
    name: 'Lapis',
    tagline: 'Modern single-column indigo with skill pills',
    category: 'modern',
    atsScore: 'full',
    source: 'original',
    fonts: ['Open Sans'],
    accent: '#1a1670',
    status: 'active',
    rendererPath: '@/components/ResumeRenderer/LapisPdfDocument',
    tags: ['sans-serif', 'open sans', 'indigo', 'single-column', 'skill pills', 'vertical-bar headers', 'it-fresher'],
    notes: 'Recreates the ananya-reddy landing carousel design. Single-column, modern. Two inks (ink-core pixel-sampled): deep indigo #1a1670 accent (name, subtitle, section headers + vertical bars, italic company/tech line) + near-black #1f2024. Section headers = thin light divider rule + vertical indigo bar + indigo uppercase label. Skills render as a wrapping cloud of outlined pills, each a real extractable <Text> in order — atsScore full (single-column, standard headings, no tables; pills are a visual treatment over selectable text). Open Sans (incl. true OpenSans-Italic).',
    sectionOrder: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'achievements', 'leadership'],
  },

  {
    id: 'axis',
    name: 'Axis',
    tagline: 'Violet career timeline with node markers',
    category: 'modern',
    atsScore: 'full',
    source: 'original',
    fonts: ['Roboto'],
    accent: '#7c3aed',
    status: 'active',
    rendererPath: '@/components/ResumeRenderer/AxisPdfDocument',
    tags: ['sans-serif', 'roboto', 'violet', 'timeline', 'node markers', 'single-column', 'modern'],
    notes: 'Built 2026-07-19 — not adapted from a reference mockup, designed to fill a genuine structural gap: every active template (single-column since Jade\'s 2026-07-19 conversion) separates entries with flat rules/panels/pills. Axis is the only one with a vertical "career timeline" rail — a small violet node per dated entry (Experience/Education/Projects/Leadership/Certifications/Achievements), connected by a thin line segment spanning that entry\'s height. Preceded by research into whether two-column layouts are the only real ATS risk: they mostly aren\'t anymore on modern parsers (Greenhouse/Lever/Ashby use XY-Cut-style reading-order algorithms that reconstruct columns correctly) but legacy government/enterprise Taleo-style parsers still can fail on them — so the project default of single-column stays deliberate, not because two-column is universally broken. Axis sidesteps the debate entirely: the rail is pure decoration (borders + circles), not a layout mechanism, so it\'s a single linear column of real text with zero reading-order ambiguity for any parser. Accent violet #7c3aed is the one color not yet used elsewhere (navy/teal/indigo/sky-blue/gold/red are all taken). Font Roboto reused from Classic/Open Resume/Cobalt — no new font file needed.',
    sectionOrder: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'achievements', 'leadership'],
  },

  {
    id: 'jake',
    name: 'Jake',
    tagline: 'The classic CS/SWE resume — icon contact bar, coursework grid, boxed skills',
    category: 'academic',
    atsScore: 'full',
    source: 'competitor',
    fonts: ['Times-Roman'],
    accent: null,
    status: 'active',
    rendererPath: '@/components/ResumeRenderer/JakePdfDocument',
    tags: ['serif', 'times-roman', 'icon contacts', 'coursework grid', 'boxed skills', 'academic', 'built-in font', 'most popular'],
    notes: 'Built 2026-07-19, pixel-faithful recreation of a user-supplied screenshot of "Jake\'s Resume" (Jake Gutierrez\'s LaTeX template) — one of the most-forked resume templates on Overleaf among CS/SWE job seekers. Deliberate exception to the "don\'t clone an existing look" rule used for every other template pick in this catalog: the ask here was fidelity to a specific named reference, not a new design. Font is Times-Roman (PDF base-14 built-in, same as Harvard) — closest built-in match to the source\'s classic LaTeX Computer Modern serif, zero font-file risk. Contact icons (phone/email/github) are hand-drawn Feather-style stroke Svg/Path primitives, NOT Unicode glyphs — sidesteps the font-glyph-coverage bug class already fixed for Executive\'s diamond bullets. LinkedIn has no universal outline glyph so it\'s a small solid badge with real "in" text. Distinctive vs. every other active template: Relevant Coursework is its own full section (heading + rule) directly under Education, rendered as a 4-column bullet grid — not nested inside the degree entry and not a Label:value line like every other template\'s skills. Technical Skills has NO border box (corrected 2026-07-19 after comparing against a clearer reference image — an earlier pass wrongly added one). Project rows put "Name | tech" inline on one title line. Technical Skills intentionally omits soft/core-competency skills — the reference never shows them, only Languages/Developer Tools/Technologies-Frameworks.',
    sectionOrder: ['education', 'experience', 'projects', 'skills', 'certifications', 'achievements', 'leadership', 'summary'],
  },

  // ── PENDING — Original 7 (view-original-7.html) ───────────────────────────

  {
    id: 'minimalist',
    name: 'Minimalist',
    tagline: 'Ultra-clean single column',
    category: 'sans-serif',
    atsScore: 'full',
    source: 'original',
    fonts: ['Helvetica', 'Lato'],
    accent: null,
    status: 'pending',
    tags: ['sans-serif', 'minimal', 'clean', 'no color'],
  },
  {
    id: 'modern-navy',
    name: 'Modern Navy',
    tagline: 'Navy accent with geometric details',
    category: 'modern',
    atsScore: 'full',
    source: 'original',
    fonts: ['Montserrat', 'Open Sans'],
    accent: '#1e3a5f',
    status: 'pending',
    tags: ['navy', 'modern', 'geometric', 'montserrat'],
  },
  {
    id: 'executive',
    name: 'Executive',
    tagline: 'Garamond serif with diamond bullets',
    category: 'executive',
    atsScore: 'full',
    source: 'original',
    fonts: ['Caladea'],
    accent: null,
    status: 'active',
    rendererPath: '@/components/ResumeRenderer/ExecutivePdfDocument',
    tags: ['serif', 'caladea', 'diamond bullets', 'wide-tracked headers', 'left-aligned name', 'executive'],
    notes: 'Built 2026-07-19 from the "Executive" card in .superpowers/brainstorm/2042-1774507943/view-original-7.html. First pending template promoted to active — chosen to fill the one real audience gap in the catalog (senior/executive tone; every other active template reads fresher/generic). Caladea is the open-source metric-compatible substitute for Garamond/Cambria (true Garamond isn\'t freely licensed); no true italic face exists so fonts.ts reuses the Regular file for the italic slot (same fallback as Lora/Lato). Contact line is a row of independent flexbox spans (space-between) framed by a thick top rule + thin bottom rule, rather than one joined separator-delimited string — sidesteps the wrap-hyphen bug class entirely instead of needing the NBSP-flanking fix the other templates got.',
    sectionOrder: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'achievements', 'leadership'],
  },
  {
    id: 'amber',
    name: 'Amber',
    tagline: 'Editorial serif name with gold accent',
    category: 'modern',
    atsScore: 'full',
    source: 'original',
    fonts: ['Playfair Display', 'Open Sans'],
    accent: '#b8912f',
    status: 'active',
    rendererPath: '@/components/ResumeRenderer/AmberPdfDocument',
    tags: ['serif name', 'sans body', 'gold', 'centered header', 'editorial', 'it-fresher'],
    notes: 'Built 2026-07-19 from a karthik-iyer.png reference image (QA Automation Engineer resume, user-supplied). Only active template combining a serif display name (Playfair Display) with a sans body (Open Sans, already registered — no second sans added to the pipeline) — Executive is all-serif, every other active template is all-sans. Also the only warm/gold accent color; everything else is navy/teal/indigo/sky-blue or monochrome. Centered header: name, bold-caps subtitle, then a gold line–dot–line divider, then centered contact line. Section headers are bold sans caps with a full-width thin gold rule below. Skills render as "Label: comma, separated, items" (same convention as Cobalt/Onyx/Jade/Lapis).',
    sectionOrder: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'achievements', 'leadership'],
  },
  {
    id: 'sharp',
    name: 'Sharp',
    tagline: 'Bold black with extending section lines',
    category: 'modern',
    atsScore: 'full',
    source: 'original',
    fonts: ['Arial', 'Helvetica Neue'],
    accent: '#0a0a0a',
    status: 'pending',
    tags: ['bold', 'black', 'extending lines', 'outlined skills', 'strong'],
  },
  {
    id: 'tech-forward',
    name: 'Tech-Forward',
    tagline: 'Teal accent with left border header',
    category: 'modern',
    atsScore: 'full',
    source: 'original',
    fonts: ['Arial'],
    accent: '#0d9488',
    status: 'pending',
    tags: ['teal', 'left border', 'skill pills', 'tech', 'modern'],
  },

  // ── PENDING — Competitor Templates (view-competitor-10.html) ─────────────

  {
    id: 'zety-cascade',
    name: 'Zety Cascade',
    tagline: 'Navy sidebar with skill progress bars',
    category: 'modern',
    atsScore: 'visual-only',
    source: 'competitor',
    fonts: ['Open Sans'],
    accent: '#2c3e6b',
    status: 'pending',
    tags: ['two-column', 'sidebar', 'skill bars', 'navy', 'visual ATS'],
    notes: 'Two-column layout — passes text ATS but visual scan may differ',
  },
  {
    id: 'novoresume-clean',
    name: 'Novoresume Clean',
    tagline: 'Purple gradient top bar with chip skills',
    category: 'modern',
    atsScore: 'full',
    source: 'competitor',
    fonts: ['Open Sans'],
    accent: '#6c3fc5',
    status: 'pending',
    tags: ['purple', 'gradient header', 'chip skills', 'modern'],
  },
  {
    id: 'beacon',
    name: 'Beacon',
    tagline: 'Solid navy banner header with reversed text',
    category: 'modern',
    atsScore: 'full',
    source: 'competitor',
    fonts: ['Open Sans'],
    accent: '#0f3460',
    status: 'active',
    rendererPath: '@/components/ResumeRenderer/BeaconPdfDocument',
    tags: ['dark navy', 'banner header', 'reversed text', 'modern', 'dramatic header'],
    notes: 'Built 2026-07-19, promoted from the pending "Kickresume Gradient" entry. Research-driven pick (not adapted from a specific mockup): the full-bleed colored banner header with reversed white name/contact text is the single most common "modern professional" resume archetype across Zety, Canva, Enhancv\'s Modern category, and Kickresume\'s own top template — none of the other 13 active templates use reversed text on a solid color block (they all put dark text on white/light backgrounds even with strong accent colors). Dropped the source idea\'s "dot skills" proficiency rating — implies a quantified skill level with no real backing data, so skills stay plain extractable "Label: comma, list" text like every other template. Banner is a SOLID navy fill, not a true gradient — react-pdf gradient support is SVG-only and adds fragility for a purely decorative effect. Font: Open Sans (already registered, reused from Onyx/Jade/Lapis).',
    sectionOrder: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'achievements', 'leadership'],
  },
  {
    id: 'enhancv-timeline',
    name: 'Enhancv Timeline',
    tagline: 'Orange accent with sidebar skill bars',
    category: 'modern',
    atsScore: 'visual-only',
    source: 'competitor',
    fonts: ['Open Sans'],
    accent: '#e85d26',
    status: 'pending',
    tags: ['orange', 'sidebar', 'timeline', 'two-column', 'visual ATS'],
    notes: 'Two-column layout',
  },
  {
    id: 'zety-concept',
    name: 'Zety Concept',
    tagline: 'Dark header band with gray sidebar tags',
    category: 'executive',
    atsScore: 'visual-only',
    source: 'competitor',
    fonts: ['Arial'],
    accent: '#2c3e50',
    status: 'pending',
    tags: ['dark header', 'gray sidebar', 'tag skills', 'two-column', 'visual ATS'],
    notes: 'Two-column layout',
  },
  {
    id: 'kickresume-smart',
    name: 'Kickresume Smart',
    tagline: 'Card-per-section with indigo accent',
    category: 'modern',
    atsScore: 'full',
    source: 'competitor',
    fonts: ['Open Sans'],
    accent: '#4f46e5',
    status: 'pending',
    tags: ['indigo', 'card sections', 'pale background', 'chip skills'],
  },
  {
    id: 'rezi-modern',
    name: 'Rezi Modern',
    tagline: 'Blue accent with ATS score widget',
    category: 'modern',
    atsScore: 'full',
    source: 'competitor',
    fonts: ['Open Sans'],
    accent: '#2563eb',
    status: 'pending',
    tags: ['blue', 'modern', 'grid skills', 'ATS score badge'],
  },
  {
    id: 'athens',
    name: 'Athens',
    tagline: 'Red accent with gray header and outlined skills',
    category: 'modern',
    atsScore: 'full',
    source: 'competitor',
    fonts: ['Helvetica'],
    accent: '#c0392b',
    status: 'active',
    rendererPath: '@/components/ResumeRenderer/AthensPdfDocument',
    tags: ['red', 'gray header panel', 'outlined skills', 'triangle bullets', 'clean'],
    notes: 'Built 2026-07-19 from the "Resume.io Athens" card in .superpowers/brainstorm/2042-1774507943/view-competitor-10.html. Fills the last warm-accent-color gap (red — Amber\'s gold was the other). Font is Helvetica, the PDF base-14 built-in (same guaranteed-ATS-extraction approach as Harvard\'s Times-Roman) — the mockup specifies Arial, and Helvetica is its metric-compatible PDF-standard substitute, so no new font file/registration was needed. Only active template with a filled gray header panel + colored bottom border instead of a rule/divider. Bullet marker is a CSS border-triangle, not a "▸" glyph, sidestepping the same glyph-coverage bug class fixed for Executive\'s diamond bullets (Helvetica\'s base-14 WinAnsi encoding doesn\'t include that Unicode triangle). Source-mockup quirk carried over faithfully: the bold left column in Experience rows is the COMPANY name (not the job title, unlike every other active template), with title+location as the muted subtitle below. Skills render as a wrapping cloud of red-outlined pills (same mechanism as Lapis, recolored).',
    sectionOrder: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'achievements', 'leadership'],
  },

  // ── PENDING — RenderCV Themes (rendercv/docs/assets/images/examples/) ────

  {
    id: 'rc-classic',
    name: 'RC Classic',
    tagline: 'Blue section headers with dash bullets',
    category: 'modern',
    atsScore: 'full',
    source: 'rendercv',
    fonts: ['Calibri', 'Arial'],
    accent: '#004f9f',
    status: 'pending',
    tags: ['blue', 'uppercase headers', 'dash bullets', 'calibri'],
  },
{
    id: 'rc-moderncv',
    name: 'RC Moderncv',
    tagline: 'Left-column dates with blue accent',
    category: 'modern',
    atsScore: 'visual-only',
    source: 'rendercv',
    fonts: ['Arial'],
    accent: '#0066aa',
    status: 'pending',
    tags: ['blue', 'two-column', 'left dates', 'moderncv', 'visual ATS'],
  },
  {
    id: 'rc-ember',
    name: 'RC Ember',
    tagline: 'Crimson serif with diamond bullets',
    category: 'serif',
    atsScore: 'full',
    source: 'rendercv',
    fonts: ['Palatino Linotype', 'Georgia'],
    accent: '#c0392b',
    status: 'pending',
    tags: ['crimson', 'serif', 'diamond bullets', 'centered headers'],
  },
  {
    id: 'rc-engineering-classic',
    name: 'RC Engineering Classic',
    tagline: 'Navy with thick underline section headers',
    category: 'modern',
    atsScore: 'full',
    source: 'rendercv',
    fonts: ['Calibri', 'Arial'],
    accent: '#003366',
    status: 'pending',
    tags: ['navy', 'thick underline', 'icon contacts', 'technical'],
  },
  {
    id: 'rc-engineering-resumes',
    name: 'RC Engineering Resumes',
    tagline: 'Times New Roman with double rule below name',
    category: 'academic',
    atsScore: 'full',
    source: 'rendercv',
    fonts: ['Times New Roman'],
    accent: null,
    status: 'pending',
    tags: ['serif', 'times new roman', 'double rule', 'traditional', 'academic'],
  },
  {
    id: 'rc-ink',
    name: 'RC Ink',
    tagline: 'Dark navy header box with monospace feel',
    category: 'modern',
    atsScore: 'full',
    source: 'rendercv',
    fonts: ['Courier New'],
    accent: '#1a1a2e',
    status: 'pending',
    tags: ['dark header', 'monospace', 'stark', 'uppercase', 'angle bracket bullets'],
  },
  {
    id: 'rc-opal',
    name: 'RC Opal',
    tagline: 'Teal accent with pipe contact separators',
    category: 'modern',
    atsScore: 'full',
    source: 'rendercv',
    fonts: ['Arial'],
    accent: '#0d9488',
    status: 'pending',
    tags: ['teal', 'centered name', 'dash bullets', 'clean'],
  },
]

/** Get only active (implemented) templates */
export const ACTIVE_TEMPLATES = TEMPLATES.filter(t => t.status === 'active')

/**
 * Free-tier template access. Only Classic is unlocked on the Free plan — it's
 * the timeless serif anchor kept over near-identical alternatives (see its
 * catalog note) and has the broadest cross-audience appeal, matching the
 * product's "broad, all job seekers" positioning rather than just the
 * IT-fresher wedge. Every other active template is Pro/Max only.
 */
export const FREE_TEMPLATE_IDS: ReadonlySet<string> = new Set(['classic'])

export function isTemplateLocked(templateId: string, plan: 'free' | 'pro' | 'max'): boolean {
  if (plan !== 'free') return false
  return !FREE_TEMPLATE_IDS.has(templateId)
}

/** Thumbnail image for each active template, used by the template picker carousel */
export const TEMPLATE_IMAGES: Record<string, string> = {
  // Verified against each renderer's actual accent color/layout (2026-07-18 audit):
  cobalt: '/templates/aarav-sharma.png',   // navy #06296b underline rules — matches Cobalt's own "recreates aarav-sharma" note
  onyx: '/templates/rohan-mehta.png',      // monochrome + single navy divider — matches Onyx's own "recreates rohan-mehta" note
  lapis: '/templates/ananya-reddy.png',    // indigo bars + outlined pills — matches Lapis's own "recreates ananya-reddy" note
  // Real renders of the live PdfDocument (scripts/generate-template-shots.mts), 2026-07-18/19.
  classic: '/template-previews/classic.png',
  rezi: '/template-previews/rezi.png',
  london: '/template-previews/london.png',
  harvard: '/template-previews/harvard.png',
  'open-resume': '/template-previews/open-resume.png',
  jade: '/template-previews/jade.png',     // single-column conversion, 2026-07-19 — replaces the old two-column priya-nair.png mockup
  executive: '/template-previews/executive.png', // new template, 2026-07-19
  amber: '/template-previews/amber.png', // new template, 2026-07-19
  athens: '/template-previews/athens.png', // new template, 2026-07-19
  axis: '/template-previews/axis.png', // new template, 2026-07-19
  beacon: '/template-previews/beacon.png', // new template, 2026-07-19
  jake: '/template-previews/jake.png', // new template, 2026-07-19
}

/** Get all pending templates grouped by source */
export const PENDING_BY_SOURCE = TEMPLATES
  .filter(t => t.status === 'pending')
  .reduce<Record<string, TemplateMeta[]>>((acc, t) => {
    acc[t.source] = acc[t.source] ?? []
    acc[t.source].push(t)
    return acc
  }, {})
