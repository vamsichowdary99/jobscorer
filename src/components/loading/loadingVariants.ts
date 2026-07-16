import type { LoadingStep } from './LoadingState'

interface LoadingVariant {
    title: string
    subtitle: string
    estimatedTime: string
    steps: LoadingStep[]
    cachedEstimatedTime?: string
    cachedNote?: string
}

export const LOADING_VARIANTS = {
    resumeAnalysis: {
        title: 'Reading your resume',
        subtitle: 'Our AI is extracting everything that matters.',
        estimatedTime: '20–40 sec',
        steps: [
            { id: 'extract', label: 'Extracting skills' },
            { id: 'experience', label: 'Detecting experience' },
            { id: 'projects', label: 'Identifying projects' },
            { id: 'ats', label: 'Calculating ATS score' },
            { id: 'gaps', label: 'Finding missing skills' },
            { id: 'match', label: 'Matching jobs' },
            { id: 'profile', label: 'Building career profile' },
        ],
    },
    resumeGeneration: {
        title: 'Creating your resume',
        subtitle: 'Tailoring your resume to this exact role.',
        estimatedTime: '20–30 sec',
        steps: [
            { id: 'read', label: 'Reading job description' },
            { id: 'select', label: 'Selecting relevant experience' },
            { id: 'keywords', label: 'Optimizing ATS keywords' },
            { id: 'bullets', label: 'Improving bullet points' },
            { id: 'layout', label: 'Formatting layout' },
            { id: 'pdf', label: 'Rendering PDF' },
        ],
    },
    companyResearch: {
        title: 'Researching company',
        subtitle: 'Building a full picture of how they hire and work.',
        estimatedTime: '2–4 min',
        cachedEstimatedTime: '5–10 sec',
        cachedNote: 'Fresh research takes longer. Future requests load much faster using cached reports.',
        steps: [
            { id: 'collect', label: 'Collecting company information' },
            { id: 'stack', label: 'Researching tech stack' },
            { id: 'interviews', label: 'Finding interview experience' },
            { id: 'trends', label: 'Analyzing hiring trends' },
            { id: 'report', label: 'Building AI report' },
        ],
    },
    projectRoadmap: {
        title: 'Building your roadmap',
        subtitle: 'A personalized plan to close your skill gaps.',
        estimatedTime: '15–25 sec',
        steps: [
            { id: 'gaps', label: 'Identifying missing skills' },
            { id: 'project', label: 'Selecting project' },
            { id: 'milestones', label: 'Creating milestones' },
            { id: 'resources', label: 'Gathering resources' },
            { id: 'personalize', label: 'Personalizing learning path' },
        ],
    },
    projectCoach: {
        title: 'Preparing lesson',
        subtitle: 'Your AI coach is putting the next lesson together.',
        estimatedTime: '10–15 sec',
        steps: [
            { id: 'understand', label: 'Understanding milestone' },
            { id: 'explain', label: 'Preparing explanation' },
            { id: 'examples', label: 'Creating examples' },
            { id: 'resources', label: 'Gathering resources' },
            { id: 'personalize', label: 'Personalizing lesson' },
        ],
    },
} satisfies Record<string, LoadingVariant>

export const JOB_SEARCH_CYCLE_PHRASES = [
    'Searching LinkedIn…', 'Searching Naukri…', 'Searching Indeed…', 'Searching Glassdoor…',
    'Comparing your skills…', 'Ranking opportunities…',
]
