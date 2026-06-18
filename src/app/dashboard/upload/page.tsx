'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { triggerResumeUpload, fetchResumes, deleteResume, getPrimaryResumeId, setPrimaryResumeId } from '@/lib/api'
import type { Resume, ResumeAiAnalysis } from '@/lib/types'
import { useAuth } from '@/components/providers/AuthProvider'
import { createClient } from '@/lib/supabase/client'
import { MorphingPopover, MorphingPopoverTrigger, MorphingPopoverContent } from '@/components/ui/morphing-popover'
import { motion, AnimatePresence } from 'framer-motion'

const POPOVER_VARIANTS = {
    initial: { opacity: 0, filter: 'blur(8px)' },
    animate: { opacity: 1, filter: 'blur(0px)' },
    exit:    { opacity: 0, filter: 'blur(8px)' },
}
const POPOVER_TRANSITION = { duration: 0.32, ease: [0.32, 0.72, 0.2, 1] as [number, number, number, number] }

// Full-screen-ish centered panel (~75vw, capped). position:fixed so it ignores scroll/clip ancestors.
const POP_CONTENT_BASE: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    margin: 'auto',
    width: 'min(900px, 75vw)',
    height: 'fit-content',
    maxHeight: '80vh',
    padding: 0,
    background: '#ffffff',
    border: '1px solid rgba(15, 23, 42, 0.08)',
    borderRadius: 22,
    boxShadow: '0 40px 80px -20px rgba(15, 23, 42, 0.4), 0 12px 32px rgba(15, 23, 42, 0.08)',
    color: '#0f172a',
    zIndex: 60,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
}
const POP_HEADER:   React.CSSProperties = { padding: '18px 22px 14px', borderBottom: '1px solid #e8f1ff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }
const POP_BODY:     React.CSSProperties = { flex: 1, overflowY: 'auto', padding: '18px 22px 10px' }
const POP_FOOTER:   React.CSSProperties = { padding: '12px 22px 18px', borderTop: '1px solid #e8f1ff', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }
const POP_HEAD:     React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#0f1e40', margin: 0, letterSpacing: '-0.01em', fontFamily: "'Lora', Georgia, serif" }
const POP_SUB:      React.CSSProperties = { fontSize: 11.5, color: '#8dafd8', margin: '2px 0 0', lineHeight: 1.5, fontFamily: "'DM Sans', 'Inter', sans-serif" }
// Meridian-themed input components matching resumes/page.tsx editor.
// Used inside the upload popups so they read identically to /resumes edit modals.
const UM_LABEL: React.CSSProperties = {
    fontSize: '0.725rem', fontWeight: 500, color: '#4a6fa5',
    display: 'block', marginBottom: 4, marginTop: 10,
    letterSpacing: 0, fontFamily: "'DM Sans', 'Inter', sans-serif",
}
const UM_INPUT: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 7,
    background: '#fff', border: '1px solid #cfe2ff',
    color: '#0f1e40', fontSize: '0.8125rem', outline: 'none',
    boxSizing: 'border-box', fontFamily: "'DM Sans', 'Inter', sans-serif",
    transition: 'border-color 0.15s, box-shadow 0.15s',
}
const UM_ENTRY: React.CSSProperties = {
    marginBottom: 12, padding: 12, background: '#fff', borderRadius: 6,
    border: '1px solid #cfe2ff', position: 'relative',
}
const UM_REMOVE_X: React.CSSProperties = {
    position: 'absolute', top: 8, right: 8, background: 'transparent',
    border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const UM_ADD_MORE: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
    borderRadius: 6, background: 'transparent', border: '1px dashed #cfe2ff',
    color: '#4a6fa5', cursor: 'pointer', fontSize: '0.8125rem',
    width: '100%', justifyContent: 'center', marginTop: 4,
    fontFamily: "'DM Sans', 'Inter', sans-serif",
}

// Resumes-page-aligned popup section icons (36×36 tinted tile + green icon).
// Each popup specifies which section key it represents; the tile is unified
// in look so the popups read as a family, like the Edit modals on /resumes.
const POP_SECTION_ICONS: Record<string, React.ReactNode> = {
    experience:     <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></>,
    skills:         <><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></>,
    education:      <><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v4c3 3 9 3 12 0v-4"/></>,
    certifications: <><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></>,
    projects:       <><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></>,
    achievements:   <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    links:          <><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></>,
}

