import type { ChatCompletionTool } from 'openai/resources/chat/completions'

/**
 * Resume Editor Agent tools (Plan 21 Phase 2 / architecture doc §1).
 *
 * Scope cut from the architecture doc for Phase 2 MVP: propose_edit targets
 * are addressed exactly the way the already-built DiffCard/applyProposal
 * plumbing already understands (section + index + bullet_index + skills_field)
 * instead of the doc's richer operation:replace|add_item|update_item|remove_item
 * + whole-item new_value scheme. This means Phase 2 can only edit EXISTING
 * text (a bullet, the summary, one skills field) — it cannot add/remove/reorder
 * whole entries yet. That's a real, deliberate scope cut (documented in the
 * Phase 2 report), not an oversight: it lets the real agent reuse the exact
 * DiffCard/applyProposal.ts code the mock adapter already exercises, with zero
 * changes to those files. Whole-entry operations are a fast-follow.
 *
 * Phase 3 adds get_user_evidence + metric_sources.source's third option,
 * 'project_evidence' (architecture doc §1/§4) — the entity-hallucination
 * guard: before adding a skill/technology the model can't already see in the
 * resume, it must check for real proof (a completed project or milestone).
 *
 * Post-Phase-3 revision (user request): the guard no longer BLOCKS an
 * unverified skill claim — it still checks get_user_evidence first, but if
 * nothing comes back it proposes the edit anyway with unverified_skill:true,
 * surfacing a warning badge on the diff card. The user's existing
 * Accept/Reject buttons are the actual gate, not the model's refusal.
 */
export const editorTools: ChatCompletionTool[] = [
    {
        type: 'function',
        function: {
            name: 'propose_edit',
            description: 'Propose a change to ONE existing piece of resume text — the summary, one technical-skills field, or one bullet in one experience/project entry. Never writes anything; the user must click Accept in the UI. Every number/%/$/duration in new_value MUST have a matching metric_sources entry or the proposal is rejected.',
            parameters: {
                type: 'object',
                properties: {
                    section: {
                        type: 'string',
                        enum: ['summary', 'skills', 'experience', 'projects'],
                        description: 'Which part of the resume this edit targets.',
                    },
                    skills_field: {
                        type: 'string',
                        enum: ['languages', 'tools', 'frameworks', 'soft'],
                        description: 'REQUIRED when section is "skills" — which comma-separated skills field to replace.',
                    },
                    index: {
                        type: 'number',
                        description: 'REQUIRED when section is "experience" or "projects" — the zero-based entry index (which job / which project).',
                    },
                    bullet_index: {
                        type: 'number',
                        description: 'REQUIRED when section is "experience" or "projects" — the zero-based bullet index within that entry.',
                    },
                    new_value: {
                        type: 'string',
                        description: 'The full replacement text for the target (the whole new summary string, the whole new comma-separated skills field, or the whole new bullet sentence).',
                    },
                    rationale: {
                        type: 'string',
                        description: '1-2 sentences citing job requirements, ATS keywords, or resume evidence for why this change helps.',
                    },
                    unverified_skill: {
                        type: 'boolean',
                        description: 'Set true ONLY when new_value adds a skill/technology that get_user_evidence could NOT confirm (no matching completed project or roadmap). Still propose the edit as asked — this just marks the card with a warning badge so the user can decide to Accept or Reject it themselves. Omit or set false when the skill is already visible in the resume, or get_user_evidence confirmed it.',
                    },
                    metric_sources: {
                        type: 'array',
                        description: 'REQUIRED entry for every number/%/$/duration that appears in new_value. Omit entirely only if new_value contains no numbers.',
                        items: {
                            type: 'object',
                            properties: {
                                value: { type: 'string', description: 'The exact numeric token as it appears in new_value, e.g. "40%".' },
                                source: { type: 'string', enum: ['original_resume', 'user_message', 'project_evidence'], description: 'Where this number came from — the resume as it already existed, something the user typed in this conversation, or a completed project returned by get_user_evidence.' },
                                quote: { type: 'string', description: 'The verbatim text (from the resume, the user\'s message, or the get_user_evidence result) that contains this value. Must be an exact substring — do not paraphrase.' },
                            },
                            required: ['value', 'source', 'quote'],
                        },
                    },
                },
                required: ['section', 'new_value', 'rationale'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_job_context',
            description: 'Fetch the target job\'s title, company, description, and required skills for the resume currently being edited. Call this before tailoring content to the job.',
            parameters: { type: 'object', properties: {}, required: [] },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_match_details',
            description: 'Fetch the AI match score, matched skills (with evidence), missing skills, and gap analysis for the resume/job pair currently being edited. Use this to ground "tailor for this job" and "make ATS friendly" requests.',
            parameters: { type: 'object', properties: {}, required: [] },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_ats_keywords',
            description: 'Fetch the weighted ATS keyword list and current keyword coverage for the resume being edited, if one has been generated yet. May return no keywords — that just means none have been extracted for this artifact yet.',
            parameters: { type: 'object', properties: {}, required: [] },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_user_evidence',
            description: 'ALWAYS call this before proposing to add a skill or technology that is not already visible in the resume state you were given. Returns the user\'s REAL completed projects and milestones from JobScorer, with the skills/tech each one actually demonstrates. If nothing comes back for the skill, do NOT add it as if it were proven — tell the user you could not verify it and offer either to add it as a plain unverified claim (their call) or to start a roadmap that would let them build real evidence for it.',
            parameters: {
                type: 'object',
                properties: {
                    skill: {
                        type: 'string',
                        description: 'Optional — filter to evidence related to this skill/technology (case-insensitive substring match). Omit to return everything the user has completed.',
                    },
                },
                required: [],
            },
        },
    },
]
