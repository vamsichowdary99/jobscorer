import OpenAI from 'openai';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { Job, ParsedResume } from '@/lib/types';

// text-embedding-3-small at native 1536 dim. DO NOT pass `dimensions:` —
// we'd silently break the vector(1536) column (Supabase rejects mismatches).
// Override-able via OPENAI_EMBEDDING_MODEL env if needed.
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_DIMS = 1536;

// OpenAI's token limit per request. text-embedding-3-small accepts ~8191 tokens
// (~32 KB of plain English). We hard-cap input at ~6 KB to leave headroom.
const MAX_INPUT_CHARS = 6000;

let _openai: OpenAI | null = null;
function openai(): OpenAI {
    if (_openai) return _openai;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY missing');
    _openai = new OpenAI({ apiKey });
    return _openai;
}

let _supabase: ReturnType<typeof createServiceClient> | null = null;
function supabase() {
    if (_supabase) return _supabase;
    _supabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    return _supabase;
}

/**
 * Generate a 1536-dim embedding for the given text. Truncates to MAX_INPUT_CHARS
 * to stay under the model's token limit. Returns the raw float array.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    const trimmed = (text ?? '').trim().slice(0, MAX_INPUT_CHARS);
    if (!trimmed) throw new Error('generateEmbedding: empty input');

    const res = await openai().embeddings.create({
        model: EMBEDDING_MODEL,
        input: trimmed,
        // NO dimensions parameter — keep native 1536
    });
    const vec = res.data[0]?.embedding;
    if (!vec || vec.length !== EMBEDDING_DIMS) {
        throw new Error(`generateEmbedding: unexpected vector length ${vec?.length}`);
    }
    return vec;
}

/**
 * Build the text fed to the embedding model for a job. Concatenates the most
 * semantically useful fields. Description is truncated since it dominates length.
 */
export function buildJobContent(job: Pick<Job, 'title' | 'company' | 'location' | 'schedule_type' | 'experience_level' | 'required_skills' | 'description'>): string {
    const parts: string[] = [];
    if (job.title) parts.push(`Role: ${job.title}`);
    if (job.company) parts.push(`Company: ${job.company}`);
    if (job.location) parts.push(`Location: ${job.location}`);
    if (job.schedule_type) parts.push(`Schedule: ${job.schedule_type}`);
    if (job.experience_level) parts.push(`Experience: ${job.experience_level}`);
    if (Array.isArray(job.required_skills) && job.required_skills.length > 0) {
        parts.push(`Required skills: ${job.required_skills.join(', ')}`);
    }
    if (job.description) {
        // 4 KB of description preserves enough context without blowing token budget
        parts.push(`Description: ${job.description.slice(0, 4000)}`);
    }
    return parts.join('\n');
}

/**
 * Build the text fed to the embedding model for a resume.
 *
 * The n8n resume parser emits two schema variants — handle both:
 *   Schema A (flat):   technical_skills[], work_history[{...responsibilities[]}]
 *   Schema B (nested): skills.{technical, tools, soft_skills}[], work_experience[{...responsibilities[]}]
 *
 * Returns concatenated sections (Summary, Skills, Experience, Education, Projects)
 * so the embedding captures domain keywords regardless of which shape arrived.
 */
