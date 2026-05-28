'use client'

import React, { useState } from 'react'

// ── Types ────────────────────────────────────────────────────

export interface GapData {
    certifications?: string[]
    achievements?: string[]
    projects?: { name: string; description: string; tech: string; link?: string }[]
    links?: { github?: string; linkedin?: string; portfolio?: string }
    leadership?: { org: string; role: string; dateRange: string; bullets: string[] }[]
}

interface GapFormWizardProps {
    resumeId: string
    sectionsToAsk: string[]
    onComplete: (gapData: GapData) => void
    onClose: () => void
}

// ── Design tokens ────────────────────────────────────────────
const T = {
    primary: '#135bec',
    primaryDark: '#0f4cc7',
    bg: '#f8fafc',
    surface: '#ffffff',
    border: '#e2e8f0',
    text: '#0f172a',
    textSecondary: '#64748b',
    textMuted: '#94a3b8',
    radius: '10px',
    radiusSm: '7px',
}

// ── Section configs ──────────────────────────────────────────
const SECTION_CONFIG: Record<string, { icon: string; title: string; subtitle: string }> = {
    certifications: {
        icon: '🎓',
        title: 'Add Your Certifications',
        subtitle: 'AWS, Google Cloud, CompTIA, Coursera certificates, etc.',
    },
    achievements: {
        icon: '🏆',
        title: 'Add Your Achievements',
        subtitle: 'Hackathons, awards, academic honors, competitions',
    },
    projects: {
        icon: '💻',
        title: 'Add Your Projects',
        subtitle: 'Personal projects, open source contributions, college projects',
    },
    links: {
        icon: '🔗',
        title: 'Add Your Profile Links',
        subtitle: 'GitHub, LinkedIn, portfolio website',
    },
    leadership: {
        icon: '👥',
        title: 'Add Leadership & Volunteering',
        subtitle: 'Club roles, volunteer work, team leads, community activities',
    },
}

// ── Input component ──────────────────────────────────────────
function Input({
    value,
    onChange,
    placeholder,
    type = 'text',
}: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    type?: string
}) {
    return (
        <input
            type={type}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            style={{
                width: '100%', padding: '8px 12px', borderRadius: T.radiusSm,
                border: `1px solid ${T.border}`, fontSize: '0.875rem',
                color: T.text, background: T.surface, outline: 'none',
                boxSizing: 'border-box',
            }}
        />
    )
}

// ── Dynamic list of text inputs ──────────────────────────────
function StringListEditor({
    items,
    onChange,
    placeholder,
}: {
    items: string[]
    onChange: (items: string[]) => void
    placeholder: string
}) {
    function update(i: number, v: string) {
        const next = [...items]
        next[i] = v
        onChange(next)
    }
    function remove(i: number) {
        onChange(items.filter((_, idx) => idx !== i))
    }
    function add() {
        onChange([...items, ''])
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Input value={item} onChange={v => update(i, v)} placeholder={placeholder} />
                    <button
                        onClick={() => remove(i)}
                        style={{
                            flexShrink: 0, width: 28, height: 28, borderRadius: 6,
                            border: `1px solid ${T.border}`, background: '#fff',
                            cursor: 'pointer', color: T.textMuted, fontSize: '1rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        ×
                    </button>
                </div>
            ))}
            <button
                onClick={add}
                style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: T.radiusSm,
                    border: `1px dashed ${T.border}`, background: 'transparent',
                    color: T.textSecondary, cursor: 'pointer', fontSize: '0.8125rem',
                    width: 'fit-content',
                }}
            >
                <span style={{ fontSize: '1rem', lineHeight: 1 }}>+</span> Add item
            </button>
        </div>
    )
}

// ── Step renderers ────────────────────────────────────────────
function CertificationsStep({ data, onChange }: { data: string[]; onChange: (v: string[]) => void }) {
    return <StringListEditor items={data} onChange={onChange} placeholder="e.g. AWS Solutions Architect – Associate" />
}

function AchievementsStep({ data, onChange }: { data: string[]; onChange: (v: string[]) => void }) {
    return <StringListEditor items={data} onChange={onChange} placeholder="e.g. Won Smart India Hackathon 2024" />
}

