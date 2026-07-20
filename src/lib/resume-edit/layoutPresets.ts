// Resume Layout Manager (plans/25 Phase 3) — named preset section orders.
// Same 8 movable keys used by catalog.ts's per-template DEFAULT_ORDER —
// 'profile' is never included here, it's always a fixed header.

export interface LayoutPreset {
    label: string
    order: string[]
}

export const LAYOUT_PRESETS: Record<string, LayoutPreset> = {
    fresher: {
        label: 'Fresher — Projects First',
        order: ['summary', 'projects', 'education', 'skills', 'experience', 'certifications', 'achievements', 'leadership'],
    },
    'software-engineer': {
        label: 'Software Engineer',
        order: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'achievements', 'leadership'],
    },
    devops: {
        label: 'DevOps / SRE',
        order: ['summary', 'experience', 'certifications', 'projects', 'skills', 'education', 'achievements', 'leadership'],
    },
    cybersecurity: {
        label: 'Cybersecurity',
        order: ['summary', 'certifications', 'experience', 'projects', 'skills', 'education', 'achievements', 'leadership'],
    },
    cloud: {
        label: 'Cloud',
        order: ['summary', 'experience', 'certifications', 'skills', 'projects', 'education', 'achievements', 'leadership'],
    },
    'data-analyst': {
        label: 'Data Analyst',
        order: ['summary', 'experience', 'skills', 'projects', 'education', 'certifications', 'achievements', 'leadership'],
    },
    experienced: {
        label: 'Experienced — Experience First',
        order: ['summary', 'experience', 'projects', 'certifications', 'skills', 'education', 'achievements', 'leadership'],
    },
    academic: {
        label: 'Academic',
        order: ['summary', 'education', 'certifications', 'experience', 'projects', 'skills', 'achievements', 'leadership'],
    },
}

/** Returns the preset key whose order exactly matches, or null ("Custom"). */
export function detectPresetKey(order: string[]): string | null {
    for (const [key, preset] of Object.entries(LAYOUT_PRESETS)) {
        if (preset.order.length === order.length && preset.order.every((k, i) => k === order[i])) return key
    }
    return null
}