export function buildResumeContent(parsed: any): string {
    if (!parsed) return '';
    const parts: string[] = [];

    const summary = parsed.professional_summary || parsed.summary;
    if (typeof summary === 'string' && summary.trim()) parts.push(`Summary: ${summary}`);

    // Skills: gather from BOTH possible shapes.
    const skills: string[] = [];
    if (Array.isArray(parsed.technical_skills)) skills.push(...parsed.technical_skills);
    const s = parsed.skills;
    if (s && typeof s === 'object') {
        for (const key of ['technical', 'tools', 'languages', 'frameworks', 'soft_skills']) {
            if (Array.isArray(s[key])) skills.push(...s[key]);
        }
    }
    const dedupedSkills = Array.from(new Set(skills.map(x => String(x).trim()).filter(Boolean)));
    if (dedupedSkills.length > 0) parts.push(`Skills: ${dedupedSkills.join(', ')}`);

    // Work entries: try work_history first, fall back to work_experience.
    const workArr = Array.isArray(parsed.work_history)
        ? parsed.work_history
        : Array.isArray(parsed.work_experience)
            ? parsed.work_experience
            : [];
    if (workArr.length > 0) {
        const work = workArr
            .map((w: any) => {
                const resp = Array.isArray(w?.responsibilities) ? w.responsibilities.join('; ') : '';
                const ach = Array.isArray(w?.achievements) ? w.achievements.join('; ') : '';
                const detail = [resp, ach].filter(Boolean).join(' | ');
                return `${w?.title ?? ''} at ${w?.company ?? ''} (${w?.start_date ?? ''} – ${w?.end_date ?? ''}): ${detail}`;
            })
            .join('\n');
        parts.push(`Experience:\n${work}`);
    }

    if (Array.isArray(parsed.education) && parsed.education.length > 0) {
        const edu = parsed.education
            .map((e: any) => `${e?.degree ?? ''} from ${e?.institution ?? ''} (${e?.graduation_date ?? ''})${e?.field_of_study ? ` — ${e.field_of_study}` : ''}`)
            .join('; ');
        parts.push(`Education: ${edu}`);
    }

    if (Array.isArray(parsed.projects) && parsed.projects.length > 0) {
        const projs = parsed.projects
            .map((p: any) => `${p?.name ?? ''}: ${p?.description ?? ''} (${Array.isArray(p?.technologies) ? p.technologies.join(', ') : ''})`)
            .join('\n');
        parts.push(`Projects:\n${projs}`);
    }

    if (Array.isArray(parsed.certifications) && parsed.certifications.length > 0) {
        const certs = parsed.certifications
            .map((c: any) => (typeof c === 'string' ? c : c?.name ?? ''))
            .filter(Boolean)
            .join(', ');
        if (certs) parts.push(`Certifications: ${certs}`);
    }

    return parts.join('\n\n');
}

// pgvector wants a stringified literal '[0.1,0.2,...]' through PostgREST.
function vectorLiteral(v: number[]): string {
    return '[' + v.join(',') + ']';
}

/**
 * Embed a single job and upsert into job_embeddings.
 * Idempotent — re-embedding the same job_id replaces the row.
 */
export async function embedJob(jobId: string): Promise<{ embedded: boolean; reason?: string }> {
    const sb = supabase();
    const { data: job, error } = await sb
        .from('jobs')
        .select('id, title, company, location, schedule_type, experience_level, required_skills, description')
        .eq('id', jobId)
        .maybeSingle();
    if (error) throw new Error(`embedJob: failed to fetch job ${jobId}: ${error.message}`);
    if (!job) return { embedded: false, reason: 'job not found' };

    const content = buildJobContent(job as any);
    if (!content.trim()) return { embedded: false, reason: 'empty content' };

    const embedding = await generateEmbedding(content);
    const { error: upErr } = await sb
        .from('job_embeddings' as any)
        .upsert({ job_id: jobId, embedding: vectorLiteral(embedding), content } as any, { onConflict: 'job_id' });
    if (upErr) throw new Error(`embedJob: upsert failed for ${jobId}: ${upErr.message}`);
    return { embedded: true };
}

/**
 * Embed a single resume and upsert into resume_embeddings.
 */
export async function embedResume(resumeId: string): Promise<{ embedded: boolean; reason?: string }> {
    const sb = supabase();
    const { data: resume, error } = await sb
        .from('resumes')
        .select('id, structured_data')
        .eq('id', resumeId)
        .maybeSingle();
    if (error) throw new Error(`embedResume: failed to fetch resume ${resumeId}: ${error.message}`);
    if (!resume) return { embedded: false, reason: 'resume not found' };

    // structured_data may arrive as a parsed object OR (per the known
    // "double-stringify" issue in n8n) as a JSON string we need to parse.
    let parsed: ParsedResume | null = null;
    const raw = (resume as { structured_data: unknown }).structured_data;
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw) as ParsedResume;
            if (typeof parsed === 'string') {
                // double-stringified
                parsed = JSON.parse(parsed) as ParsedResume;
            }
        } catch (err) {
            return { embedded: false, reason: `structured_data is a non-JSON string: ${(err as Error).message}` };
        }
    } else if (raw && typeof raw === 'object') {
        parsed = raw as ParsedResume;
    }

    const content = buildResumeContent(parsed);
    if (!content.trim()) return { embedded: false, reason: 'no structured_data to embed' };

    const embedding = await generateEmbedding(content);
    const { error: upErr } = await sb
        .from('resume_embeddings' as any)
        .upsert({ resume_id: resumeId, embedding: vectorLiteral(embedding), content } as any, { onConflict: 'resume_id' });
    if (upErr) throw new Error(`embedResume: upsert failed for ${resumeId}: ${upErr.message}`);
    return { embedded: true };
}
