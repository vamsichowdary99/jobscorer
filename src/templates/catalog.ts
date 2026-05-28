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
  },
  {
    id: 'rezi-standard',
    name: 'Rezi Standard',
    tagline: 'Clean sans-serif with thin ruled sections',
    category: 'sans-serif',
    atsScore: 'full',
    source: 'competitor',
    fonts: ['Lato'],
    accent: null,
    status: 'active',
    rendererPath: '@/components/ResumeRenderer/ReziStandardPdfDocument',
    tags: ['sans-serif', 'lato', 'thin rules', 'centered name', 'minimal'],
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
  },
  {
    id: 'stitch',
    name: 'Stitch',
    tagline: 'Navy serif with bullet markers and pipe contacts',
    category: 'serif',
    atsScore: 'full',
    source: 'original',
    fonts: ['Times-Roman'],
    accent: '#1e3a5f',
    status: 'active',
    rendererPath: '@/components/ResumeRenderer/StitchPdfDocument',
    tags: ['serif', 'times-roman', 'navy', 'pipe contacts', 'centered name', 'built-in font'],
    notes: 'Font is Times-Roman (PDF base-14 built-in). Bypasses font-subset/CMap corruption that affected Lora when multiple Lora templates rendered in the same browser session.',
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
    notes: 'Font is Times-Roman (PDF base-14 built-in) for guaranteed ATS extraction in strict parsers like Workday and Taleo.',
  },
  {
    id: 'sb2nov',
    name: 'sb2nov',
    tagline: 'LaTeX-style academic with open-circle bullets',
    category: 'academic',
    atsScore: 'full',
    source: 'rendercv',
    fonts: ['Times-Roman'],
    accent: null,
    status: 'active',
    rendererPath: '@/components/ResumeRenderer/Sb2novPdfDocument',
    tags: ['serif', 'times-roman', 'open circle bullets', 'latex', 'academic', 'built-in font'],
    notes: 'Font is Times-Roman (PDF base-14 built-in). Closer to LaTeX Computer Modern than Lora was, and bypasses font-subset corruption.',
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
    fonts: ['Caladea', 'Garamond'],
    accent: null,
    status: 'pending',
    tags: ['serif', 'garamond', 'diamond bullets', 'uppercase headers', 'executive'],
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
    id: 'kickresume-gradient',
    name: 'Kickresume Gradient',
    tagline: 'Dark navy gradient header with dot skills',
    category: 'modern',
    atsScore: 'full',
    source: 'competitor',
    fonts: ['Open Sans'],
    accent: '#0f3460',
    status: 'pending',
    tags: ['dark navy', 'gradient', 'dot ratings', 'dramatic header'],
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
    fonts: ['Arial'],
    accent: '#c0392b',
    status: 'pending',
    tags: ['red', 'gray header', 'outlined skills', 'clean'],
    notes: 'Resume.io Athens style',
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

/** Get all pending templates grouped by source */
export const PENDING_BY_SOURCE = TEMPLATES
  .filter(t => t.status === 'pending')
  .reduce<Record<string, TemplateMeta[]>>((acc, t) => {
    acc[t.source] = acc[t.source] ?? []
    acc[t.source].push(t)
    return acc
  }, {})
