'use client'

import { useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import JobCard from '@/components/JobCard'
import { fetchJobs } from '@/lib/api'
import type { Job } from '@/lib/types'

export default function BrowseJobsPage() {
    const [jobs, setJobs] = useState<Job[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchJobs(50, 0)
            .then(setJobs)
            .catch(() => setJobs([]))
            .finally(() => setLoading(false))
    }, [])

    return (
        <>
            <Navbar />
            <main style={{ paddingTop: 96, minHeight: '100vh' }}>
                <div className="container-main">
                    {/* Header */}
                    <div style={{ marginBottom: 40 }}>
                        <h1 style={{ fontSize: '2.25rem', marginBottom: 8 }}>Browse Jobs</h1>
                        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.0625rem' }}>
                            {loading ? 'Loading jobs...' : `${jobs.length} jobs available from multiple sources — no resume required.`}
                        </p>
                    </div>

                    {/* Loading State */}
                    {loading && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="card" style={{ height: 200 }}>
                                    <div style={{ background: 'var(--color-surface-alt)', height: 16, borderRadius: 4, width: '60%', marginBottom: 12 }} />
                                    <div style={{ background: 'var(--color-surface-alt)', height: 12, borderRadius: 4, width: '40%', marginBottom: 16 }} />
                                    <div style={{ background: 'var(--color-surface-alt)', height: 12, borderRadius: 4, width: '80%', marginBottom: 8 }} />
                                    <div style={{ background: 'var(--color-surface-alt)', height: 12, borderRadius: 4, width: '70%' }} />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Job Grid */}
                    {!loading && jobs.length === 0 && (
                        <div className="card" style={{ textAlign: 'center', padding: 64 }}>
                            <p style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: 8 }}>No jobs found</p>
                            <p style={{ color: 'var(--color-text-secondary)' }}>Check back later or trigger a job ingestion from the dashboard.</p>
                        </div>
                    )}

                    {!loading && jobs.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
                            {jobs.map((job) => (
                                <JobCard key={job.id} job={job} />
                            ))}
                        </div>
                    )}
                </div>
            </main>
            <Footer />
        </>
    )
}
