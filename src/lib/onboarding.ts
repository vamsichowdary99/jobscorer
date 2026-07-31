// Shared vocabulary for the onboarding modal (src/components/OnboardingModal.tsx)
// and the Settings "Career Profile" editor (src/app/dashboard/settings/page.tsx) —
// both must stay in lockstep since Settings lets a user revise onboarding answers.

export const ONBOARDING_ROLE_OPTIONS = [
    'Frontend Developer', 'Frontend Engineer', 'Senior Frontend Engineer', 'React Developer',
    'React Engineer', 'Angular Developer', 'Vue Developer', 'Full Stack Developer',
    'Backend Developer', 'Backend Engineer', 'Software Engineer', 'Senior Software Engineer',
    'SOC Analyst', 'Cyber Security Analyst', 'Security Engineer', 'Cloud Security Engineer',
    'Penetration Tester', 'Blue Team Analyst', 'Threat Hunter',
    'Data Analyst', 'Data Scientist', 'Machine Learning Engineer', 'BI Analyst', 'AI Engineer',
    'Prompt Engineer', 'Data Engineer',
    'Product Manager', 'Product Designer', 'UX Designer', 'UI Designer', 'Interaction Designer',
    'DevOps Engineer', 'Cloud Engineer', 'QA Engineer', 'Mobile Developer', 'iOS Developer', 'Android Developer',
]

export const ONBOARDING_LOCATION_OPTIONS = [
    'Bangalore', 'Bengaluru', 'Hyderabad', 'Pune', 'Chennai', 'Delhi NCR', 'Mumbai', 'Remote',
    'Europe', 'United States', 'France', 'Germany', 'United Kingdom', 'Canada', 'Australia',
    'Kolkata', 'Ahmedabad', 'Noida', 'Gurgaon', 'Singapore',
]

export const CAREER_EXPERIENCE_OPTIONS = [
    'Student', 'Fresher', '0–1 Years', '1–3 Years', '3–5 Years', '5+ Years',
] as const

export const CAREER_CHALLENGE_OPTIONS = [
    { key: 'no_interview_calls', icon: '🎯', label: "I'm not getting interview calls" },
    { key: 'resume_not_shortlisted', icon: '📄', label: "My resume isn't getting shortlisted" },
    { key: 'dont_know_what_to_learn', icon: '🧭', label: "I don't know what to learn" },
    { key: 'not_enough_projects', icon: '🛠️', label: "I don't have enough projects" },
    { key: 'struggle_in_interviews', icon: '🎤', label: 'I struggle in interviews' },
    { key: 'changing_careers', icon: '🔄', label: "I'm changing careers" },
    { key: 'other', icon: '✏️', label: 'Other' },
] as const

export const JOB_TIMELINE_OPTIONS = [
    { key: 'immediately', label: 'Immediately' },
    { key: 'within_1_month', label: 'Within 1 month' },
    { key: 'within_3_months', label: 'Within 3 months' },
    { key: 'within_6_months', label: 'Within 6 months' },
    { key: 'just_exploring', label: 'Just exploring' },
] as const