function ProjectsStep({
    data,
    onChange,
}: {
    data: { name: string; description: string; tech: string; link?: string }[]
    onChange: (v: { name: string; description: string; tech: string; link?: string }[]) => void
}) {
    function update(i: number, field: string, value: string) {
        const next = data.map((p, idx) => idx === i ? { ...p, [field]: value } : p)
        onChange(next)
    }
    function remove(i: number) {
        onChange(data.filter((_, idx) => idx !== i))
    }
    function add() {
        onChange([...data, { name: '', description: '', tech: '', link: '' }])
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {data.map((proj, i) => (
                <div key={i} style={{ padding: 12, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, background: T.bg }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: T.textSecondary }}>Project {i + 1}</span>
                        <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: '1rem' }}>×</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <Input value={proj.name} onChange={v => update(i, 'name', v)} placeholder="Project name" />
                        <Input value={proj.description} onChange={v => update(i, 'description', v)} placeholder="Brief description" />
                        <Input value={proj.tech} onChange={v => update(i, 'tech', v)} placeholder="Technologies (comma-separated)" />
                        <Input value={proj.link ?? ''} onChange={v => update(i, 'link', v)} placeholder="GitHub / live link (optional)" />
                    </div>
                </div>
            ))}
            <button
                onClick={add}
                style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: T.radiusSm,
                    border: `1px dashed ${T.border}`, background: 'transparent',
                    color: T.textSecondary, cursor: 'pointer', fontSize: '0.8125rem', width: 'fit-content',
                }}
            >
                <span style={{ fontSize: '1rem', lineHeight: 1 }}>+</span> Add project
            </button>
        </div>
    )
}

function LinksStep({
    data,
    onChange,
}: {
    data: { github?: string; linkedin?: string; portfolio?: string }
    onChange: (v: { github?: string; linkedin?: string; portfolio?: string }) => void
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
                <div style={{ fontSize: '0.8rem', color: T.textSecondary, marginBottom: 4 }}>GitHub</div>
                <Input value={data.github ?? ''} onChange={v => onChange({ ...data, github: v })} placeholder="https://github.com/yourname" />
            </div>
            <div>
                <div style={{ fontSize: '0.8rem', color: T.textSecondary, marginBottom: 4 }}>LinkedIn</div>
                <Input value={data.linkedin ?? ''} onChange={v => onChange({ ...data, linkedin: v })} placeholder="https://linkedin.com/in/yourname" />
            </div>
            <div>
                <div style={{ fontSize: '0.8rem', color: T.textSecondary, marginBottom: 4 }}>Portfolio (optional)</div>
                <Input value={data.portfolio ?? ''} onChange={v => onChange({ ...data, portfolio: v })} placeholder="https://yourportfolio.com" />
            </div>
        </div>
    )
}

function LeadershipStep({
    data,
    onChange,
}: {
    data: { org: string; role: string; dateRange: string; bullets: string[] }[]
    onChange: (v: { org: string; role: string; dateRange: string; bullets: string[] }[]) => void
}) {
    function update(i: number, field: string, value: string | string[]) {
        const next = data.map((l, idx) => idx === i ? { ...l, [field]: value } : l)
        onChange(next)
    }
    function remove(i: number) {
        onChange(data.filter((_, idx) => idx !== i))
    }
    function add() {
        onChange([...data, { org: '', role: '', dateRange: '', bullets: [] }])
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {data.map((lead, i) => (
                <div key={i} style={{ padding: 12, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, background: T.bg }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: T.textSecondary }}>Entry {i + 1}</span>
                        <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: '1rem' }}>×</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <Input value={lead.org} onChange={v => update(i, 'org', v)} placeholder="Organization / club name" />
                        <Input value={lead.role} onChange={v => update(i, 'role', v)} placeholder="Your role / title" />
                        <Input value={lead.dateRange} onChange={v => update(i, 'dateRange', v)} placeholder="Date range (e.g. Aug 2022 – May 2023)" />
                        <div style={{ fontSize: '0.8rem', color: T.textSecondary, marginTop: 4 }}>Key contributions (one per line)</div>
                        <textarea
                            value={lead.bullets.join('\n')}
                            onChange={e => update(i, 'bullets', e.target.value.split('\n'))}
                            rows={3}
                            placeholder="• Organized annual tech fest with 500+ attendees"
                            style={{
                                width: '100%', padding: '8px 12px', borderRadius: T.radiusSm,
                                border: `1px solid ${T.border}`, fontSize: '0.875rem',
                                color: T.text, background: T.surface, resize: 'vertical',
                                outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                            }}
                        />
                    </div>
                </div>
            ))}
            <button
                onClick={add}
                style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: T.radiusSm,
                    border: `1px dashed ${T.border}`, background: 'transparent',
                    color: T.textSecondary, cursor: 'pointer', fontSize: '0.8125rem', width: 'fit-content',
                }}
            >
                <span style={{ fontSize: '1rem', lineHeight: 1 }}>+</span> Add entry
            </button>
        </div>
    )
}

