// Design-sync entry barrel — used by .ds-sync build tool only.
// Not used by the Next.js app (Next.js resolves components by file path).
import './_ds_polyfills'; // must be first — stubs process/Node globals for browser IIFE

// ── Landing ───────────────────────────────────────────────────
export { default as Hero } from './landing/Hero';
export { default as Features } from './landing/Features';
export { default as Pricing } from './landing/Pricing';
export { MatchScoreReceipt, ATSIntelReceipt, ResumeOptReceipt } from './landing/Receipts';
export { default as TrustBar } from './landing/TrustBar';
export { default as CTABanner } from './landing/CTABanner';
export { default as Journey } from './landing/Journey';
export { default as Testimonials } from './landing/Testimonials';
export { default as ResumeShowcase } from './landing/ResumeShowcase';
export { default as LandingNav } from './landing/LandingNav';
export { default as LandingFooter } from './landing/LandingFooter';
export { default as CompanyResearch } from './landing/CompanyResearch';

// ── Nav / Layout ──────────────────────────────────────────────
export { default as Navbar } from './Navbar';
export { default as Footer } from './Footer';
export { default as MobileNavbar } from './MobileNavbar';
export { default as DashboardLayout } from './DashboardLayout';

// ── Core UI ───────────────────────────────────────────────────
export { default as JobCard } from './JobCard';
export { default as BuildPlanModal } from './BuildPlanModal';
export { default as TemplatePickerModal } from './TemplatePickerModal';
export { default as LegitimacyBadge } from './LegitimacyBadge';
export { MorphingPopover, MorphingPopoverTrigger, MorphingPopoverContent } from './ui/morphing-popover';

// ── Search ────────────────────────────────────────────────────
export { DatePostedFilter } from './search/DatePostedFilter';
export { PasteJobButton } from './search/PasteJobModal';

// ── Billing ───────────────────────────────────────────────────
export { default as BillingPanel } from './billing/BillingPanel';
export { default as UpgradeToast } from './billing/UpgradeToast';

// ── Legal ─────────────────────────────────────────────────────
export { default as ConsentBanner } from './legal/ConsentBanner';
export { default as LegalPageLayout } from './legal/LegalPageLayout';

// ── Queue / Chat ──────────────────────────────────────────────
export { QueueStatusBanner } from './queue/QueueStatusBanner';
export { default as PendingResearchToaster } from './PendingResearchToaster';
export { default as ChatPanel } from './chat/ChatPanel';
