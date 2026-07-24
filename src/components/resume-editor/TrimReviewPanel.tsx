'use client'

import type { TrimChanges } from '@/lib/resume-edit/trimToFit'

/**
 * One-batch review screen for "Trim with AI" (One-Page Optimizer). Shows
 * every proposed change across Experience/Projects/Certifications/Summary
 * with a single Apply/Cancel for the whole batch — see
 * docs/superpowers/specs/2026-07-24-trim-with-ai-design.md §3.
 */
export default function TrimReviewPanel({
    changes, onApply, onCancel,
}: {
    changes: TrimChanges
    onApply: () => void
    onCancel: () => void
}) {
    return (
        <div
            onClick={e => { if (e.target === e.currentTarget) onCancel() }}
            style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
            <div style={{ background: '#fff', borderRadius: 18, width: 560, maxWidth: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 28px 70px rgba(15,23,42,0.18)' }}>
                <div style={{ padding: '22px 26px 14px', borderBottom: '1px solid #F1F5F9' }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', margin: 0 }}>Trim with AI — review changes</h2>
                    <p style={{ fontSize: 13, color: '#64748B', margin: '6px 0 0' }}>Tightened wording, kept the substance. Apply to update your resume, or cancel to leave it as-is.</p>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 26px' }}>
                    {changes.summary && (
                        <TrimSection title="Summary">
                            <BeforeAfterText before={changes.summary.before} after={changes.summary.after} />
                        </TrimSection>
                    )}

                    {changes.experience.map(c => (
                        <TrimSection key={`exp-${c.index}`} title={`Experience — ${c.company}`} meta={`${c.before.length} bullets → ${c.after.length} bullets`}>
                            <BeforeAfterList before={c.before} after={c.after} />
                        </TrimSection>
                    ))}

                    {changes.projects.map(c => (
                        <TrimSection key={`proj-${c.index}`} title={`Project — ${c.name}`} meta={c.demoted ? 'Kept — name only' : `${c.before.length} bullets → ${c.after.length} bullets`}>
                            <BeforeAfterList before={c.before} after={c.after} />
                        </TrimSection>
                    ))}

                    {changes.certifications && (
                        <TrimSection title="Certifications" meta={`${changes.certifications.before.length} → ${changes.certifications.after.length}`}>
                            <BeforeAfterList before={changes.certifications.before} after={changes.certifications.after} />
                        </TrimSection>
                    )}
                </div>

                <div style={{ padding: '14px 26px 20px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button onClick={onCancel} style={{ padding: '10px 20px', borderRadius: 9999, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#64748B' }}>Cancel</button>
                    <button onClick={onApply} style={{ padding: '10px 24px', borderRadius: 9999, background: '#135bec', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>Apply trim</button>
                </div>
            </div>
        </div>
    )
}

function TrimSection({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{title}</span>
                {meta && <span style={{ fontSize: 11.5, color: '#94A3B8', fontFamily: 'monospace' }}>{meta}</span>}
            </div>
            {children}
        </div>
    )
}

function BeforeAfterText({ before, after }: { before: string; after: string }) {
    return (
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 4px', color: '#94A3B8', textDecoration: 'line-through' }}>{before}</p>
            <p style={{ margin: 0, color: '#0F172A' }}>{after}</p>
        </div>
    )
}

function BeforeAfterList({ before, after }: { before: string[]; after: string[] }) {
    return (
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            {before.map((b, i) => (
                <p key={`b-${i}`} style={{ margin: '0 0 2px', color: '#94A3B8', textDecoration: 'line-through' }}>• {b}</p>
            ))}
            {after.length === 0 && <p style={{ margin: '2px 0 0', color: '#135bec', fontStyle: 'italic' }}>Demoted to name only — no bullets shown.</p>}
            {after.map((a, i) => (
                <p key={`a-${i}`} style={{ margin: '2px 0 0', color: '#0F172A' }}>• {a}</p>
            ))}
        </div>
    )
}