// ── Main GapFormWizard ────────────────────────────────────────
export default function GapFormWizard({ resumeId, sectionsToAsk, onComplete, onClose }: GapFormWizardProps) {
    const [stepIndex, setStepIndex] = useState(0)
    const [saving, setSaving] = useState(false)
    const [gapData, setGapData] = useState<GapData>({
        certifications: [],
        achievements: [],
        projects: [],
        links: {},
        leadership: [],
    })

    const currentSection = sectionsToAsk[stepIndex]
    const config = SECTION_CONFIG[currentSection] ?? { icon: '📝', title: currentSection, subtitle: '' }
    const isLast = stepIndex === sectionsToAsk.length - 1

    async function saveAndContinue(wasSkipped: boolean) {
        setSaving(true)
        try {
            const sectionData = wasSkipped ? null : gapData[currentSection as keyof GapData]
            await fetch('/api/gap-form', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    resume_id: resumeId,
                    section_name: currentSection,
                    was_skipped: wasSkipped,
                    data: sectionData,
                }),
            })
        } catch {
            // Non-blocking — proceed anyway
        } finally {
            setSaving(false)
        }

        if (isLast) {
            onComplete(gapData)
        } else {
            setStepIndex(i => i + 1)
        }
    }

    function updateSection(section: keyof GapData, value: any) {
        setGapData(prev => ({ ...prev, [section]: value }))
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
        }}>
            <div style={{
                background: T.surface, borderRadius: T.radius,
                width: '100%', maxWidth: 520,
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                display: 'flex', flexDirection: 'column',
                maxHeight: '90vh',
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: `1px solid ${T.border}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <div style={{ fontSize: '0.75rem', color: T.textMuted, fontWeight: 500 }}>
                        Step {stepIndex + 1} of {sectionsToAsk.length}
                    </div>
                    <button
                        onClick={() => saveAndContinue(true)}
                        disabled={saving}
                        style={{
                            padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.border}`,
                            background: 'transparent', color: T.textSecondary,
                            fontSize: '0.75rem', cursor: 'pointer',
                        }}
                    >
                        Skip this section
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>{config.icon}</div>
                    <div style={{ fontSize: '1.0625rem', fontWeight: 700, color: T.text, marginBottom: 4 }}>
                        {config.title}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: T.textSecondary, marginBottom: 20 }}>
                        {config.subtitle}
                    </div>

                    {currentSection === 'certifications' && (
                        <CertificationsStep
                            data={gapData.certifications ?? []}
                            onChange={v => updateSection('certifications', v)}
                        />
                    )}
                    {currentSection === 'achievements' && (
                        <AchievementsStep
                            data={gapData.achievements ?? []}
                            onChange={v => updateSection('achievements', v)}
                        />
                    )}
                    {currentSection === 'projects' && (
                        <ProjectsStep
                            data={gapData.projects ?? []}
                            onChange={v => updateSection('projects', v)}
                        />
                    )}
                    {currentSection === 'links' && (
                        <LinksStep
                            data={gapData.links ?? {}}
                            onChange={v => updateSection('links', v)}
                        />
                    )}
                    {currentSection === 'leadership' && (
                        <LeadershipStep
                            data={gapData.leadership ?? []}
                            onChange={v => updateSection('leadership', v)}
                        />
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '12px 20px',
                    borderTop: `1px solid ${T.border}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    {/* Progress dots */}
                    <div style={{ display: 'flex', gap: 6 }}>
                        {sectionsToAsk.map((_, i) => (
                            <div key={i} style={{
                                width: 7, height: 7, borderRadius: '50%',
                                background: i === stepIndex ? T.primary : i < stepIndex ? `${T.primary}60` : T.border,
                            }} />
                        ))}
                    </div>

                    <button
                        onClick={() => saveAndContinue(false)}
                        disabled={saving}
                        style={{
                            padding: '8px 18px', borderRadius: T.radiusSm,
                            background: `linear-gradient(135deg, ${T.primary}, ${T.primaryDark})`,
                            color: 'white', fontWeight: 600, fontSize: '0.875rem',
                            border: 'none', cursor: saving ? 'wait' : 'pointer',
                            opacity: saving ? 0.7 : 1,
                        }}
                    >
                        {isLast ? 'Generate Resume →' : 'Save & Continue →'}
                    </button>
                </div>
            </div>
        </div>
    )
}