function PopSectionIcon({ k }: { k: string }) {
    return (
        <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: '#dcfce7',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {POP_SECTION_ICONS[k] || POP_SECTION_ICONS.projects}
            </svg>
        </div>
    )
}
const POP_CLOSE_X:  React.CSSProperties = { background: 'transparent', border: 'none', cursor: 'pointer', width: 32, height: 32, borderRadius: 8, color: '#8dafd8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }

// In-card UI: section header (title + Add button), small mini-add button, edit pencil over each item.
const SECTION_HEAD: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }
const MINI_ADD:     React.CSSProperties = { background: 'rgba(29, 78, 216, 0.08)', color: '#1d4ed8', border: 'none', borderRadius: 9999, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }
const EDIT_PENCIL:  React.CSSProperties = { position: 'absolute', top: 0, right: 0, background: '#f1f5f9', border: '1px solid #e2e8f0', cursor: 'pointer', width: 26, height: 26, borderRadius: 6, color: '#475569', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', zIndex: 2 }
const SKILL_CHIP:   React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f1f5f9', color: '#475569', borderRadius: 9999, padding: '4px 6px 4px 12px', fontSize: 12, fontWeight: 500, marginRight: 6, marginBottom: 6 }
const SKILL_REMOVE: React.CSSProperties = { background: '#cbd5e1', color: '#475569', border: 'none', borderRadius: '50%', width: 16, height: 16, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: 1, padding: 0 }

const MAX_RESUMES = 5

interface CertEntry    { name: string; issuer: string; date: string }
interface ProjectEntry { name: string; description: string; technologies: string; link: string }
interface AchievEntry  { title: string; description: string; year: string }
interface LinkEntry    { linkedin: string; github: string; portfolio: string; other: string }
interface WorkEntry    { title: string; company: string; location: string; start_date: string; end_date: string; responsibilities: string; achievements: string }
interface EduEntry     { institution: string; degree: string; field_of_study: string; graduation_date: string; gpa: string }

const EMPTY_CERT:    CertEntry    = { name: '', issuer: '', date: '' }
const EMPTY_PROJECT: ProjectEntry = { name: '', description: '', technologies: '', link: '' }
const EMPTY_ACHIEV:  AchievEntry  = { title: '', description: '', year: '' }
const EMPTY_LINKS:   LinkEntry    = { linkedin: '', github: '', portfolio: '', other: '' }
const EMPTY_WORK:    WorkEntry    = { title: '', company: '', location: '', start_date: '', end_date: 'Present', responsibilities: '', achievements: '' }
const EMPTY_EDU:     EduEntry     = { institution: '', degree: '', field_of_study: '', graduation_date: '', gpa: '' }

// Walks the double-stringify quirk on structured_data and returns a plain object.
function getStructured(resume: Resume | null): Record<string, unknown> | null {
    if (!resume) return null
    let sd: unknown = resume.structured_data
    if (!sd) return null
    if (typeof sd === 'string') { try { sd = JSON.parse(sd) } catch { return null } }
    if (typeof sd === 'string') { try { sd = JSON.parse(sd) } catch { return null } }
    if (sd === null || typeof sd !== 'object') return null
    return sd as Record<string, unknown>
}
function toLines(arr: unknown): string {
    if (!Array.isArray(arr)) return ''
    return (arr as string[]).join('\n')
}
function fromLines(s: string): string[] {
    return s.split('\n').map(x => x.trim()).filter(Boolean)
}
async function updateStructuredSection(resume_id: string, section: string, value: unknown) {
    const res = await fetch('/api/resume/update-structured', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_id, section, value }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Failed to update resume')
    return json
}

function timeAgo(d: string) {
    const diff = Date.now() - new Date(d).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
}
function pad(n: number) { return String(n).padStart(2, '0') }

// Estimate total years of experience from work-history date ranges. The resume
// parser frequently omits total_years_experience (or returns 0), which made the
// hero stat read "00 Experience" even for candidates with real history. We fall
// back to summing the durations of each role here.
function estimateYearsFromWork(work: { start: string; end: string }[]): number {
    if (!work?.length) return 0
    const toMs = (s: string): number | null => {
        if (!s) return null
        if (/present|current|now|ongoing/i.test(s)) return Date.now()
        const ym = s.match(/(\d{4})/)            // any 4-digit year
        if (!ym) return null
        const year = Number(ym[1])
        if (year < 1950 || year > 2100) return null
        const mm = s.match(/\b(0?[1-9]|1[0-2])[\/\-]/) // leading month e.g. "04/2024"
        const monthIdx = mm ? Number(mm[1]) - 1 : 0
        return new Date(year, monthIdx, 1).getTime()
    }
    let totalMs = 0
    for (const w of work) {
        const start = toMs(w.start)
        const end = toMs(w.end) ?? Date.now()
        if (start != null && end > start) totalMs += end - start
    }
    if (totalMs <= 0) return 0
    return Math.round(totalMs / (365.25 * 24 * 60 * 60 * 1000))
}

// ── all styles outside component ────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
    root:        { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', overflow: 'hidden', fontFamily: "'Inter',sans-serif", background: '#f8fafc' },
    body:        { display: 'flex', flex: 1, overflow: 'hidden' },
    sidebar:     { width: 288, background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flexShrink: 0 },
    sidebarHead: { padding: '24px 24px 16px' },
    sidebarTitle:{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 20px' },
    uploadBtn:   { width: '100%', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 16px', fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
    resumeList:  { flex: 1, overflowY: 'auto' },
    resumeTime:  { fontSize: 11, color: '#9ca3af', margin: '2px 0 0' },
    main:        { flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' },
    scroll:      { flex: 1, overflowY: 'auto', padding: '24px 28px 120px' },
    inner:       { maxWidth: 1040, margin: '0 auto' },
    banner:      { background: '#eff6ff', borderLeft: '4px solid #3b82f6', padding: '10px 16px', borderRadius: '0 8px 8px 0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 18 },
    bannerLabel: { fontSize: 13, fontWeight: 500, color: '#1e40af', whiteSpace: 'nowrap' },
    bannerBtn:   { background: '#fff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 9999, padding: '3px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
    hero:        { borderRadius: 16, padding: '28px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg,#e0f2fe 0%,#fff 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 18, position: 'relative', overflow: 'hidden' },
    heroName:    { fontSize: 32, fontWeight: 700, color: '#111827', margin: 0, letterSpacing: '-0.02em' },
    heroRole:    { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.09em', margin: '5px 0 3px' },
    heroContact: { fontSize: 13, color: '#6b7280', margin: '3px 0 0' },
    statRow:     { display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' },
    stat:        { background: '#fff', borderRadius: 10, padding: '12px 18px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', minWidth: 80 },
    statNum:     { fontSize: 20, fontWeight: 700, color: '#111827', display: 'block' },
    statLabel:   { fontSize: 9, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3, display: 'block' },
    ringInner:   { position: 'absolute', width: 112, height: 112, borderRadius: '50%', background: '#fff' },
    ringText:    { position: 'relative', zIndex: 1, textAlign: 'center' },
    ringNum:     { fontSize: 32, fontWeight: 700, color: '#111827', display: 'block', lineHeight: '1' },
    ringLabel:   { fontSize: 8, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'block', marginTop: 3 },
    grid:        { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 },
    card:        { background: '#fff', borderRadius: 12, padding: '20px 22px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb', borderTop: '2px solid #135bec' },
    cardTitle:   { fontSize: 14, fontWeight: 700, color: '#111827', margin: '0 0 14px' },
    yellowCard:  { background: '#fff', border: '1px solid #e5e7eb', borderTop: '2px solid #135bec', borderRadius: 12, padding: '20px 22px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' },
    greenCard:   { background: '#fff', border: '1px solid #e5e7eb', borderTop: '2px solid #10b981', borderRadius: 12, padding: '20px 22px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' },
    purpleCard:  { background: '#fff', border: '1px solid #e5e7eb', borderTop: '2px solid #6366f1', borderRadius: 12, padding: '20px 22px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' },
    timelineLine:{ position: 'absolute', left: -17, top: 18, bottom: -18, width: 2, background: '#e2e8f0' },
    expTitle:    { fontSize: 14, fontWeight: 700, color: '#111827', margin: 0 },
    expCompany:  { fontSize: 13, fontWeight: 500, color: '#1d4ed8', margin: '3px 0 6px' },
    expDate:     { fontSize: 11, fontWeight: 500, color: '#6b7280', background: '#f3f4f6', padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap' },
    expDesc:     { fontSize: 13, color: '#4b5563', lineHeight: '1.6', margin: 0 },
    skill:       { display: 'inline-block', background: '#f1f5f9', color: '#475569', borderRadius: 9999, padding: '3px 10px', fontSize: 12, fontWeight: 500, margin: '0 5px 6px 0' },
    bar:         { position: 'absolute', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #e5e7eb', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 20, boxShadow: '0 -2px 8px rgba(0,0,0,0.05)' },
    barInfo:     { display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#6b7280' },
    discardBtn:  { background: 'none', border: 'none', color: '#4b5563', fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: '7px 14px' },
    saveBtn:     { background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
    matchBtn:    { background: '#0f172a', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 },
    input:       { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 11px', fontSize: 13, outline: 'none', marginBottom: 6, boxSizing: 'border-box', fontFamily: 'inherit' },
    addBtn:      { background: '#fff', border: '1px solid #e5e7eb', color: '#374151', borderRadius: 9999, padding: '5px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, margin: '0 auto' },
    sectionLabel:{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' },
    savedTag:    { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#dcfce7', color: '#16a34a', fontSize: 11, fontWeight: 600, borderRadius: 9999, padding: '2px 8px' },
}

function dot(first: boolean): React.CSSProperties {
    return { width: 11, height: 11, borderRadius: '50%', background: first ? '#1d4ed8' : '#cbd5e1', position: 'absolute', left: -21, top: 7 }
}
function itemStyle(active: boolean, primary: boolean): React.CSSProperties {
    return {
        padding: '12px 16px 12px 20px',
        borderLeft: `4px solid ${active ? '#1d4ed8' : 'transparent'}`,
        background: active ? 'rgba(219,234,254,0.5)' : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        borderBottom: '1px solid #f9fafb',
    }
}
function ring(pct: string): React.CSSProperties {
    return { width: 132, height: 132, borderRadius: '50%', flexShrink: 0, background: `conic-gradient(#1d4ed8 0% ${pct}%, #e2e8f0 ${pct}% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }
}

// ── small inline form helpers ────────────────────────────────────────────────
function FormActions({ onSave, onCancel, saving }: { onSave: () => void; onCancel: () => void; saving: boolean }) {
    return (
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={onCancel} style={{
                padding: '8px 18px', borderRadius: 8,
                border: '1px solid #cfe2ff', background: '#fff',
                color: '#1e3a6e', fontSize: '0.875rem', fontWeight: 600,
                cursor: 'pointer', fontFamily: "'DM Sans', 'Inter', sans-serif",
            }}>Cancel</button>
            <button onClick={onSave} disabled={saving} style={{
                padding: '8px 24px', borderRadius: 8, border: 'none',
                background: '#1d6af5', color: '#fff',
                fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
                fontFamily: "'DM Sans', 'Inter', sans-serif",
                boxShadow: '0 2px 10px rgba(29,106,245,0.30)',
                opacity: saving ? 0.6 : 1,
            }}>
                {saving ? 'Saving…' : 'Save changes'}
            </button>
        </div>
    )
}

type LinkKind = 'linkedin' | 'github' | 'portfolio' | 'other'

const LINK_META: Record<LinkKind, { label: string; accent: string; tint: string; icon: React.ReactNode }> = {
    linkedin: {
        label: 'LinkedIn',
        accent: '#0A66C2',
        tint:   'rgba(10, 102, 194, 0.10)',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 118.3 6.5a1.78 1.78 0 01-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0013 14.19a.66.66 0 000 .14V19h-3v-9h2.9v1.3a3.11 3.11 0 012.7-1.4c1.55 0 3.36.86 3.36 3.66z"/>
            </svg>
        ),
    },
    github: {
        label: 'GitHub',
        accent: '#1f2328',
        tint:   'rgba(31, 35, 40, 0.08)',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
            </svg>
        ),
    },
    portfolio: {
        label: 'Portfolio',
        accent: '#0F766E',
        tint:   'rgba(15, 118, 110, 0.10)',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9.5"/>
                <path d="M2.5 12h19"/>
                <path d="M12 2.5c2.7 3 4 6.5 4 9.5s-1.3 6.5-4 9.5c-2.7-3-4-6.5-4-9.5s1.3-6.5 4-9.5z"/>
            </svg>
        ),
    },
    other: {
        label: 'Link',
        accent: '#4F46E5',
        tint:   'rgba(79, 70, 229, 0.10)',
        icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 13.5a4.5 4.5 0 0 0 6.36.5l3-3a4.5 4.5 0 1 0-6.36-6.36l-1.5 1.5"/>
                <path d="M14 10.5a4.5 4.5 0 0 0-6.36-.5l-3 3a4.5 4.5 0 1 0 6.36 6.36l1.5-1.5"/>
            </svg>
        ),
    },
}

function ScoreRing({ score, size }: { score: number; size: number }) {
    const cx = size / 2, cy = size / 2
    const r = size * 0.4
    const circ = 2 * Math.PI * r
    const offset = circ * (1 - Math.min(Math.max(score, 0), 100) / 100)
    return (
        <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={Math.round(size * 0.068)} />
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="#135bec" strokeWidth={Math.round(size * 0.068)} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} transform={`rotate(-90 ${cx} ${cy})`} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: Math.round(size * 0.255), fontWeight: 800, color: '#135bec', lineHeight: 1 }}>{score}</span>
            </div>
        </div>
    )
}

function LinkChip({ href, kind, label }: { href: string; kind: LinkKind; label?: string }) {
    const [hover, setHover] = useState(false)
    const meta = LINK_META[kind]
    const display = label || meta.label
    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 9,
                padding: '7px 13px 7px 11px',
                background: hover ? meta.tint : '#ffffff',
                border: `1.5px solid ${hover ? meta.accent : '#e5e7eb'}`,
                borderRadius: 9,
                color: hover ? meta.accent : '#0f172a',
                fontSize: 12.5,
                fontWeight: 600,
                letterSpacing: '-0.005em',
                fontFamily: "'DM Sans', 'Inter', sans-serif",
                textDecoration: 'none',
                transform: hover ? 'translateY(-1px)' : 'translateY(0)',
                boxShadow: hover
                    ? `0 1px 0 ${meta.accent}1f, 0 6px 14px -4px ${meta.accent}2e`
                    : '0 1px 0 rgba(15, 23, 42, 0.025)',
                transition: 'background 180ms ease, border-color 180ms ease, color 180ms ease, transform 220ms cubic-bezier(0.16,1,0.3,1), box-shadow 220ms cubic-bezier(0.16,1,0.3,1)',
                cursor: 'pointer',
            }}
        >
            <span style={{
                display: 'inline-flex',
                color: hover ? meta.accent : '#475569',
                transition: 'color 180ms ease',
            }}>
                {meta.icon}
            </span>
            <span>{display}</span>
            <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{
                    opacity: hover ? 0.85 : 0.32,
                    transform: hover ? 'translate(2px, -2px)' : 'translate(0,0)',
                    transition: 'opacity 180ms ease, transform 220ms cubic-bezier(0.16,1,0.3,1)',
                    marginLeft: 1,
                    flexShrink: 0,
                }}
            >
                <path d="M7 17L17 7M9 7h8v8"/>
            </svg>
        </a>
    )
}

export default function UploadPage() {
    const router   = useRouter()
    const { user } = useAuth()

    const [resumes, setResumes]             = useState<Resume[]>([])
    const [loadingResumes, setLoadingResumes] = useState(true)
    const [viewMode, setViewMode]           = useState<'upload' | 'view'>('upload')
    const [selectedResume, setSelectedResume] = useState<Resume | null>(null)
    const [primaryId, setPrimaryId]         = useState<string | null>(null)
    const [file, setFile]                   = useState<File | null>(null)
    const [dragging, setDragging]           = useState(false)
    const [uploading, setUploading]         = useState(false)
    const [uploadError, setUploadError]     = useState('')
    const [deletingId, setDeletingId]       = useState<string | null>(null)

    // form entry state
    const [certEntries,    setCertEntries]    = useState<CertEntry[]>([EMPTY_CERT])
    const [projectEntries, setProjectEntries] = useState<ProjectEntry[]>([EMPTY_PROJECT])
    const [achievEntries,  setAchievEntries]  = useState<AchievEntry[]>([EMPTY_ACHIEV])
    const [linkEntry,      setLinkEntry]      = useState<LinkEntry>(EMPTY_LINKS)
    const [workEntries,    setWorkEntries]    = useState<WorkEntry[]>([EMPTY_WORK])
    const [eduEntries,     setEduEntries]     = useState<EduEntry[]>([EMPTY_EDU])
    const [skillEntries,   setSkillEntries]   = useState<string[]>([])
    const [skillInput,     setSkillInput]     = useState('')
    const [addingSection,  setAddingSection]  = useState<string | null>(null)
    const [editingIndex,   setEditingIndex]   = useState<number | null>(null)  // null = adding; number = editing item at that index
    const [savingSection,  setSavingSection]  = useState<string | null>(null)
    const [lastSaved,      setLastSaved]      = useState<Date | null>(null)

    // saved display state (from gap_form_responses)
    const [savedCerts,    setSavedCerts]    = useState<CertEntry[]>([])
    const [savedProjects, setSavedProjects] = useState<{ name: string; desc: string }[]>([])
    const [savedAchievs,  setSavedAchievs]  = useState<AchievEntry[]>([])
    const [savedLinks,    setSavedLinks]    = useState<LinkEntry | null>(null)
    const [gapSaved,      setGapSaved]      = useState<Record<string, boolean>>({})

    // AI Profile Assessment
    const [resumeAnalysis, setResumeAnalysis] = useState<ResumeAiAnalysis | null>(null)
    const [analysisLoading, setAnalysisLoading] = useState(false)
    const [assessmentExpanded, setAssessmentExpanded] = useState(false)

    // ── load resumes ─────────────────────────────────────────────
    useEffect(() => {
        if (!user) return
        fetchResumes(user.id).then(data => {
            setResumes(data)
            const stored = getPrimaryResumeId()
            const pid = (stored && data.some(r => r.id === stored)) ? stored : data[0]?.id ?? null
            if (pid) { setPrimaryResumeId(pid); setPrimaryId(pid) }
            if (data.length > 0) { setSelectedResume(data[0]); setViewMode('view'); loadGapResponses(data[0].id) }
        }).catch(console.error).finally(() => setLoadingResumes(false))
    }, [user])

    // ── AI analysis: load from resume or poll until populated ────
    useEffect(() => {
        if (!selectedResume) { setResumeAnalysis(null); setAnalysisLoading(false); return }
        if (selectedResume.structured_data && selectedResume.ai_analysis) {
            setResumeAnalysis(selectedResume.ai_analysis)
            setAnalysisLoading(false)
            return
        }
        // structured_data or ai_analysis missing — start polling both
        setResumeAnalysis(selectedResume.ai_analysis)
        setAnalysisLoading(!selectedResume.ai_analysis)
        const supabase = createClient()
        let attempts = 0
        const resumeId = selectedResume.id
        const interval = setInterval(async () => {
            attempts++
            try {
                const { data } = await supabase
                    .from('resumes')
                    .select('structured_data, ai_analysis')
                    .eq('id', resumeId)
                    .single()
                const row = data as any
                if (row?.structured_data || row?.ai_analysis) {
                    // Update both the resumes list and selected resume so UI re-renders with new data
                    setResumes(prev => prev.map(r =>
                        r.id === resumeId
                            ? { ...r, structured_data: row.structured_data ?? r.structured_data, ai_analysis: row.ai_analysis ?? r.ai_analysis }
                            : r
                    ))
                    setSelectedResume(prev =>
                        prev?.id === resumeId
                            ? { ...prev, structured_data: row.structured_data ?? prev.structured_data, ai_analysis: row.ai_analysis ?? prev.ai_analysis }
                            : prev
                    )
                }
                if (row?.ai_analysis) {
                    setResumeAnalysis(row.ai_analysis as ResumeAiAnalysis)
                    setAnalysisLoading(false)
                    clearInterval(interval)
                }
            } catch { /* ignore */ }
            if (attempts > 150) { setAnalysisLoading(false); clearInterval(interval) } // 5 min timeout
        }, 2000)
        return () => clearInterval(interval)
    }, [selectedResume?.id])

    // ── gap responses ────────────────────────────────────────────
    const loadGapResponses = async (resumeId: string) => {
        setSavedCerts([]); setSavedProjects([]); setSavedAchievs([]); setSavedLinks(null)
        try {
            const json = await fetch(`/api/gap-form?resume_id=${resumeId}`).then(r => r.json())
            const saved: Record<string, boolean> = {}
            for (const r of (json.responses || [])) {
                if (!r.was_skipped && r.data) {
                    saved[r.section_name] = true
                    if (r.section_name === 'certifications') { setCertEntries(r.data); setSavedCerts(r.data) }
                    if (r.section_name === 'projects')       { setProjectEntries(r.data); setSavedProjects((r.data as ProjectEntry[]).map((p: ProjectEntry) => ({ name: p.name, desc: p.description }))) }
                    if (r.section_name === 'achievements')   { setAchievEntries(r.data); setSavedAchievs(r.data) }
                    if (r.section_name === 'links')          { setLinkEntry(r.data); setSavedLinks(r.data) }
                } else if (r.was_skipped) { saved[r.section_name] = true }
            }
            setGapSaved(saved)
        } catch { }
    }

    const handleSaveSection = async (section: string, data: unknown) => {
        if (!selectedResume) return
        setSavingSection(section)
        try {
            await fetch('/api/gap-form', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resume_id: selectedResume.id, section_name: section, was_skipped: false, data }),
            })
            setGapSaved(p => ({ ...p, [section]: true }))
            if (section === 'certifications') setSavedCerts(data as CertEntry[])
            if (section === 'projects')       setSavedProjects((data as ProjectEntry[]).map(p => ({ name: p.name, desc: p.description })))
            if (section === 'achievements')   setSavedAchievs(data as AchievEntry[])
            if (section === 'links')          setSavedLinks(data as LinkEntry)
            setAddingSection(null)
            setEditingIndex(null)
            setLastSaved(new Date())
        } catch { } finally { setSavingSection(null) }
    }

    // ── structured_data updates (experience / education / skills / certs / projects) ─────────
    // Optimistically patches the current resume's structured_data so the preview updates instantly,
    // then persists via /api/resume/update-structured.
    const patchStructuredLocal = (section: string, value: unknown) => {
        if (!selectedResume) return
        const current = getStructured(selectedResume) ?? {}
        const next: Record<string, unknown> = { ...current, [section]: value }
        setResumes(prev => prev.map(r => r.id === selectedResume.id ? { ...r, structured_data: next as unknown as Resume['structured_data'] } : r))
        setSelectedResume(prev => prev ? { ...prev, structured_data: next as unknown as Resume['structured_data'] } : prev)
    }
    const saveStructured = async (section: string, value: unknown) => {
        if (!selectedResume) return
        setSavingSection(section)
        try {
            await updateStructuredSection(selectedResume.id, section, value)
            patchStructuredLocal(section, value)
            setAddingSection(null)
            setEditingIndex(null)
            setLastSaved(new Date())
        } catch (e) {
            console.error(e)
            alert(e instanceof Error ? e.message : 'Failed to save')
        } finally {
            setSavingSection(null)
        }
    }

    // ── popover openers ────────────────────────────────────────────────────────────────────
    const openAdd = (section: string) => {
        setEditingIndex(null)
        if (section === 'certifications')   setCertEntries([EMPTY_CERT])
        if (section === 'projects')         setProjectEntries([EMPTY_PROJECT])
        if (section === 'achievements')     setAchievEntries([EMPTY_ACHIEV])
        if (section === 'links')            setLinkEntry(hasAnyLink ? { ...displayLinks } : EMPTY_LINKS)
        if (section === 'work_experience')  setWorkEntries([EMPTY_WORK])
        if (section === 'education')        setEduEntries([EMPTY_EDU])
        if (section === 'skills') {
            const sd = getStructured(selectedResume)
            const sk = (sd?.skills as { technical?: string[]; tools?: string[]; soft_skills?: string[]; languages?: string[] }) || {}
            const merged = [...new Set([...(sk.technical || []), ...(sk.tools || []), ...(sk.soft_skills || []), ...(sk.languages || []), ...((sd?.technical_skills as string[]) || [])])]
            setSkillEntries(merged)
            setSkillInput('')
        }
        setAddingSection(section)
    }
    const openEdit = (section: string, index: number) => {
        const sd = getStructured(selectedResume) ?? {}
        if (section === 'work_experience') {
            const item = ((sd.work_experience as Record<string, unknown>[]) || [])[index] || {}
            setWorkEntries([{
                title:            (item.title as string)      || (item.position as string) || '',
                company:          (item.company as string)    || '',
                location:         (item.location as string)   || '',
                start_date:       (item.start_date as string) || '',
                end_date:         (item.end_date as string)   || 'Present',
                responsibilities: toLines(item.responsibilities) || ((item.description as string) ?? ''),
                achievements:     toLines(item.achievements),
            }])
        }
        if (section === 'education') {
            const item = ((sd.education as Record<string, unknown>[]) || [])[index] || {}
            setEduEntries([{
                institution:     (item.institution as string)     || '',
                degree:          (item.degree as string)          || '',
                field_of_study:  (item.field_of_study as string)  || (item.field as string) || '',
                graduation_date: (item.graduation_date as string) || '',
                gpa:             (item.gpa as string)             || '',
            }])
        }
        if (section === 'certifications') {
            const item = allCerts[index] || EMPTY_CERT
            setCertEntries([{ name: item.name || '', issuer: item.issuer || '', date: item.date || '' }])
        }
        if (section === 'projects') {
            const sdProjects = (sd.projects as Record<string, unknown>[]) || []
            const item = sdProjects[index] as Record<string, unknown> | undefined
            setProjectEntries([{
                name:         (item?.name as string)         || allProjects[index]?.name || '',
                description:  (item?.description as string)  || allProjects[index]?.desc || '',
                technologies: Array.isArray(item?.technologies) ? (item?.technologies as string[]).join(', ') : ((item?.technologies as string) || ''),
                link:         (item?.url as string)          || (item?.link as string) || '',
            }])
        }
        if (section === 'achievements') {
            const item = savedAchievs[index] || EMPTY_ACHIEV
            setAchievEntries([{ title: item.title || '', description: item.description || '', year: item.year || '' }])
        }
        if (section === 'links') {
            setLinkEntry(hasAnyLink ? { ...displayLinks } : EMPTY_LINKS)
        }
        setEditingIndex(index)
        setAddingSection(section)
    }

    // ── section-specific save handlers ─────────────────────────────────────────────────────
    const saveWork = async () => {
        const sd = getStructured(selectedResume) ?? {}
        const existing = ((sd.work_experience as Record<string, unknown>[]) || []).slice()
        const formItems = workEntries
            .map(w => ({
                title:            w.title.trim(),
                company:          w.company.trim(),
                location:         w.location.trim(),
                start_date:       w.start_date.trim(),
                end_date:         w.end_date.trim(),
                responsibilities: fromLines(w.responsibilities),
                achievements:     fromLines(w.achievements),
            }))
            .filter(w => w.title || w.company)
        let next: Record<string, unknown>[]
        if (editingIndex !== null) {
            next = existing
            if (formItems[0]) next[editingIndex] = formItems[0]
            else next.splice(editingIndex, 1) // empty form in edit = delete
        } else {
            next = [...existing, ...formItems]
        }
        await saveStructured('work_experience', next)
    }
    const saveEducation = async () => {
        const sd = getStructured(selectedResume) ?? {}
        const existing = ((sd.education as Record<string, unknown>[]) || []).slice()
        const formItems = eduEntries
            .map(e => ({
                institution:     e.institution.trim(),
                degree:          e.degree.trim(),
                field_of_study:  e.field_of_study.trim(),
                graduation_date: e.graduation_date.trim(),
                gpa:             e.gpa.trim(),
            }))
            .filter(e => e.institution || e.degree)
        let next: Record<string, unknown>[]
        if (editingIndex !== null) {
            next = existing
            if (formItems[0]) next[editingIndex] = formItems[0]
            else next.splice(editingIndex, 1)
        } else {
            next = [...existing, ...formItems]
        }
        await saveStructured('education', next)
    }
    const saveSkills = async () => {
        // Flush any unsubmitted text in the input box so user doesn't lose a skill they typed but didn't Enter.
        const pending = skillInput.trim().replace(/,$/, '').trim()
        const merged = pending && !skillEntries.some(s => s.toLowerCase() === pending.toLowerCase())
            ? [...skillEntries, pending]
            : skillEntries
        // Case-insensitive dedupe — collapses "SQL"/"sql" to the first occurrence, preserving its casing.
        const seen = new Set<string>()
        const cleaned: string[] = []
        for (const raw of merged) {
            const v = raw.trim()
            if (!v) continue
            const k = v.toLowerCase()
            if (seen.has(k)) continue
            seen.add(k)
            cleaned.push(v)
        }
        setSkillInput('')
        // Collapse all categories into `technical` so future reads show what the user explicitly kept.
        await saveStructured('skills', { technical: cleaned, tools: [], soft_skills: [], languages: [] })
    }
    const saveCerts = async () => {
        const sd = getStructured(selectedResume) ?? {}
        const existing = ((sd.certifications as Record<string, unknown>[]) || []).slice()
        const formItems = certEntries
            .map(c => ({ name: c.name.trim(), issuer: c.issuer.trim(), date: c.date.trim() }))
            .filter(c => c.name)
        let next: Record<string, unknown>[]
        if (editingIndex !== null) {
            // editing an item from the merged display list: figure out whether it's from preview or savedCerts
            const fromPreview = editingIndex < (preview?.certs.length ?? 0)
            if (fromPreview) {
                next = existing
                if (formItems[0]) next[editingIndex] = formItems[0]
                else next.splice(editingIndex, 1)
                await saveStructured('certifications', next)
            } else {
                const i2 = editingIndex - (preview?.certs.length ?? 0)
                const updatedSaved = savedCerts.slice()
                if (formItems[0]) updatedSaved[i2] = formItems[0] as CertEntry
                else updatedSaved.splice(i2, 1)
                await handleSaveSection('certifications', updatedSaved)
            }
        } else {
            next = [...existing, ...formItems]
            await saveStructured('certifications', next)
        }
    }
    const saveProjects = async () => {
        const sd = getStructured(selectedResume) ?? {}
        const existing = ((sd.projects as Record<string, unknown>[]) || []).slice()
        const formItems = projectEntries
            .map(p => ({
                name:         p.name.trim(),
                description:  p.description.trim(),
                technologies: p.technologies.split(',').map(s => s.trim()).filter(Boolean),
                url:          p.link.trim(),
            }))
            .filter(p => p.name)
        let next: Record<string, unknown>[]
        if (editingIndex !== null) {
            const fromPreview = editingIndex < (preview?.projects.length ?? 0)
            if (fromPreview) {
                next = existing
                if (formItems[0]) next[editingIndex] = formItems[0]
                else next.splice(editingIndex, 1)
                await saveStructured('projects', next)
            } else {
                // saved project — gap_form_responses stores ProjectEntry shape (description + link)
                const i2 = editingIndex - (preview?.projects.length ?? 0)
                const userForm = projectEntries[0]
                const updated = savedProjects.slice()
                if (userForm && userForm.name.trim()) {
                    updated[i2] = { name: userForm.name, desc: userForm.description }
                } else {
                    updated.splice(i2, 1)
                }
                // gap-form needs the full ProjectEntry shape, so reconstruct
                const gapShape: ProjectEntry[] = updated.map(u => ({ name: u.name, description: u.desc, technologies: '', link: '' }))
                await handleSaveSection('projects', gapShape)
            }
        } else {
            next = [...existing, ...formItems]
            await saveStructured('projects', next)
        }
    }
    const saveAchievementsItems = async () => {
        const formItems = achievEntries
            .map(a => ({ title: a.title.trim(), description: a.description.trim(), year: a.year.trim() }))
            .filter(a => a.title)
        let next: AchievEntry[]
        if (editingIndex !== null) {
            next = savedAchievs.slice()
            if (formItems[0]) next[editingIndex] = formItems[0]
            else next.splice(editingIndex, 1)
        } else {
            next = [...savedAchievs, ...formItems]
        }
        await handleSaveSection('achievements', next)
    }

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setDragging(false)
        const f = e.dataTransfer.files[0]
        if (f && (f.type === 'application/pdf' || f.name.endsWith('.docx'))) setFile(f)
    }, [])

    const handleUpload = async () => {
        if (!file || !user) return
        setUploading(true); setUploadError('')
        try {
            const result = await triggerResumeUpload(file, user.id)
            // n8n may be async — retry until the new resume row appears in Supabase (up to 15s)
            const initialCount = resumes.length
            let fresh: Resume[] = []
            for (let attempt = 0; attempt < 15; attempt++) {
                fresh = await fetchResumes(user.id)
                if (fresh.length > initialCount) break
                await new Promise(r => setTimeout(r, 1000))
            }
            if (fresh.length > 0) {
                setResumes(fresh)
                setSelectedResume(fresh[0])
                setViewMode('view')
                loadGapResponses(fresh[0].id)
            }
            setFile(null)
            const resumeId = (result as any)?.data?.resume_id ?? fresh[0]?.id
            if (resumeId) fetch('/api/resume-sections-audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resume_id: resumeId }) }).catch(() => { })
        } catch (err) { setUploadError(err instanceof Error ? err.message : 'Upload failed') }
        finally { setUploading(false) }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this resume?')) return
        setDeletingId(id)
        try {
            await deleteResume(id)
            const updated = resumes.filter(r => r.id !== id)
            setResumes(updated)
            if (selectedResume?.id === id) {
                if (updated.length > 0) { setSelectedResume(updated[0]); setViewMode('view'); loadGapResponses(updated[0].id) }
                else { setSelectedResume(null); setViewMode('upload') }
            }
        } finally { setDeletingId(null) }
    }

    const handleSetPrimary = (id: string) => {
        setPrimaryResumeId(id)
        setPrimaryId(id)
    }

    const switchResume = (r: Resume) => {
        setSelectedResume(r); setViewMode('view')
        setAddingSection(null)
        setCertEntries([EMPTY_CERT]); setProjectEntries([EMPTY_PROJECT])
        setAchievEntries([EMPTY_ACHIEV]); setLinkEntry(EMPTY_LINKS)
        setSavedCerts([]); setSavedProjects([]); setSavedAchievs([]); setSavedLinks(null)
        loadGapResponses(r.id)
    }

    const parse = useCallback((resume: Resume) => {
        let sd = resume.structured_data as unknown
        if (!sd) return null
        if (typeof sd === 'string') { try { sd = JSON.parse(sd) } catch { return null } }
        if (typeof sd === 'string') { try { sd = JSON.parse(sd) } catch { return null } }
        const d = sd as Record<string, unknown>
        const pi = (d.personal_info as Record<string, string>) || {}
        const work = ((d.work_experience || d.work_history || []) as Record<string, unknown>[]).map(e => ({
            position: (e.title || e.position || '') as string,
            company:  (e.company || '') as string,
            start:    (e.start_date || '') as string,
            end:      (e.end_date || 'Present') as string,
            desc:     Array.isArray(e.responsibilities) ? (e.responsibilities as string[]).join('\n') : ((e.description || '') as string),
        }))
        const parsedYears = d.total_years_experience as number
        return {
            name:      pi.full_name || (d.name as string) || 'Unknown',
            email:     pi.email || (d.email as string) || '',
            location:  pi.location || (d.location as string) || '',
            linkedin:  pi.linkedin || '',
            github:    pi.github || '',
            portfolio: pi.portfolio || pi.website || '',
            summary:   (d.professional_summary as string) || (d.summary as string) || '',
            role:     pi.title || (d.title as string) || (d.professional_title as string) || '',
            work,
            education: ((d.education || []) as Record<string, string>[]).map(e => ({
                institution: e.institution || '', degree: e.degree || '',
                field: e.field_of_study || e.field || '', grad: e.graduation_date || '', gpa: e.gpa || '',
            })),
            skills:   [...new Set([...((d.skills as Record<string, string[]>)?.technical || []), ...((d.skills as Record<string, string[]>)?.tools || []), ...((d.technical_skills as string[]) || [])])] as string[],
            projects: ((d.projects || []) as Record<string, string>[]).map(p => ({ name: p.name || '', desc: p.description || '' })),
            certs:    ((d.certifications || []) as Record<string, string>[]).map(c => ({ name: c.name || '', issuer: c.issuer || '', date: c.date || '' })),
            years:    (typeof parsedYears === 'number' && parsedYears > 0) ? Math.round(parsedYears) : estimateYearsFromWork(work),
        }
    }, [])

    const preview = useMemo(() => selectedResume ? parse(selectedResume) : null, [selectedResume, parse])

    // Merge parsed-from-resume links with user-added savedLinks (savedLinks wins per-field if set).
    // Normalize URLs — resume parser sometimes drops the protocol, which makes <a href> treat them as relative paths.
    const normalizeUrl = (u: string) => {
        const v = u.trim()
        if (!v) return ''
        return /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, '')}`
    }
    const displayLinks = useMemo<LinkEntry>(() => ({
        linkedin:  normalizeUrl(savedLinks?.linkedin  || preview?.linkedin  || ''),
        github:    normalizeUrl(savedLinks?.github    || preview?.github    || ''),
        portfolio: normalizeUrl(savedLinks?.portfolio || preview?.portfolio || ''),
        other:     normalizeUrl(savedLinks?.other     || ''),
    }), [preview, savedLinks])
    const hasAnyLink = !!(displayLinks.linkedin || displayLinks.github || displayLinks.portfolio || displayLinks.other)

    // Resume-strength heuristic on a 0–100 scale so it matches the dashboard's
    // /100 resume score and the 0–100 match scores — one scale across the app.
    // (Previously a 350–999 "credit-score" style number, which read like a
    // different metric next to the dashboard's 75/100.)
    const sc = useMemo(() => {
        if (!preview) return 35
        const allCerts = preview.certs.length + savedCerts.length
        const allProjs = preview.projects.length + savedProjects.length
        return Math.round(Math.min(100,
            35
            + Math.min(preview.years * 3, 15)
            + Math.min(preview.skills.length * 0.5, 15)
            + Math.min(allProjs * 2.2, 11)
            + Math.min(allCerts * 2.8, 11)
            + (preview.summary ? 5 : 0)
            + (displayLinks.linkedin ? 5 : 0)
        ))
    }, [preview, savedCerts, savedProjects, displayLinks])

    const pct = String(sc)
    const atLimit = resumes.length >= MAX_RESUMES

    const missing = useMemo(() => {
        const m: { key: string; label: string }[] = []
        if (preview && !preview.certs.length && !savedCerts.length)    m.push({ key: 'certifications', label: '+ Certifications' })
        if (preview && !displayLinks.linkedin && !displayLinks.github && !displayLinks.portfolio) m.push({ key: 'links', label: '+ GitHub / Portfolio' })
        if (preview && !preview.projects.length && !savedProjects.length) m.push({ key: 'projects',    label: '+ Projects' })
        if (!savedAchievs.length)                                        m.push({ key: 'achievements',  label: '+ Achievements' })
        return m
    }, [preview, savedCerts, displayLinks, savedProjects, savedAchievs])

    // ─── rendered ────────────────────────────────────────────────────────────
    const allCerts    = preview ? [...preview.certs, ...savedCerts.filter(sc => !preview.certs.some(pc => pc.name === sc.name))] : savedCerts
    const allProjects = preview ? [...preview.projects, ...savedProjects.filter(sp => !preview.projects.some(pp => pp.name === sp.name))] : savedProjects

    const [isMobile, setIsMobile] = useState(false)
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)')
        setIsMobile(mq.matches)
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [])

    // On mobile: bottom sheet (slides up, stays above keyboard). Desktop: centred modal.
    const popContentStyle: React.CSSProperties = isMobile ? {
        position: 'fixed',
        bottom: 0, left: 0, right: 0, top: 'auto',
        margin: 0, width: '100%', height: 'auto',
        maxHeight: '88vh',
        borderRadius: '20px 20px 0 0',
        padding: 0,
        background: '#ffffff',
        border: 'none',
        borderTop: '1px solid #e2e8f0',
        boxShadow: '0 -20px 60px rgba(0,0,0,0.25)',
        color: '#0f172a',
        zIndex: 60,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
    } : POP_CONTENT_BASE
    const SHEET_HANDLE = isMobile ? <div style={{ width: 36, height: 4, borderRadius: 99, background: '#cbd5e1', margin: '10px auto 0', flexShrink: 0 }} /> : null

    return (
        <div style={S.root}>

            {/* ── Modal backdrop (fades whenever any section popover is open) ── */}
            <AnimatePresence>
                {addingSection && (
                    <motion.div
                        key="add-section-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                        onClick={() => setAddingSection(null)}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 50 }}
                    />
                )}
            </AnimatePresence>

            <div style={{ ...S.body, ...(isMobile ? { flexDirection: 'column' } : {}) }}>

                {/* ── Mobile Resume Tab Strip ──────────────────────────── */}
                {isMobile && (
                    <div style={{ padding: '10px 14px', background: '#fff', borderBottom: '1px solid #e5e7eb', overflowX: 'auto', WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'], display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button
                            onClick={() => { setViewMode('upload'); setFile(null); setUploadError('') }}
                            disabled={atLimit}
                            style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 20, background: viewMode === 'upload' ? '#1d4ed8' : '#f3f4f6', color: viewMode === 'upload' ? '#fff' : '#374151', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: atLimit ? 0.5 : 1, whiteSpace: 'nowrap' }}
                        >
                            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                            Upload
                        </button>
                        {resumes.map(r => {
                            const active = viewMode === 'view' && selectedResume?.id === r.id
                            const rv = parse(r)
                            const name = rv?.name && rv.name !== 'Unknown' ? rv.name : (r.original_filename || 'Unnamed')
                            const shortName = name.length > 18 ? name.substring(0, 18) + '…' : name
                            return (
                                <button
                                    key={r.id}
                                    onClick={() => switchResume(r)}
                                    style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 20, background: active ? '#dbeafe' : '#f3f4f6', color: active ? '#1d4ed8' : '#374151', border: `1.5px solid ${active ? '#bfdbfe' : 'transparent'}`, fontSize: 13, fontWeight: active ? 600 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                >
                                    {shortName}
                                </button>
                            )
                        })}
                    </div>
                )}

                {/* ── Sidebar ─────────────────────────────────────────── */}
                <aside style={{ ...S.sidebar, ...(isMobile ? { display: 'none' } : {}) }}>
                    <div style={S.sidebarHead}>
                        <h2 style={S.sidebarTitle}>My Resumes</h2>
                        <button onClick={() => { setViewMode('upload'); setFile(null); setUploadError('') }} disabled={atLimit} style={{ ...S.uploadBtn, opacity: atLimit ? 0.4 : 1 }}>
                            <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                            {atLimit ? 'Limit reached' : 'Upload New'}
                        </button>
                    </div>

                    <div style={S.resumeList}>
                        {loadingResumes ? (
                            [1,2,3].map(i => <div key={i} style={{ margin: '8px 14px', height: 52, borderRadius: 8, background: '#f3f4f6' }} />)
                        ) : resumes.length === 0 ? (
                            <div style={{ padding: '28px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                                <p style={{ fontWeight: 500, margin: '0 0 4px' }}>No resumes yet</p>
                                <p style={{ margin: 0, fontSize: 12 }}>Upload your first resume above</p>
                            </div>
                        ) : resumes.map(r => {
                            const active  = viewMode === 'view' && selectedResume?.id === r.id
                            const isPrimary = primaryId === r.id
                            const rv = parse(r)
                            const name = rv?.name && rv.name !== 'Unknown' ? rv.name : (r.original_filename || 'Unnamed')
                            return (
                                <div key={r.id} onClick={() => switchResume(r)} style={itemStyle(active, isPrimary)} className="resume-item">
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <p style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: active ? '#111827' : '#374151', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
                                            {isPrimary && (
                                                <span style={{ flexShrink: 0, background: '#dbeafe', color: '#1d4ed8', fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ACTIVE</span>
                                            )}
                                        </div>
                                        <p style={S.resumeTime}>Updated {timeAgo(r.created_at)}</p>
                                        {!isPrimary && (
                                            <button
                                                onClick={e => { e.stopPropagation(); handleSetPrimary(r.id) }}
                                                style={{ marginTop: 4, background: 'none', border: '1px solid #e5e7eb', color: '#6b7280', fontSize: 10, fontWeight: 600, borderRadius: 4, padding: '2px 8px', cursor: 'pointer', display: 'none' }}
                                                className="use-btn"
                                            >
                                                Use for scoring
                                            </button>
                                        )}
                                    </div>
                                    <button onClick={e => { e.stopPropagation(); handleDelete(r.id) }} disabled={deletingId === r.id} className="delete-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4, flexShrink: 0, opacity: 0 }} title="Delete">
                                        <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                                    </button>
                                </div>
                            )
                        })}
                    </div>

                    {/* Primary resume legend */}
                    {resumes.length > 1 && (
                        <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6', fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>
                            <span style={{ background: '#dbeafe', color: '#1d4ed8', fontWeight: 700, borderRadius: 3, padding: '1px 5px', marginRight: 5 }}>ACTIVE</span>
                            resume is used for AI job scoring
                        </div>
                    )}
                </aside>

                {/* ── Main ────────────────────────────────────────────── */}
                <main style={S.main}>
                    <div style={{ ...S.scroll, ...(isMobile ? { padding: '16px 16px 100px' } : {}) }}>
                        <div style={{ ...S.inner, ...(isMobile ? { maxWidth: '100%' } : {}) }}>

                            {viewMode === 'upload' ? (
                                /* Upload form */
                                <div style={{ maxWidth: 460, margin: isMobile ? '16px 0' : '36px auto', background: '#fff', borderRadius: 16, padding: isMobile ? 20 : 36, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
                                    <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>Upload your resume</h2>
                                    <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px', lineHeight: '1.6' }}>AI extracts your skills, experience, and education to find your best job matches.</p>
                                    <div onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={handleDrop} onClick={() => document.getElementById('rs-file')?.click()} style={{ border: `2px dashed ${dragging ? '#1d4ed8' : '#d1d5db'}`, borderRadius: 12, padding: '40px 20px', textAlign: 'center', cursor: 'pointer', background: dragging ? '#eff6ff' : '#fafafa', transition: 'all 0.2s' }}>
                                        <div style={{ fontSize: 36, marginBottom: 10 }}>{dragging ? '📥' : '📄'}</div>
                                        {file ? (<><p style={{ fontWeight: 600, color: '#111827', margin: '0 0 3px' }}>{file.name}</p><p style={{ fontSize: 12, color: '#10b981', margin: 0 }}>{(file.size/1024/1024).toFixed(2)} MB · ready</p></>) : (<><p style={{ fontWeight: 500, color: '#374151', margin: '0 0 4px' }}>Drop PDF or DOCX here</p><p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>or click to browse · max 10MB</p></>)}
                                        <input id="rs-file" type="file" accept=".pdf,.docx" onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }} style={{ display: 'none' }} />
                                    </div>
                                    {file && <button onClick={handleUpload} disabled={uploading} style={{ ...S.saveBtn, width: '100%', marginTop: 14, justifyContent: 'center', display: 'flex', opacity: uploading ? 0.6 : 1 }}>{uploading ? 'Analyzing…' : 'Upload & Analyze'}</button>}
                                    {uploadError && <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{uploadError}</p>}
                                </div>

                            ) : preview ? (
                                <>
                                    {/* Primary resume selector banner */}
                                    {selectedResume && primaryId !== selectedResume.id && (
                                        <div style={{ background: '#fff7ed', borderLeft: '4px solid #f97316', padding: '10px 16px', borderRadius: '0 8px 8px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                            <span style={{ fontSize: 13, color: '#9a3412', fontWeight: 500 }}>This resume is not used for AI scoring.</span>
                                            <button onClick={() => handleSetPrimary(selectedResume.id)} style={{ background: '#ea580c', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                                ⚡ Use this for scoring
                                            </button>
                                        </div>
                                    )}
                                    {selectedResume && primaryId === selectedResume.id && (
                                        <div style={{ background: '#f0fdf4', borderLeft: '4px solid #22c55e', padding: '8px 16px', borderRadius: '0 8px 8px 0', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 13, color: '#15803d', fontWeight: 500 }}>✓ This resume is active for AI job scoring</span>
                                        </div>
                                    )}

                                    {/* Missing sections banner */}
                                    {missing.length > 0 && (
                                        <div style={S.banner}>
                                            <span style={S.bannerLabel}>Missing Sections:</span>
                                            {missing.map(m => <button key={m.key} onClick={() => openAdd(m.key)} style={S.bannerBtn}>{m.label}</button>)}
                                        </div>
                                    )}

                                    {/* Hero card */}
                                    <section style={{
                                        borderRadius: 14,
                                        padding: isMobile ? '16px 14px' : '24px 28px',
                                        background: 'linear-gradient(135deg,#e0f2fe 0%,#fff 100%)',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                                        marginBottom: isMobile ? 11 : 18,
                                        border: '1px solid #e2e8f0',
                                        overflow: 'hidden',
                                        position: 'relative',
                                    }}>
                                        {/* hero-top: name/contact on left (flex:1), score ring on right */}
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <h1 style={{ fontSize: isMobile ? 20 : 28, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.03em', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'normal' : 'nowrap' }}>{preview.name}</h1>
                                                {preview.role && <p style={S.heroRole}>{preview.role}</p>}
                                                {(preview.email || preview.location) && <p style={{ ...S.heroContact, fontSize: isMobile ? 11 : 13 }}>{[preview.email, preview.location].filter(Boolean).join(' · ')}</p>}
                                            </div>
                                            <ScoreRing score={sc} size={isMobile ? 70 : 100} />
                                        </div>
                                        {/* stat row: full width, below hero-top */}
                                        <div style={{ display: 'flex', gap: isMobile ? 6 : 8 }}>
                                            {[
                                                { v: pad(preview.years),              l: isMobile ? 'Exp Yrs'  : 'Experience' },
                                                { v: pad(preview.skills.length),      l: 'Skills' },
                                                { v: pad(allProjects.length),         l: 'Projects' },
                                                { v: pad(allCerts.length),            l: 'Certs' },
                                                { v: pad(savedAchievs.length),        l: isMobile ? 'Achievmts' : 'Achievements' },
                                            ].map(s => (
                                                <div key={s.l} style={{
                                                    flex: 1,
                                                    background: 'rgba(255,255,255,0.8)',
                                                    border: '1px solid rgba(255,255,255,0.6)',
                                                    borderRadius: 9,
                                                    padding: isMobile ? '8px 6px' : '10px 8px',
                                                    textAlign: 'center',
                                                }}>
                                                    <span style={{
                                                        fontFamily: "'JetBrains Mono', monospace",
                                                        fontSize: isMobile ? 15 : 18,
                                                        fontWeight: 800,
                                                        color: '#0f172a',
                                                        display: 'block',
                                                        lineHeight: 1,
                                                        marginBottom: 3,
                                                    }}>{s.v}</span>
                                                    <span style={{
                                                        fontFamily: "'JetBrains Mono', monospace",
                                                        fontSize: isMobile ? 7.5 : 8.5,
                                                        fontWeight: 700,
                                                        color: '#94a3b8',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.07em',
                                                        display: 'block',
                                                    }}>{s.l}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </section>

                                    {/* Main Grid */}
                                    <div style={{ ...S.grid, ...(isMobile ? { gridTemplateColumns: '1fr' } : {}) }}>

                                        {/* Experience — 2 cols */}
                                        <div style={{ ...S.card, gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                                            <div style={SECTION_HEAD}>
                                                <h2 style={S.cardTitle}>Experience</h2>
                                                <MorphingPopover
                                                    open={addingSection === 'work_experience'}
                                                    onOpenChange={(o) => { if (!o) { setAddingSection(null); setEditingIndex(null) } }}
                                                    variants={POPOVER_VARIANTS}
                                                    transition={POPOVER_TRANSITION}
                                                >
                                                    <MorphingPopoverTrigger onClick={() => openAdd('work_experience')} style={MINI_ADD}>
                                                        <span style={{ color: '#1d4ed8', fontSize: 14, lineHeight: 1 }}>+</span>
                                                        <motion.span layout="position" layoutId="work-add-label">Add</motion.span>
                                                    </MorphingPopoverTrigger>
                                                    <MorphingPopoverContent style={popContentStyle}>
                                                        {SHEET_HANDLE}
                                                        <div style={POP_HEADER}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                <PopSectionIcon k="experience" />
                                                                <div>
                                                                    <motion.h4 layout="position" layoutId="work-add-label" style={POP_HEAD}>{editingIndex !== null ? 'Edit experience' : 'Add experience'}</motion.h4>
                                                                    <p style={POP_SUB}>Role, company, dates, and what you actually did — one bullet per line.</p>
                                                                </div>
                                                            </div>
                                                            <button onClick={() => { setAddingSection(null); setEditingIndex(null) }} style={POP_CLOSE_X} aria-label="Close">
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                                                            </button>
                                                        </div>
                                                        <div style={POP_BODY}>
                                                            {workEntries.map((w, i) => (
                                                                <div key={i} style={UM_ENTRY}>
                                                                    {editingIndex === null && workEntries.length > 1 && (
                                                                        <button onClick={() => setWorkEntries(prev => prev.filter((_, idx) => idx !== i))} style={UM_REMOVE_X} title="Remove">
                                                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                                                        </button>
                                                                    )}
                                                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                                                                        <div>
                                                                            <label style={{ ...UM_LABEL, marginTop: 0 }}>Role / Title</label>
                                                                            <input autoFocus={i === 0} style={UM_INPUT} placeholder="e.g. Java Full Stack Trainee" value={w.title} onChange={e => setWorkEntries(prev => { const u = [...prev]; u[i] = { ...u[i], title: e.target.value }; return u })} />
                                                                        </div>
                                                                        <div>
                                                                            <label style={{ ...UM_LABEL, marginTop: 0 }}>Company</label>
                                                                            <input style={UM_INPUT} placeholder="e.g. CODEGNAN" value={w.company} onChange={e => setWorkEntries(prev => { const u = [...prev]; u[i] = { ...u[i], company: e.target.value }; return u })} />
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '2fr 1fr 1fr', gap: 8 }}>
                                                                        <div>
                                                                            <label style={UM_LABEL}>Location</label>
                                                                            <input style={UM_INPUT} placeholder="Hyderabad, India" value={w.location} onChange={e => setWorkEntries(prev => { const u = [...prev]; u[i] = { ...u[i], location: e.target.value }; return u })} />
                                                                        </div>
                                                                        <div>
                                                                            <label style={UM_LABEL}>Start Date</label>
                                                                            <input style={UM_INPUT} placeholder="01/2024" value={w.start_date} onChange={e => setWorkEntries(prev => { const u = [...prev]; u[i] = { ...u[i], start_date: e.target.value }; return u })} />
                                                                        </div>
                                                                        <div>
                                                                            <label style={UM_LABEL}>End Date</label>
                                                                            <input style={UM_INPUT} placeholder="Present" value={w.end_date} onChange={e => setWorkEntries(prev => { const u = [...prev]; u[i] = { ...u[i], end_date: e.target.value }; return u })} />
                                                                        </div>
                                                                    </div>
                                                                    <label style={UM_LABEL}>Responsibilities (one per line)</label>
                                                                    <textarea style={{ ...UM_INPUT, resize: 'vertical', minHeight: 90 } as React.CSSProperties} placeholder="Start each with an action verb — Built, Led, Shipped…" value={w.responsibilities} onChange={e => setWorkEntries(prev => { const u = [...prev]; u[i] = { ...u[i], responsibilities: e.target.value }; return u })} />
                                                                    <label style={UM_LABEL}>Achievements (optional, one per line)</label>
                                                                    <textarea style={{ ...UM_INPUT, resize: 'vertical', minHeight: 56 } as React.CSSProperties} placeholder="Standout wins — awards, metrics, recognition" value={w.achievements} onChange={e => setWorkEntries(prev => { const u = [...prev]; u[i] = { ...u[i], achievements: e.target.value }; return u })} />
                                                                </div>
                                                            ))}
                                                            {editingIndex === null && (
                                                                <button onClick={() => setWorkEntries(p => [...p, EMPTY_WORK])} style={UM_ADD_MORE}>
                                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                                                                    Add Role
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div style={POP_FOOTER}>
                                                            <span style={{ fontSize: 12, color: '#94a3b8' }}>{editingIndex !== null ? 'Clear all fields then Save to delete this role · Esc to close' : `${workEntries.filter(w => w.title || w.company).length} ready to save · Esc to close`}</span>
                                                            <FormActions onSave={saveWork} onCancel={() => { setAddingSection(null); setEditingIndex(null) }} saving={savingSection === 'work_experience'} />
                                                        </div>
                                                    </MorphingPopoverContent>
                                                </MorphingPopover>
                                            </div>
                                            {preview.work.length === 0 ? (
                                                <p style={{ color: '#9ca3af', fontSize: 13 }}>No experience found — click + Add to enter your first role.</p>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingLeft: 22, position: 'relative' }}>
                                                    {preview.work.map((w, i) => (
                                                        <div key={i} style={{ position: 'relative' }} className="hover-edit-row">
                                                            {i < preview.work.length - 1 && <div style={S.timelineLine} />}
                                                            <div style={dot(i === 0)} />
                                                            <button onClick={() => openEdit('work_experience', i)} style={EDIT_PENCIL} aria-label="Edit experience" className="edit-pencil-btn">
                                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                                                            </button>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 3, paddingRight: 32 }}>
                                                                <h3 style={S.expTitle}>{w.position}</h3>
                                                                <span style={S.expDate}>{w.start} – {w.end}</span>
                                                            </div>
                                                            <p style={S.expCompany}>{w.company}</p>
                                                            {w.desc && (() => {
                                                                // Parser emits \n-separated bullets; render as a real list when there
                                                                // are 2+ lines so it reads like a resume, not a paragraph dump.
                                                                const lines = w.desc.split('\n').map(s => s.trim()).filter(Boolean)
                                                                if (lines.length <= 1) return <p style={S.expDesc}>{w.desc}</p>
                                                                return (
                                                                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                                        {lines.map((line, idx) => (
                                                                            <li key={idx} style={{ display: 'flex', gap: 9, fontSize: 13, color: '#4b5563', lineHeight: 1.55 }}>
                                                                                <span style={{ color: '#94a3b8', flexShrink: 0, marginTop: 7, width: 4, height: 4, borderRadius: '50%', background: '#cbd5e1' }} />
                                                                                <span>{line}</span>
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                )
                                                            })()}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Top Skills */}
                                        <div style={S.card}>
                                            <div style={SECTION_HEAD}>
                                                <h2 style={S.cardTitle}>Top Skills</h2>
                                                <MorphingPopover
                                                    open={addingSection === 'skills'}
                                                    onOpenChange={(o) => { if (!o) { setAddingSection(null); setEditingIndex(null) } }}
                                                    variants={POPOVER_VARIANTS}
                                                    transition={POPOVER_TRANSITION}
                                                >
                                                    <MorphingPopoverTrigger onClick={() => openAdd('skills')} style={MINI_ADD}>
                                                        <span style={{ color: '#1d4ed8', fontSize: 14, lineHeight: 1 }}>+</span>
                                                        <motion.span layout="position" layoutId="skills-add-label">Manage</motion.span>
                                                    </MorphingPopoverTrigger>
                                                    <MorphingPopoverContent style={popContentStyle}>
                                                        {SHEET_HANDLE}
                                                        <div style={POP_HEADER}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                <PopSectionIcon k="skills" />
                                                                <div>
                                                                    <motion.h4 layout="position" layoutId="skills-add-label" style={POP_HEAD}>Manage skills</motion.h4>
                                                                    <p style={POP_SUB}>Click × to remove. Type a skill and press Enter (or comma) to add.</p>
                                                                </div>
                                                            </div>
                                                            <button onClick={() => { setAddingSection(null); setEditingIndex(null) }} style={POP_CLOSE_X} aria-label="Close">
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                                                            </button>
                                                        </div>
                                                        <div style={POP_BODY}>
                                                            <div style={UM_ENTRY}>
                                                                <label style={{ ...UM_LABEL, marginTop: 0 }}>Current skills · {skillEntries.length}</label>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', minHeight: 36, marginBottom: 4 }}>
                                                                    {skillEntries.length === 0 ? (
                                                                        <span style={{ color: '#8dafd8', fontSize: 13, padding: '4px 0' }}>No skills yet — add some below.</span>
                                                                    ) : skillEntries.map((s, i) => (
                                                                        <span key={`${s}-${i}`} style={SKILL_CHIP}>
                                                                            {s}
                                                                            <button onClick={() => setSkillEntries(p => p.filter((_, idx) => idx !== i))} style={SKILL_REMOVE} aria-label={`Remove ${s}`}>×</button>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                                <label style={UM_LABEL}>Add a skill</label>
                                                                <input
                                                                    autoFocus
                                                                    style={UM_INPUT}
                                                                    placeholder="e.g. PostgreSQL, AWS Lambda, Tailwind CSS…"
                                                                    value={skillInput}
                                                                    onChange={e => setSkillInput(e.target.value)}
                                                                    onBlur={() => {
                                                                        // Commit pending text on blur so clicking Save (which blurs the input first) keeps the typed skill.
                                                                        const v = skillInput.trim().replace(/,$/, '').trim()
                                                                        if (v && !skillEntries.some(s => s.toLowerCase() === v.toLowerCase())) setSkillEntries(p => [...p, v])
                                                                        setSkillInput('')
                                                                    }}
                                                                    onKeyDown={e => {
                                                                        if (e.key === 'Enter' || e.key === ',') {
                                                                            e.preventDefault()
                                                                            const v = skillInput.trim().replace(/,$/, '').trim()
                                                                            if (v && !skillEntries.some(s => s.toLowerCase() === v.toLowerCase())) setSkillEntries(p => [...p, v])
                                                                            setSkillInput('')
                                                                        }
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div style={POP_FOOTER}>
                                                            <span style={{ fontSize: 12, color: '#94a3b8' }}>{skillEntries.length} skill{skillEntries.length === 1 ? '' : 's'} ready to save · Esc to close</span>
                                                            <FormActions onSave={saveSkills} onCancel={() => { setAddingSection(null); setEditingIndex(null) }} saving={savingSection === 'skills'} />
                                                        </div>
                                                    </MorphingPopoverContent>
                                                </MorphingPopover>
                                            </div>
                                            {preview.skills.length === 0 ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No skills yet — click + Manage to add.</p>
                                                : <div>{preview.skills.map((s, i) => <span key={i} style={S.skill}>{s}</span>)}</div>}
                                        </div>

                                        {/* Education */}
                                        <div style={S.card}>
                                            <div style={SECTION_HEAD}>
                                                <h2 style={S.cardTitle}>Education</h2>
                                                <MorphingPopover
                                                    open={addingSection === 'education'}
                                                    onOpenChange={(o) => { if (!o) { setAddingSection(null); setEditingIndex(null) } }}
                                                    variants={POPOVER_VARIANTS}
                                                    transition={POPOVER_TRANSITION}
                                                >
                                                    <MorphingPopoverTrigger onClick={() => openAdd('education')} style={MINI_ADD}>
                                                        <span style={{ color: '#1d4ed8', fontSize: 14, lineHeight: 1 }}>+</span>
                                                        <motion.span layout="position" layoutId="edu-add-label">Add</motion.span>
                                                    </MorphingPopoverTrigger>
                                                    <MorphingPopoverContent style={popContentStyle}>
                                                        {SHEET_HANDLE}
                                                        <div style={POP_HEADER}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                <PopSectionIcon k="education" />
                                                                <div>
                                                                    <motion.h4 layout="position" layoutId="edu-add-label" style={POP_HEAD}>{editingIndex !== null ? 'Edit education' : 'Add education'}</motion.h4>
                                                                    <p style={POP_SUB}>Institution, degree, field of study, dates, and GPA if it&apos;s strong.</p>
                                                                </div>
                                                            </div>
                                                            <button onClick={() => { setAddingSection(null); setEditingIndex(null) }} style={POP_CLOSE_X} aria-label="Close">
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                                                            </button>
                                                        </div>
                                                        <div style={POP_BODY}>
                                                            {eduEntries.map((e, i) => (
                                                                <div key={i} style={UM_ENTRY}>
                                                                    {editingIndex === null && eduEntries.length > 1 && (
                                                                        <button onClick={() => setEduEntries(prev => prev.filter((_, idx) => idx !== i))} style={UM_REMOVE_X} title="Remove">
                                                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                                                        </button>
                                                                    )}
                                                                    <label style={{ ...UM_LABEL, marginTop: 0 }}>School / University</label>
                                                                    <input autoFocus={i === 0} style={UM_INPUT} placeholder="e.g. Parul University" value={e.institution} onChange={ev => setEduEntries(prev => { const u = [...prev]; u[i] = { ...u[i], institution: ev.target.value }; return u })} />
                                                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                                                                        <div>
                                                                            <label style={UM_LABEL}>Degree</label>
                                                                            <input style={UM_INPUT} placeholder="B.Tech" value={e.degree} onChange={ev => setEduEntries(prev => { const u = [...prev]; u[i] = { ...u[i], degree: ev.target.value }; return u })} />
                                                                        </div>
                                                                        <div>
                                                                            <label style={UM_LABEL}>Field of Study</label>
                                                                            <input style={UM_INPUT} placeholder="Computer Science" value={e.field_of_study} onChange={ev => setEduEntries(prev => { const u = [...prev]; u[i] = { ...u[i], field_of_study: ev.target.value }; return u })} />
                                                                        </div>
                                                                        <div>
                                                                            <label style={UM_LABEL}>Graduation Date</label>
                                                                            <input style={UM_INPUT} placeholder="May 2024" value={e.graduation_date} onChange={ev => setEduEntries(prev => { const u = [...prev]; u[i] = { ...u[i], graduation_date: ev.target.value }; return u })} />
                                                                        </div>
                                                                        <div>
                                                                            <label style={UM_LABEL}>GPA (optional)</label>
                                                                            <input style={UM_INPUT} placeholder="3.8 or 70%" value={e.gpa} onChange={ev => setEduEntries(prev => { const u = [...prev]; u[i] = { ...u[i], gpa: ev.target.value }; return u })} />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            {editingIndex === null && (
                                                                <button onClick={() => setEduEntries(p => [...p, EMPTY_EDU])} style={UM_ADD_MORE}>
                                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                                                                    Add Education
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div style={POP_FOOTER}>
                                                            <span style={{ fontSize: 12, color: '#94a3b8' }}>{editingIndex !== null ? 'Clear all fields then Save to delete · Esc to close' : `${eduEntries.filter(e => e.institution || e.degree).length} ready to save · Esc to close`}</span>
                                                            <FormActions onSave={saveEducation} onCancel={() => { setAddingSection(null); setEditingIndex(null) }} saving={savingSection === 'education'} />
                                                        </div>
                                                    </MorphingPopoverContent>
                                                </MorphingPopover>
                                            </div>
                                            {preview.education.length === 0 ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No education yet — click + Add to enter your degree.</p>
                                                : preview.education.map((e, i) => (
                                                    <div key={i} style={{ marginBottom: 10, position: 'relative' }} className="hover-edit-row">
                                                        <button onClick={() => openEdit('education', i)} style={EDIT_PENCIL} aria-label="Edit education" className="edit-pencil-btn">
                                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                                                        </button>
                                                        <p style={{ fontWeight: 700, color: '#111827', margin: '0 0 1px', fontSize: 13, paddingRight: 32 }}>{e.degree}{e.field ? ` in ${e.field}` : ''}</p>
                                                        <p style={{ color: '#1d4ed8', fontSize: 12, fontWeight: 500, margin: '0 0 1px' }}>{e.institution}</p>
                                                        <p style={{ color: '#9ca3af', fontSize: 11, margin: 0 }}>{[e.grad, e.gpa ? `GPA ${e.gpa}` : ''].filter(Boolean).join(' · ')}</p>
                                                    </div>
                                                ))
                                            }
                                        </div>

                                        {/* Certifications */}
                                        <div style={S.yellowCard}>
                                            <h2 style={S.cardTitle}>Certifications</h2>
                                            {allCerts.length > 0 && (
                                                <div style={{ marginBottom: 10 }}>
                                                    {allCerts.map((c, i) => (
                                                        <div key={i} style={{ marginBottom: 7, position: 'relative' }} className="hover-edit-row">
                                                            <button onClick={() => openEdit('certifications', i)} style={EDIT_PENCIL} aria-label="Edit certification" className="edit-pencil-btn">
                                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                                                            </button>
                                                            <p style={{ fontWeight: 600, color: '#111827', fontSize: 13, margin: '0 0 1px', paddingRight: 32 }}>{c.name}</p>
                                                            <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>{c.issuer}{c.date ? ` · ${c.date}` : ''}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div style={{ marginTop: 'auto', paddingTop: 14, display: 'flex', justifyContent: 'center' }}>
                                                <MorphingPopover
                                                    open={addingSection === 'certifications'}
                                                    onOpenChange={(o) => { if (!o) { setAddingSection(null); setEditingIndex(null) } }}
                                                    variants={POPOVER_VARIANTS}
                                                    transition={POPOVER_TRANSITION}
                                                >
                                                    <MorphingPopoverTrigger onClick={() => openAdd('certifications')} style={{ ...S.addBtn, margin: 0 } as React.CSSProperties}>
                                                        <span style={{ color: '#d97706', fontSize: 16, lineHeight: 1 }}>+</span>
                                                        <motion.span layout="position" layoutId="cert-add-label">Add</motion.span>
                                                    </MorphingPopoverTrigger>
                                                    <MorphingPopoverContent style={popContentStyle}>
                                                        {SHEET_HANDLE}
                                                        <div style={POP_HEADER}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                <PopSectionIcon k="certifications" />
                                                                <div>
                                                                    <motion.h4 layout="position" layoutId="cert-add-label" style={POP_HEAD}>{editingIndex !== null ? 'Edit certification' : 'Add certifications'}</motion.h4>
                                                                    <p style={POP_SUB}>Cloud, security, frameworks — signals you took initiative beyond the syllabus.</p>
                                                                </div>
                                                            </div>
                                                            <button onClick={() => { setAddingSection(null); setEditingIndex(null) }} style={POP_CLOSE_X} aria-label="Close">
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                                                            </button>
                                                        </div>
                                                        <div style={POP_BODY}>
                                                            {certEntries.map((c, i) => (
                                                                <div key={i} style={UM_ENTRY}>
                                                                    {editingIndex === null && certEntries.length > 1 && (
                                                                        <button onClick={() => setCertEntries(prev => prev.filter((_, idx) => idx !== i))} style={UM_REMOVE_X} title="Remove">
                                                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                                                        </button>
                                                                    )}
                                                                    <label style={{ ...UM_LABEL, marginTop: 0 }}>Certification Name</label>
                                                                    <input autoFocus={i === 0} style={UM_INPUT} placeholder="e.g. AWS Certified Cloud Practitioner" value={c.name} onChange={e => setCertEntries(prev => { const u = [...prev]; u[i] = { ...u[i], name: e.target.value }; return u })} />
                                                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 8 }}>
                                                                        <div>
                                                                            <label style={UM_LABEL}>Issuer</label>
                                                                            <input style={UM_INPUT} placeholder="Amazon, Google, Microsoft…" value={c.issuer} onChange={e => setCertEntries(prev => { const u = [...prev]; u[i] = { ...u[i], issuer: e.target.value }; return u })} />
                                                                        </div>
                                                                        <div>
                                                                            <label style={UM_LABEL}>Year</label>
                                                                            <input style={UM_INPUT} placeholder="2024" value={c.date} onChange={e => setCertEntries(prev => { const u = [...prev]; u[i] = { ...u[i], date: e.target.value }; return u })} />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            {editingIndex === null && (
                                                                <button onClick={() => setCertEntries(p => [...p, EMPTY_CERT])} style={UM_ADD_MORE}>
                                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                                                                    Add Certification
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div style={POP_FOOTER}>
                                                            <span style={{ fontSize: 12, color: '#94a3b8' }}>{editingIndex !== null ? 'Clear all fields then Save to delete · Esc to close' : `${certEntries.filter(c => c.name).length} of ${certEntries.length} filled · Esc to close`}</span>
                                                            <FormActions onSave={saveCerts} onCancel={() => { setAddingSection(null); setEditingIndex(null) }} saving={savingSection === 'certifications'} />
                                                        </div>
                                                    </MorphingPopoverContent>
                                                </MorphingPopover>
                                            </div>
                                        </div>

                                        {/* Projects */}
                                        <div style={S.yellowCard}>
                                            <h2 style={S.cardTitle}>Projects</h2>
                                            {allProjects.length > 0 && (
                                                <div style={{ marginBottom: 10 }}>
                                                    {allProjects.slice(0, 3).map((p, i) => (
                                                        <div key={i} style={{ marginBottom: 7, position: 'relative' }} className="hover-edit-row">
                                                            <button onClick={() => openEdit('projects', i)} style={EDIT_PENCIL} aria-label="Edit project" className="edit-pencil-btn">
                                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                                                            </button>
                                                            <p style={{ fontWeight: 600, color: '#111827', fontSize: 13, margin: '0 0 1px', paddingRight: 32 }}>{p.name}</p>
                                                            {p.desc && <p style={{ color: '#6b7280', fontSize: 12, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.desc}</p>}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div style={{ marginTop: 'auto', paddingTop: 14, display: 'flex', justifyContent: 'center' }}>
                                                <MorphingPopover
                                                    open={addingSection === 'projects'}
                                                    onOpenChange={(o) => { if (!o) { setAddingSection(null); setEditingIndex(null) } }}
                                                    variants={POPOVER_VARIANTS}
                                                    transition={POPOVER_TRANSITION}
                                                >
                                                    <MorphingPopoverTrigger onClick={() => openAdd('projects')} style={{ ...S.addBtn, margin: 0 } as React.CSSProperties}>
                                                        <span style={{ color: '#d97706', fontSize: 16, lineHeight: 1 }}>+</span>
                                                        <motion.span layout="position" layoutId="project-add-label">Add</motion.span>
                                                    </MorphingPopoverTrigger>
                                                    <MorphingPopoverContent style={popContentStyle}>
                                                        {SHEET_HANDLE}
                                                        <div style={POP_HEADER}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                <PopSectionIcon k="projects" />
                                                                <div>
                                                                    <motion.h4 layout="position" layoutId="project-add-label" style={POP_HEAD}>Add a project</motion.h4>
                                                                    <p style={POP_SUB}>Show what you&apos;ve shipped — what it does, your role, the stack, and a link.</p>
                                                                </div>
                                                            </div>
                                                            <button onClick={() => setAddingSection(null)} style={POP_CLOSE_X} aria-label="Close">
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                                                            </button>
                                                        </div>
                                                        <div style={POP_BODY}>
                                                            {projectEntries.map((p, i) => (
                                                                <div key={i} style={UM_ENTRY}>
                                                                    {editingIndex === null && projectEntries.length > 1 && (
                                                                        <button onClick={() => setProjectEntries(prev => prev.filter((_, idx) => idx !== i))} style={UM_REMOVE_X} title="Remove">
                                                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                                                        </button>
                                                                    )}
                                                                    <label style={{ ...UM_LABEL, marginTop: 0 }}>Project Name</label>
                                                                    <input autoFocus={i === 0} style={UM_INPUT} placeholder="e.g. Travel Recommendation App" value={p.name} onChange={e => setProjectEntries(prev => { const u = [...prev]; u[i] = { ...u[i], name: e.target.value }; return u })} />
                                                                    <label style={UM_LABEL}>Description</label>
                                                                    <textarea style={{ ...UM_INPUT, resize: 'vertical', minHeight: 64 } as React.CSSProperties} placeholder="What it does + your role (1–2 sentences)" value={p.description} onChange={e => setProjectEntries(prev => { const u = [...prev]; u[i] = { ...u[i], description: e.target.value }; return u })} />
                                                                    <label style={UM_LABEL}>Tech Stack</label>
                                                                    <input style={UM_INPUT} placeholder="React, Node.js, PostgreSQL" value={p.technologies} onChange={e => setProjectEntries(prev => { const u = [...prev]; u[i] = { ...u[i], technologies: e.target.value }; return u })} />
                                                                    <label style={UM_LABEL}>Link (optional)</label>
                                                                    <input style={UM_INPUT} placeholder="Live demo / GitHub URL" value={p.link} onChange={e => setProjectEntries(prev => { const u = [...prev]; u[i] = { ...u[i], link: e.target.value }; return u })} />
                                                                </div>
                                                            ))}
                                                            {editingIndex === null && (
                                                                <button onClick={() => setProjectEntries(p => [...p, EMPTY_PROJECT])} style={UM_ADD_MORE}>
                                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                                                                    Add Project
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div style={POP_FOOTER}>
                                                            <span style={{ fontSize: 12, color: '#94a3b8' }}>{editingIndex !== null ? 'Clear all fields then Save to delete · Esc to close' : `${projectEntries.filter(p => p.name).length} of ${projectEntries.length} filled · Esc to close`}</span>
                                                            <FormActions onSave={saveProjects} onCancel={() => { setAddingSection(null); setEditingIndex(null) }} saving={savingSection === 'projects'} />
                                                        </div>
                                                    </MorphingPopoverContent>
                                                </MorphingPopover>
                                            </div>
                                        </div>

                                        {/* Achievements */}
                                        <div style={{ ...S.greenCard, gridColumn: 'span 1' }}>
                                            <h2 style={S.cardTitle}>Achievements & Awards</h2>
                                            {savedAchievs.length > 0 && (
                                                <div style={{ marginBottom: 10 }}>
                                                    {savedAchievs.map((a, i) => (
                                                        <div key={i} style={{ marginBottom: 7, position: 'relative' }} className="hover-edit-row">
                                                            <button onClick={() => openEdit('achievements', i)} style={EDIT_PENCIL} aria-label="Edit achievement" className="edit-pencil-btn">
                                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                                                            </button>
                                                            <p style={{ fontWeight: 600, color: '#111827', fontSize: 13, margin: '0 0 1px', paddingRight: 32 }}>{a.title}</p>
                                                            {a.description && <p style={{ color: '#6b7280', fontSize: 12, margin: '0 0 1px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{a.description}</p>}
                                                            {a.year && <p style={{ color: '#9ca3af', fontSize: 11, margin: 0 }}>{a.year}</p>}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div style={{ marginTop: 'auto', paddingTop: 14, display: 'flex', justifyContent: 'center' }}>
                                                <MorphingPopover
                                                    open={addingSection === 'achievements'}
                                                    onOpenChange={(o) => { if (!o) { setAddingSection(null); setEditingIndex(null) } }}
                                                    variants={POPOVER_VARIANTS}
                                                    transition={POPOVER_TRANSITION}
                                                >
                                                    <MorphingPopoverTrigger onClick={() => openAdd('achievements')} style={{ ...S.addBtn, margin: 0 } as React.CSSProperties}>
                                                        <span style={{ color: '#16a34a', fontSize: 16, lineHeight: 1 }}>+</span>
                                                        <motion.span layout="position" layoutId="achiev-add-label">Add</motion.span>
                                                    </MorphingPopoverTrigger>
                                                    <MorphingPopoverContent style={popContentStyle}>
                                                        {SHEET_HANDLE}
                                                        <div style={POP_HEADER}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                <PopSectionIcon k="achievements" />
                                                                <div>
                                                                    <motion.h4 layout="position" layoutId="achiev-add-label" style={POP_HEAD}>{editingIndex !== null ? 'Edit achievement' : 'Add achievements & awards'}</motion.h4>
                                                                    <p style={POP_SUB}>Hackathons, scholarships, rankings — anything that sets you apart from peers.</p>
                                                                </div>
                                                            </div>
                                                            <button onClick={() => { setAddingSection(null); setEditingIndex(null) }} style={POP_CLOSE_X} aria-label="Close">
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                                                            </button>
                                                        </div>
                                                        <div style={POP_BODY}>
                                                            {achievEntries.map((a, i) => (
                                                                <div key={i} style={UM_ENTRY}>
                                                                    {editingIndex === null && achievEntries.length > 1 && (
                                                                        <button onClick={() => setAchievEntries(prev => prev.filter((_, idx) => idx !== i))} style={UM_REMOVE_X} title="Remove">
                                                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                                                        </button>
                                                                    )}
                                                                    <label style={{ ...UM_LABEL, marginTop: 0 }}>Title</label>
                                                                    <input autoFocus={i === 0} style={UM_INPUT} placeholder="e.g. Winner — Smart India Hackathon" value={a.title} onChange={e => setAchievEntries(prev => { const u = [...prev]; u[i] = { ...u[i], title: e.target.value }; return u })} />
                                                                    <label style={UM_LABEL}>Context (scope, scale, impact)</label>
                                                                    <textarea style={{ ...UM_INPUT, resize: 'vertical', minHeight: 56 } as React.CSSProperties} placeholder="Quantify impact when possible — e.g. &quot;Increased X by 40%&quot;" value={a.description} onChange={e => setAchievEntries(prev => { const u = [...prev]; u[i] = { ...u[i], description: e.target.value }; return u })} />
                                                                    <label style={UM_LABEL}>Year</label>
                                                                    <input style={UM_INPUT} placeholder="2024" value={a.year} onChange={e => setAchievEntries(prev => { const u = [...prev]; u[i] = { ...u[i], year: e.target.value }; return u })} />
                                                                </div>
                                                            ))}
                                                            {editingIndex === null && (
                                                                <button onClick={() => setAchievEntries(p => [...p, EMPTY_ACHIEV])} style={UM_ADD_MORE}>
                                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                                                                    Add Achievement
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div style={POP_FOOTER}>
                                                            <span style={{ fontSize: 12, color: '#94a3b8' }}>{editingIndex !== null ? 'Clear all fields then Save to delete · Esc to close' : `${achievEntries.filter(a => a.title).length} of ${achievEntries.length} filled · Esc to close`}</span>
                                                            <FormActions onSave={saveAchievementsItems} onCancel={() => { setAddingSection(null); setEditingIndex(null) }} saving={savingSection === 'achievements'} />
                                                        </div>
                                                    </MorphingPopoverContent>
                                                </MorphingPopover>
                                            </div>
                                        </div>

                                        {/* Links / Portfolio */}
                                        <div style={{ ...S.purpleCard, gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                                            <h2 style={S.cardTitle}>Links & Portfolio</h2>
                                            {hasAnyLink ? (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                                                    {displayLinks.linkedin  && <LinkChip href={displayLinks.linkedin}  kind="linkedin"  />}
                                                    {displayLinks.github    && <LinkChip href={displayLinks.github}    kind="github"    />}
                                                    {displayLinks.portfolio && <LinkChip href={displayLinks.portfolio} kind="portfolio" />}
                                                    {displayLinks.other     && <LinkChip href={displayLinks.other}     kind="other" label="Other" />}
                                                </div>
                                            ) : null}
                                            <div style={{ marginTop: 'auto', paddingTop: 14, display: 'flex', justifyContent: 'center' }}>
                                                <MorphingPopover
                                                    open={addingSection === 'links'}
                                                    onOpenChange={(o) => { if (!o) { setAddingSection(null); setEditingIndex(null) } }}
                                                    variants={POPOVER_VARIANTS}
                                                    transition={POPOVER_TRANSITION}
                                                >
                                                    <MorphingPopoverTrigger onClick={() => openAdd('links')} style={{ ...S.addBtn, margin: 0 } as React.CSSProperties}>
                                                        <span style={{ color: '#7c3aed', fontSize: 16, lineHeight: 1 }}>+</span>
                                                        <motion.span layout="position" layoutId="links-add-label">{hasAnyLink ? 'Edit Links' : 'Add Links'}</motion.span>
                                                    </MorphingPopoverTrigger>
                                                    <MorphingPopoverContent style={popContentStyle}>
                                                        {SHEET_HANDLE}
                                                        <div style={POP_HEADER}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                <PopSectionIcon k="links" />
                                                                <div>
                                                                    <motion.h4 layout="position" layoutId="links-add-label" style={POP_HEAD}>Links & portfolio</motion.h4>
                                                                    <p style={POP_SUB}>Recruiters cold-stalk these. Paste full URLs so they&apos;re one click away.</p>
                                                                </div>
                                                            </div>
                                                            <button onClick={() => { setAddingSection(null); setEditingIndex(null) }} style={POP_CLOSE_X} aria-label="Close">
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                                                            </button>
                                                        </div>
                                                        <div style={POP_BODY}>
                                                            <div style={UM_ENTRY}>
                                                                <label style={{ ...UM_LABEL, marginTop: 0 }}>LinkedIn</label>
                                                                <input autoFocus style={UM_INPUT} placeholder="https://linkedin.com/in/your-handle" value={linkEntry.linkedin} onChange={e => setLinkEntry(p => ({ ...p, linkedin: e.target.value }))} />
                                                                <label style={UM_LABEL}>GitHub</label>
                                                                <input style={UM_INPUT} placeholder="https://github.com/your-handle" value={linkEntry.github} onChange={e => setLinkEntry(p => ({ ...p, github: e.target.value }))} />
                                                                <label style={UM_LABEL}>Portfolio</label>
                                                                <input style={UM_INPUT} placeholder="https://yoursite.com" value={linkEntry.portfolio} onChange={e => setLinkEntry(p => ({ ...p, portfolio: e.target.value }))} />
                                                                <label style={UM_LABEL}>Other</label>
                                                                <input style={UM_INPUT} placeholder="Medium, Behance, Dribbble…" value={linkEntry.other} onChange={e => setLinkEntry(p => ({ ...p, other: e.target.value }))} />
                                                            </div>
                                                        </div>
                                                        <div style={POP_FOOTER}>
                                                            <span style={{ fontSize: 12, color: '#94a3b8' }}>{[linkEntry.linkedin, linkEntry.github, linkEntry.portfolio, linkEntry.other].filter(Boolean).length} of 4 filled · Esc to close</span>
                                                            <FormActions onSave={() => handleSaveSection('links', linkEntry)} onCancel={() => { setAddingSection(null); setEditingIndex(null) }} saving={savingSection === 'links'} />
                                                        </div>
                                                    </MorphingPopoverContent>
                                                </MorphingPopover>
                                            </div>
                                        </div>

                                    </div>

                                    {/* ── AI Profile Assessment Card ── */}
                                    {(analysisLoading || resumeAnalysis) && (
                                        <div style={{ marginTop: 20 }}>
                                            <style>{`
                                                @keyframes scan { 0%{transform:translateX(-100%)} 100%{transform:translateX(400%)} }
                                                @keyframes fade-in-up { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
                                                .assess-card { animation: fade-in-up 0.5s ease both; }
                                                .score-ring-fill { transition: stroke-dashoffset 1.4s cubic-bezier(0.34,1.56,0.64,1); }
                                                .expand-btn:hover { background: #f8fafc !important; }
                                                .assess-asset-card:hover { border-color: #6ee7b7 !important; }
                                                .assess-action-card:hover { border-color: #135bec !important; }
                                                .pb-card:hover { border-color: #cbd5e1 !important; box-shadow: 0 2px 12px rgba(15,23,42,0.06); transform: translateY(-1px); }
                                            `}</style>

                                            {analysisLoading && !resumeAnalysis ? (
                                                // Loading skeleton — white
                                                <div style={{
                                                    borderRadius: 14,
                                                    background: '#fff',
                                                    border: '1px solid #e5e7eb',
                                                    padding: '28px 32px',
                                                    overflow: 'hidden',
                                                    position: 'relative',
                                                    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                                                }}>
                                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #135bec, transparent)', animation: 'scan 1.8s ease-in-out infinite' }} />
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                                                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#135bec', boxShadow: '0 0 8px rgba(19,91,236,0.4)' }} />
                                                        <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#94a3b8' }}>AI Analyzing your profile…</span>
                                                    </div>
                                                    {[75, 55, 85, 45].map((w, i) => (
                                                        <div key={i} style={{ height: 9, background: '#f1f5f9', borderRadius: 6, marginBottom: 10, width: `${w}%` }} />
                                                    ))}
                                                </div>
                                            ) : resumeAnalysis ? (
                                                // Populated card — clean white
                                                <div className="assess-card" style={{
                                                    borderRadius: 14,
                                                    background: '#fff',
                                                    border: '1px solid #e5e7eb',
                                                    overflow: 'hidden',
                                                    boxShadow: '0 4px 20px rgba(0,0,0,0.07)',
                                                }}>
                                                    {/* Header bar */}
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        padding: isMobile ? '8px 14px' : '11px 24px',
                                                        borderBottom: '1px solid #f1f5f9',
                                                        background: '#fafafa',
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#135bec', boxShadow: '0 0 5px rgba(19,91,236,0.35)' }} />
                                                            <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#94a3b8' }}>AI Profile Assessment</span>
                                                        </div>
                                                        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#cbd5e1', letterSpacing: '0.06em' }}>GPT-4.1 · Career Coach</span>
                                                    </div>

                                                    {/* Main content */}
                                                    <div style={{ padding: isMobile ? '12px 14px' : '24px 28px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: isMobile ? 10 : 28, alignItems: 'start' }}>
                                                        {/* Score ring — 80px on mobile, 112px on desktop */}
                                                        {(() => { const rs = isMobile ? 80 : 112; const rc = rs/2; const rr = isMobile ? 33 : 46; const rsw = isMobile ? 5 : 7; const circ = 2 * Math.PI * rr; return (
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, justifySelf: 'start' }}>
                                                            <div style={{ position: 'relative', width: rs, height: rs }}>
                                                                <svg width={rs} height={rs} viewBox={`0 0 ${rs} ${rs}`} style={{ transform: 'rotate(-90deg)' }}>
                                                                    <circle cx={rc} cy={rc} r={rr} fill="transparent" stroke="#f1f5f9" strokeWidth={rsw}/>
                                                                    <circle cx={rc} cy={rc} r={rr} fill="transparent"
                                                                        stroke={resumeAnalysis.market_readiness_score >= 7 ? '#10b981' : resumeAnalysis.market_readiness_score >= 5 ? '#f59e0b' : '#ef4444'}
                                                                        strokeWidth={rsw} strokeLinecap="round"
                                                                        className="score-ring-fill"
                                                                        strokeDasharray={circ}
                                                                        strokeDashoffset={circ * (1 - resumeAnalysis.market_readiness_score / 10)}
                                                                    />
                                                                </svg>
                                                                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                                                                    <span style={{ fontFamily: 'monospace', fontSize: isMobile ? '1.2rem' : '1.6rem', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
                                                                        {resumeAnalysis.market_readiness_score.toFixed(1)}
                                                                    </span>
                                                                    <span style={{ fontFamily: 'monospace', fontSize: '0.5rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>/10</span>
                                                                </div>
                                                            </div>
                                                            <span style={{ fontFamily: 'monospace', fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: resumeAnalysis.market_readiness_score >= 7 ? '#10b981' : resumeAnalysis.market_readiness_score >= 5 ? '#f59e0b' : '#ef4444' }}>
                                                                {resumeAnalysis.market_readiness_score >= 7 ? 'Strong' : resumeAnalysis.market_readiness_score >= 5 ? 'Developing' : 'Early Stage'}
                                                            </span>
                                                        </div>
                                                        ); })()}

                                                        {/* Right side content */}
                                                        <div>
                                                            {/* Headline */}
                                                            <p style={{ fontFamily: "'Georgia', serif", fontSize: '1rem', fontWeight: 400, fontStyle: 'italic', color: '#374151', margin: '0 0 16px', lineHeight: 1.6, borderLeft: '3px solid #135bec', paddingLeft: 14 }}>
                                                                {resumeAnalysis.headline}
                                                            </p>

                                                            {/* Two column: asset + action */}
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                                                                <div className="assess-asset-card" style={{ padding: isMobile ? '8px 10px' : '12px 14px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', transition: 'border-color 0.15s' }}>
                                                                    <div style={{ fontFamily: 'monospace', fontSize: '0.52rem', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.13em', marginBottom: 6 }}>Your Biggest Asset</div>
                                                                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: isMobile ? '0.72rem' : '0.775rem', color: '#15803d', margin: 0, lineHeight: 1.5 }}>{resumeAnalysis.biggest_asset}</p>
                                                                </div>
                                                                <div className="assess-action-card" style={{ padding: isMobile ? '8px 10px' : '12px 14px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', transition: 'border-color 0.15s' }}>
                                                                    <div style={{ fontFamily: 'monospace', fontSize: '0.52rem', fontWeight: 700, color: '#135bec', textTransform: 'uppercase', letterSpacing: '0.13em', marginBottom: 6 }}>Top Action</div>
                                                                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: isMobile ? '0.72rem' : '0.775rem', color: '#1e40af', margin: 0, lineHeight: 1.5 }}>{resumeAnalysis.top_action}</p>
                                                                </div>
                                                            </div>

                                                            {/* Strengths + Gaps */}
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? 8 : 12 }}>
                                                                <div>
                                                                    <div style={{ fontFamily: 'monospace', fontSize: '0.52rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Strengths</div>
                                                                    {(resumeAnalysis.strengths || []).map((s, i) => (
                                                                        <div key={i} style={{ display: 'flex', gap: 5, alignItems: 'flex-start', marginBottom: 5 }}>
                                                                            <span style={{ color: '#10b981', flexShrink: 0, marginTop: 2, fontSize: 9 }}>✓</span>
                                                                            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: isMobile ? '0.68rem' : '0.75rem', color: '#475569', lineHeight: 1.45 }}>{s}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontFamily: 'monospace', fontSize: '0.52rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Gaps to Close</div>
                                                                    {(resumeAnalysis.gaps || []).map((g, i) => (
                                                                        <div key={i} style={{ display: 'flex', gap: 5, alignItems: 'flex-start', marginBottom: 5 }}>
                                                                            <span style={{ color: '#ef4444', flexShrink: 0, marginTop: 2, fontSize: 9 }}>○</span>
                                                                            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: isMobile ? '0.68rem' : '0.75rem', color: '#475569', lineHeight: 1.45 }}>{g}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Playbook — 4 concrete actions: roles, companies, cuts, certs */}
                                                    {(resumeAnalysis.recommended_roles?.length || resumeAnalysis.target_companies || resumeAnalysis.cut_or_condense?.length || resumeAnalysis.recommended_certifications?.length) ? (
                                                        <div style={{ borderTop: '1px solid #f1f5f9', padding: isMobile ? '14px 14px 16px' : '20px 28px 22px', background: 'linear-gradient(180deg, #fafbfc 0%, #ffffff 100%)' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
                                                                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#135bec' }} />
                                                                <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.16em' }}>Your Playbook</span>
                                                                <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #e5e7eb 0%, transparent 80%)' }} />
                                                                <span style={{ fontFamily: 'monospace', fontSize: '0.6rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>4 moves</span>
                                                            </div>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

                                                                {/* 1. Recommended roles */}
                                                                {(resumeAnalysis.recommended_roles?.length ?? 0) > 0 && (
                                                                    <div className="pb-card" style={{ padding: '14px 16px', borderRadius: 10, background: '#fff', border: '1px solid #e5e7eb', transition: 'all 0.18s ease' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                                                                            <div style={{ width: 24, height: 24, borderRadius: 7, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#135bec" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-3V4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/></svg>
                                                                            </div>
                                                                            <span style={{ fontFamily: 'monospace', fontSize: '0.66rem', fontWeight: 700, color: '#135bec', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Apply To These Roles</span>
                                                                        </div>
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                                            {resumeAnalysis.recommended_roles!.map((r, i) => {
                                                                                const fitDots = r.fit === 'strong' ? 3 : r.fit === 'okay' ? 2 : 1
                                                                                const fitColor = r.fit === 'strong' ? '#10b981' : r.fit === 'okay' ? '#f59e0b' : '#94a3b8'
                                                                                return (
                                                                                    <div key={i}>
                                                                                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                                                                                            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', lineHeight: 1.35 }}>{r.role}</span>
                                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }} title={r.fit + ' fit'}>
                                                                                                {[0, 1, 2].map(d => (
                                                                                                    <span key={d} style={{ width: 6, height: 6, borderRadius: '50%', background: d < fitDots ? fitColor : '#e2e8f0' }} />
                                                                                                ))}
                                                                                            </span>
                                                                                        </div>
                                                                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '0.85rem', color: '#475569', margin: 0, lineHeight: 1.55 }}>{r.why}</p>
                                                                                    </div>
                                                                                )
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* 2. Target companies */}
                                                                {resumeAnalysis.target_companies && (
                                                                    <div className="pb-card" style={{ padding: '14px 16px', borderRadius: 10, background: '#fff', border: '1px solid #e5e7eb', transition: 'all 0.18s ease' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                                                                            <div style={{ width: 24, height: 24, borderRadius: 7, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/><line x1="9" y1="9" x2="9" y2="9"/><line x1="9" y1="13" x2="9" y2="13"/><line x1="9" y1="17" x2="9" y2="17"/></svg>
                                                                            </div>
                                                                            <span style={{ fontFamily: 'monospace', fontSize: '0.66rem', fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Target Companies</span>
                                                                        </div>
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                                                                            {[
                                                                                { label: 'Start here', value: resumeAnalysis.target_companies.start_here, color: '#10b981', labelColor: '#10b981', bg: '#f0fdf4', glyph: '▶' },
                                                                                { label: 'Stretch for', value: resumeAnalysis.target_companies.stretch_for, color: '#d97706', labelColor: '#d97706', bg: '#fffbeb', glyph: '↗' },
                                                                                { label: 'Skip for now', value: resumeAnalysis.target_companies.skip_for_now, color: '#64748b', labelColor: '#475569', bg: '#f1f5f9', glyph: '✕' },
                                                                            ].filter(t => t.value).map((tier, i) => (
                                                                                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 5, background: tier.bg, color: tier.color, fontFamily: 'monospace', fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{tier.glyph}</span>
                                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                                        <div style={{ fontFamily: 'monospace', fontSize: '0.6rem', fontWeight: 700, color: tier.labelColor, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 2 }}>{tier.label}</div>
                                                                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '0.875rem', color: '#1e293b', margin: 0, lineHeight: 1.5 }}>{tier.value}</p>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* 3. Cut or condense */}
                                                                {(resumeAnalysis.cut_or_condense?.length ?? 0) > 0 && (
                                                                    <div className="pb-card" style={{ padding: '14px 16px', borderRadius: 10, background: '#fff', border: '1px solid #e5e7eb', transition: 'all 0.18s ease' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                                                                            <div style={{ width: 24, height: 24, borderRadius: 7, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
                                                                            </div>
                                                                            <span style={{ fontFamily: 'monospace', fontSize: '0.66rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Cut From Your Resume</span>
                                                                        </div>
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                                            {resumeAnalysis.cut_or_condense!.map((item, i) => (
                                                                                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 5, background: '#fef2f2', color: '#dc2626', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>−</span>
                                                                                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '0.875rem', color: '#1e293b', margin: 0, lineHeight: 1.55 }}>{item}</p>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* 4. Recommended certifications */}
                                                                {(resumeAnalysis.recommended_certifications?.length ?? 0) > 0 && (
                                                                    <div className="pb-card" style={{ padding: '14px 16px', borderRadius: 10, background: '#fff', border: '1px solid #e5e7eb', transition: 'all 0.18s ease' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                                                                            <div style={{ width: 24, height: 24, borderRadius: 7, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                                                                            </div>
                                                                            <span style={{ fontFamily: 'monospace', fontSize: '0.66rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Chase These Certifications</span>
                                                                        </div>
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                                            {resumeAnalysis.recommended_certifications!.map((c, i) => {
                                                                                const pColor = c.priority === 'high' ? '#059669' : c.priority === 'medium' ? '#d97706' : '#64748b'
                                                                                const pBg = c.priority === 'high' ? '#ecfdf5' : c.priority === 'medium' ? '#fffbeb' : '#f1f5f9'
                                                                                return (
                                                                                    <div key={i}>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4, flexWrap: 'wrap' }}>
                                                                                            <span style={{ padding: '3px 8px', borderRadius: 4, background: pBg, color: pColor, fontFamily: 'monospace', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', lineHeight: 1.3 }}>{c.priority}</span>
                                                                                            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', lineHeight: 1.3 }}>{c.name}</span>
                                                                                        </div>
                                                                                        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '0.85rem', color: '#475569', margin: 0, lineHeight: 1.55 }}>{c.reason}</p>
                                                                                    </div>
                                                                                )
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : null}

                                                    {/* Expandable full assessment */}
                                                    {resumeAnalysis.full_assessment && (
                                                        <div style={{ borderTop: '1px solid #f1f5f9' }}>
                                                            <button
                                                                className="expand-btn"
                                                                onClick={() => setAssessmentExpanded(p => !p)}
                                                                style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: isMobile ? '10px 14px' : '10px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'background 0.15s', borderRadius: '0 0 14px 14px' }}
                                                            >
                                                                <span style={{ fontFamily: 'monospace', fontSize: '0.52rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.13em' }}>Full Assessment</span>
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" style={{ transform: assessmentExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                                                                    <polyline points="6 9 12 15 18 9"/>
                                                                </svg>
                                                            </button>
                                                            {assessmentExpanded && (
                                                                <div style={{ padding: isMobile ? '0 14px 20px' : '0 28px 24px' }}>
                                                                    {resumeAnalysis.full_assessment.split('\n\n').map((para, i) => (
                                                                        <p key={i} style={{ fontFamily: "'Inter', sans-serif", fontSize: '0.825rem', color: '#64748b', lineHeight: 1.75, margin: '0 0 14px' }}>{para}</p>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : null}
                                        </div>
                                    )}

                                </>

                            ) : selectedResume ? (
                                /* Resume row exists but structured_data not yet written by n8n */
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 280, gap: 14 }}>
                                    <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #e5e7eb', borderTopColor: '#1d4ed8', animation: 'spin 0.8s linear infinite' }} />
                                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                                    <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>Parsing your resume…</p>
                                    <p style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>This usually takes 10–30 seconds</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 280, color: '#9ca3af', fontSize: 14 }}>
                                    Select a resume or upload a new one.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Bottom Action Bar */}
                    <div style={{ ...S.bar, ...(isMobile ? { padding: '10px 14px' } : {}) }}>
                        <div style={{ ...S.barInfo, ...(isMobile ? { fontSize: 11 } : {}) }}>
                            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                            {lastSaved ? <><span>Last saved</span><strong style={{ color: '#111827', marginLeft: 3 }}>{Math.max(1, Math.floor((Date.now() - lastSaved.getTime()) / 60000))} min ago</strong></> : <span>No unsaved changes</span>}
                        </div>
                        <div style={{ display: 'flex', gap: isMobile ? 7 : 10, alignItems: 'center', ...(isMobile ? { paddingRight: 60 } : {}) }}>
                            {!isMobile && <button onClick={() => { setAddingSection(null); setEditingIndex(null); setCertEntries([EMPTY_CERT]); setProjectEntries([EMPTY_PROJECT]); setAchievEntries([EMPTY_ACHIEV]); setLinkEntry(EMPTY_LINKS); setWorkEntries([EMPTY_WORK]); setEduEntries([EMPTY_EDU]) }} style={S.discardBtn}>Discard Changes</button>}
                            <button onClick={() => {
                                if (addingSection === 'work_experience') saveWork()
                                else if (addingSection === 'education')  saveEducation()
                                else if (addingSection === 'skills')     saveSkills()
                                else if (addingSection === 'certifications') saveCerts()
                                else if (addingSection === 'projects')   saveProjects()
                                else if (addingSection === 'achievements') saveAchievementsItems()
                                else if (addingSection === 'links')      handleSaveSection('links', linkEntry)
                            }} style={{ ...S.saveBtn, ...(isMobile ? { padding: '8px 14px', fontSize: 12 } : {}) }}>Save Changes</button>
                            <button onClick={() => router.push('/dashboard/matches')} style={{ ...S.matchBtn, ...(isMobile ? { padding: '8px 12px', fontSize: 12 } : {}) }}>
                                Find Best Matches
                                <svg width="13" height="13" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" fillRule="evenodd" /></svg>
                            </button>
                        </div>
                    </div>
                </main>

            </div>{/* end body */}

            <style>{`
                .resume-item:hover .delete-btn { opacity: 1 !important; }
                .resume-item:hover .use-btn    { display: inline-flex !important; }
                .delete-btn { opacity: 0; transition: opacity 0.15s; }
                .edit-pencil-btn { opacity: 1; }
                .edit-pencil-btn:hover { background: #dbeafe !important; color: #1d4ed8 !important; border-color: #bfdbfe !important; }
            `}</style>
        </div>
    )
}
