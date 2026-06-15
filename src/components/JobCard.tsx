import Link from 'next/link'
import type { Job } from '@/lib/types'
import LegitimacyBadge from './LegitimacyBadge'
import { jobStatusLabel } from '@/lib/jobs/applicationStatus'

interface Readonly_JobCardProps {
    readonly job: Job
    readonly showScore?: boolean
    readonly score?: number
}

export default function JobCard({ job, showScore, score }: Readonly_JobCardProps) {
    const timeAgo = job.posted_date ?? 'Recently'

    return (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer', position: 'relative' }}>
            {/* Score badge */}
            {showScore && score !== undefined && (
                <div style={{
                    position: 'absolute',
                    top: 16,
                    right: 16,
                    background: score >= 80 ? 'var(--color-success)' : score >= 60 ? 'var(--color-warning)' : 'var(--color-danger)',
                    color: 'white',
                    borderRadius: 'var(--radius-full)',
                    padding: '4px 12px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                }}>
                    {score}%
                </div>
            )}

            {/* Company & Title */}
            <div>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', fontWeight: 500, marginBottom: 4 }}>
                    {job.company ?? 'Unknown Company'}
                </p>
                <h4 style={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.3, paddingRight: showScore ? 60 : 0 }}>
                    {job.title}
                </h4>
            </div>

            {/* Legitimacy strip — surfaces ghost-job risk before the user invests in a click */}
            {job.legitimacy_tier === 'suspicious' && (
                <LegitimacyBadge
                    tier={job.legitimacy_tier}
                    signals={job.legitimacy_signals}
                    variant="strip"
                />
            )}

            {/* Meta */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                {job.location && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                        📍 {job.location}
                    </span>
                )}
                {job.schedule_type && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                        ⏰ {job.schedule_type}
                    </span>
                )}
                {job.experience_level && (
                    <span style={{
                        fontSize: '0.6875rem',
                        fontWeight: 500,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        background: 'var(--color-surface-alt)',
                        color: 'var(--color-text-secondary)',
                        textTransform: 'capitalize',
                    }}>
                        {job.experience_level}
                    </span>
                )}
                {jobStatusLabel(job.application_status) && (
                    <span style={{
                        display: 'inline-flex', alignItems: 'center',
                        padding: '2px 8px', borderRadius: 'var(--radius-full)',
                        background: '#fef2f2', color: '#b91c1c',
                        fontSize: '0.6875rem', fontWeight: 700,
                    }}>
                        {jobStatusLabel(job.application_status)}
                    </span>
                )}
                {(job.legitimacy_tier === 'verified' || job.legitimacy_tier === 'proceed_with_caution') && (
                    <LegitimacyBadge
                        tier={job.legitimacy_tier}
                        signals={job.legitimacy_signals}
                        size="sm"
                    />
                )}
            </div>

            {/* Description preview */}
            {job.description && (
                <p style={{
                    fontSize: '0.8125rem',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.6,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                }}>
                    {job.description.replace(/\\n/g, ' ').replace(/\*\*/g, '').slice(0, 200)}
                </p>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                    {timeAgo} • {job.source}
                </span>
                {job.source_url && (
                    <Link href={job.source_url} target="_blank" style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 500, textDecoration: 'none' }}>
                        View →
                    </Link>
                )}
            </div>
        </div>
    )
}
