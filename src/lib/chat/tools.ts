import { createServerSupabase } from './supabase-server';
import { findBestJobMatches } from '@/lib/rag/search';
import { safeRedis } from '@/lib/redis';
import { KEY } from '@/lib/redis-keys';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = createServerSupabase() as any;

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
  resumeId: string | null
): Promise<string> {
  switch (toolName) {
    case 'get_user_resume':
      return getUserResume(userId, resumeId);
    case 'get_job_scores':
      return getJobScores(userId, resumeId, (args.limit as number) || 5);
    case 'get_job_details':
      return getJobDetails(args.job_id as string);
    case 'get_company_research':
      return getCompanyResearch(args.company_name as string);
    case 'get_skill_gaps':
      return getSkillGaps(userId, args.job_id as string);
    case 'search_jobs':
      return searchJobs(args.query as string, args.location as string | undefined);
    case 'find_matching_jobs':
      return findMatchingJobs(userId, resumeId, (args.count as number) || 10, (args.location as string | undefined) ?? null);
    case 'recommend_skill_to_learn':
      return recommendSkillToLearn(userId, resumeId, (args.top_k as number) || 5);
    case 'get_cached_score':
      return getCachedScore(userId, resumeId, args.job_id as string);
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

/**
 * Resolve which resume to use. The session-picked resumeId from the chat
 * client is authoritative — it MUST belong to the user (verified). If
 * none was provided, fall back to the latest resume by created_at.
 */
async function resolveResumeId(userId: string, sessionResumeId: string | null): Promise<string | null> {
  if (sessionResumeId) {
    const { data } = await supabase
      .from('resumes')
      .select('id')
      .eq('id', sessionResumeId)
      .eq('user_id', userId)
      .maybeSingle();
    if (data?.id) return data.id;
    // Fall through if the provided id doesn't belong to the user
  }
  const { data } = await supabase
    .from('resumes')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function getUserResume(userId: string, sessionResumeId: string | null): Promise<string> {
  const resumeId = await resolveResumeId(userId, sessionResumeId);
  if (!resumeId) return JSON.stringify({ error: 'No resume found for this user.' });

  const { data: resume, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('id', resumeId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return JSON.stringify({ error: error.message });
  if (!resume) return JSON.stringify({ error: 'Resume not found or does not belong to this user.' });

  const { data: skills } = await supabase
    .from('resume_skills')
    .select('skill, category')
    .eq('resume_id', resume.id);

  // structured_data may be stored as a JSON string — parse if needed
  const sd = typeof resume.structured_data === 'string'
    ? JSON.parse(resume.structured_data)
    : resume.structured_data;

  return JSON.stringify({
    name: sd?.personal_info?.full_name,
    email: sd?.personal_info?.email,
    phone: sd?.personal_info?.phone,
    location: sd?.personal_info?.location,
    linkedin: sd?.personal_info?.linkedin,
    summary: sd?.professional_summary,
    skills: skills?.map((s: { skill: string }) => s.skill) || [
      ...(sd?.skills?.technical || []),
      ...(sd?.skills?.tools || []),
    ],
    soft_skills: sd?.skills?.soft_skills || [],
    work_history: sd?.work_experience || [],
    education: sd?.education || [],
    projects: sd?.projects || [],
    certifications: sd?.certifications || [],
    total_years_experience: sd?.total_years_experience,
  });
}

async function getJobScores(userId: string, sessionResumeId: string | null, limit: number): Promise<string> {
  // Resolve which resume's scores to return. Prefer the session-picked resume
  // so a fresh upload (e.g. SOC analyst) doesn't surface old matches from a
  // previous resume (e.g. frontend dev).
  const resumeId = await resolveResumeId(userId, sessionResumeId);

  let query = supabase
    .from('user_job_matches')
    .select(`
      id,
      relevance_score,
      matched_skills,
      missing_skills,
      ai_reasoning,
      job_id,
      resume_id,
      jobs:job_id (
        id,
        title,
        company,
        location,
        salary,
        source_url
      )
    `)
    .eq('user_id', userId)
    .order('relevance_score', { ascending: false })
    .limit(limit);

  if (resumeId) query = query.eq('resume_id', resumeId);

  const { data, error } = await query;

  if (error) return JSON.stringify({ error: error.message });
  if (!data || data.length === 0) {
    return JSON.stringify({
      error: resumeId
        ? 'No cached scores yet for the selected resume. Run scoring from the Search or Matches page, or use find_matching_jobs for live RAG matches.'
        : 'No job matches found. Try uploading a resume and running job scoring first.',
      resume_id: resumeId,
    });
  }

  return JSON.stringify(
    data.map((match: any) => ({
      job_id: match.job_id,
      title: (match.jobs as any)?.title,
      company: (match.jobs as any)?.company,
      location: (match.jobs as any)?.location,
      salary: (match.jobs as any)?.salary,
      source_url: (match.jobs as any)?.source_url,
      match_score: match.relevance_score,
      matched_skills: match.matched_skills,
      missing_skills: match.missing_skills,
      ai_reasoning: match.ai_reasoning,
    }))
  );
}

async function getJobDetails(jobId: string): Promise<string> {
  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) return JSON.stringify({ error: error.message });

  return JSON.stringify({
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description,
    salary: job.salary,
    required_skills: job.required_skills,
    experience_level: job.experience_level,
    schedule_type: job.schedule_type,
    source_url: job.source_url,
  });
}

async function getCompanyResearch(companyName: string): Promise<string> {
  const { data, error } = await supabase
    .from('company_research')
    .select('*')
    .ilike('company_name', `%${companyName}%`)
    .limit(1)
    .maybeSingle();

  if (error) return JSON.stringify({ error: error.message });
  if (!data) return JSON.stringify({ error: `No research found for "${companyName}". Try running company research first from the dashboard.` });

  return JSON.stringify({
    company_name: data.company_name,
    domain: data.domain,
    overview: data.overview,
    industry: data.industry,
    mission: data.mission,
    size_stage: data.size_stage,
    headquarters: data.headquarters,
    tech_stack: data.tech_stack,
    culture: data.culture,
    hiring_signals: data.hiring_signals,
    resume_tips: data.resume_optimization_insights,
  });
}

async function getSkillGaps(userId: string, jobId: string): Promise<string> {
  const { data, error } = await supabase
    .from('learning_paths')
    .select('skill_name, importance, why_it_matters, time_estimate, resources')
    .eq('user_id', userId)
    .eq('job_id', jobId)
    .order('importance', { ascending: true });

  if (error) return JSON.stringify({ error: error.message });
  if (!data || data.length === 0) {
    const { data: match } = await supabase
      .from('user_job_matches')
      .select('missing_skills, matched_skills')
      .eq('user_id', userId)
      .eq('job_id', jobId)
      .maybeSingle();

    if (match) {
      return JSON.stringify({
        source: 'job_match',
        missing_skills: match.missing_skills || [],
        matched_skills: match.matched_skills || [],
        note: 'No learning paths generated yet. Visit /dashboard/learning?jobId=' + jobId + ' to generate them.',
      });
    }

    return JSON.stringify({ error: 'No skill gap data found for this job.' });
  }

  return JSON.stringify(
    data.map((path: any) => ({
      skill_name: path.skill_name,
      importance: path.importance,
      why_it_matters: path.why_it_matters,
      time_estimate: path.time_estimate,
      resources: path.resources,
    }))
  );
}

async function searchJobs(query: string, location?: string): Promise<string> {
  const webhookUrl = process.env.N8N_JOB_INGESTION_WEBHOOK_URL;
  if (!webhookUrl) {
    return JSON.stringify({ error: 'Job search webhook not configured.' });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: query, location: location || '' }),
    });

    if (!response.ok) {
      return JSON.stringify({ error: 'Job search request failed. Try again later.' });
    }

    const data = await response.json();
    return JSON.stringify({
      message: `Job search triggered for "${query}"${location ? ` in ${location}` : ''}. This is ASYNC — n8n will ingest jobs over the next 1-2 minutes and they will be embedded into the RAG index automatically.`,
      next_step: `Do NOT call search_jobs again in this conversation. To show results to the user — including 'wait', 'is it done', or 'show results' follow-ups — call find_matching_jobs${location ? ` with location:"${location}"` : ''}. Live RAG already covers newly-ingested jobs the moment they are embedded.`,
      result: data,
    });
  } catch {
    return JSON.stringify({ error: 'Failed to connect to job search service.' });
  }
}

async function findMatchingJobs(userId: string, sessionResumeId: string | null, count: number, location: string | null): Promise<string> {
  const resumeId = await resolveResumeId(userId, sessionResumeId);
  if (!resumeId) {
    return JSON.stringify({ error: 'No resume found. Upload a resume first.' });
  }

  // When the user asked for a specific location, over-fetch from RAG so we
  // have enough candidates after the post-filter. 50 is a reasonable upper
  // bound; below-threshold jobs are already dropped server-side.
  const fetchCount = location ? Math.max(count * 5, 50) : count;
  let matches;
  try {
    matches = await findBestJobMatches(resumeId, { count: fetchCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return JSON.stringify({ error: `RAG search failed: ${msg}` });
  }

  if (matches.length === 0) {
    return JSON.stringify({
      error: 'No semantically similar jobs found. The resume may be too sparse, or no jobs are embedded yet.',
    });
  }

  // Pull resume skills so we can compute matched/missing per job.
  const { data: resume } = await supabase
    .from('resumes').select('structured_data').eq('id', resumeId).maybeSingle();
  const { data: extraSkills } = await supabase
    .from('resume_skills').select('skill').eq('resume_id', resumeId);
  let sd: Record<string, unknown> | null = null;
  let raw: unknown = resume?.structured_data;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
  if (raw && typeof raw === 'object') sd = raw as Record<string, unknown>;
  const skillsObj = (sd?.skills as Record<string, string[]> | undefined) ?? undefined;
  const userSkillsRaw: string[] = [
    ...(skillsObj?.technical ?? []),
    ...(skillsObj?.tools ?? []),
    ...(skillsObj?.soft_skills ?? []),
    ...(((sd?.technical_skills as string[] | undefined) ?? [])),
    ...((extraSkills ?? []).map((s: any) => s.skill)),
  ];
  const norm = (s: string) => s.toLowerCase().trim().replace(/[\s_\-./]+/g, ' ');
  const userSkillSet = new Set(userSkillsRaw.map(norm).filter(Boolean));

  const jobIds = matches.map(m => m.job_id);
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, title, company, location, salary, experience_level, required_skills, source_url')
    .in('id', jobIds);
  if (error) return JSON.stringify({ error: error.message });

  const jobsById = new Map((jobs ?? []).map((j: any) => [j.id, j]));
  const locNeedle = location ? location.toLowerCase().trim() : null;
  // City aliases — Apify scrapes return canonical names ("Bengaluru", "Bangalore City, Bengaluru, Karnataka").
  // Without these aliases, a chat query for "Bangalore" returns zero matches even when jobs exist there.
  // NCR cluster (Delhi/Gurgaon/Noida/Faridabad) is treated as one market — same convention used by
  // the job-ingestion Filter & Deduplicate node.
  const CITY_ALIASES: Record<string, string[]> = {
    'bangalore':   ['bangalore', 'bengaluru', 'bangalore city'],
    'bengaluru':   ['bangalore', 'bengaluru', 'bangalore city'],
    'mumbai':      ['mumbai', 'bombay'],
    'bombay':      ['mumbai', 'bombay'],
    'chennai':     ['chennai', 'madras'],
    'madras':      ['chennai', 'madras'],
    'kolkata':     ['kolkata', 'calcutta'],
    'calcutta':    ['kolkata', 'calcutta'],
    'gurgaon':     ['gurgaon', 'gurugram', 'delhi', 'new delhi', 'noida', 'faridabad', 'ncr'],
    'gurugram':    ['gurgaon', 'gurugram', 'delhi', 'new delhi', 'noida', 'faridabad', 'ncr'],
    'delhi':       ['delhi', 'new delhi', 'ncr', 'gurgaon', 'gurugram', 'noida', 'faridabad'],
    'new delhi':   ['delhi', 'new delhi', 'ncr', 'gurgaon', 'gurugram', 'noida', 'faridabad'],
    'noida':       ['noida', 'delhi', 'new delhi', 'gurgaon', 'gurugram', 'faridabad', 'ncr'],
    'faridabad':   ['faridabad', 'delhi', 'new delhi', 'gurgaon', 'gurugram', 'noida', 'ncr'],
    'pune':        ['pune', 'poona'],
    'poona':       ['pune', 'poona'],
    'hyderabad':   ['hyderabad', 'secunderabad'],
    'kochi':       ['kochi', 'cochin', 'ernakulam'],
    'thiruvananthapuram': ['thiruvananthapuram', 'trivandrum'],
    'vizag':       ['vizag', 'visakhapatnam'],
    'visakhapatnam': ['vizag', 'visakhapatnam'],
  };
  const locNeedles = locNeedle
    ? (CITY_ALIASES[locNeedle] ?? [locNeedle])
    : null;

  const enriched = matches
    .map(m => {
      const job = jobsById.get(m.job_id) as any;
      if (!job) return null;
      // Location post-filter: substring ILIKE against any alias of the city.
      // The RAG step doesn't know about cities, so we over-fetch and trim here.
      if (locNeedles) {
        const jobLoc = (job.location ?? '').toString().toLowerCase();
        if (!locNeedles.some(n => jobLoc.includes(n))) return null;
      }
      const required = (Array.isArray(job.required_skills) ? job.required_skills : []) as string[];
      const matched: string[] = [];
      const missing: string[] = [];
      const seenMatched = new Set<string>();
      const seenMissing = new Set<string>();
      for (const skill of required) {
        if (typeof skill !== 'string') continue;
        const n = norm(skill);
        if (!n) continue;
        if (userSkillSet.has(n)) {
          if (!seenMatched.has(n)) { seenMatched.add(n); matched.push(skill); }
        } else {
          if (!seenMissing.has(n)) { seenMissing.add(n); missing.push(skill); }
        }
      }
      // Map cosine similarity to a 50–99 display score. Observed similarities
      // for text-embedding-3-small with our content cluster 0.4–0.7, so the
      // old (50 + sim * 110) formula clamped every match at 99. Spread:
      //   0.30 → 50  (threshold floor)
      //   0.50 → 70  (decent match)
      //   0.65 → 85  (strong)
      //   0.79 → 99  (rare, near-clone)
      const score = Math.max(50, Math.min(99, Math.round(50 + (m.similarity - 0.3) * 100)));
      return {
        job_id: m.job_id,
        title: job.title,
        company: job.company,
        location: job.location,
        salary: job.salary,
        experience_level: job.experience_level,
        source_url: job.source_url,
        required_skills: required,
        matched_skills: matched,
        missing_skills: missing,
        similarity: Number(m.similarity.toFixed(3)),
        score,
      };
    })
    .filter((j): j is NonNullable<typeof j> => j !== null)
    .slice(0, count);

  if (locNeedle && enriched.length === 0) {
    return JSON.stringify({
      error: `No matches found in ${location}. The user may want to try a nearby city or search globally.`,
      location_filter: location,
    });
  }

  return JSON.stringify(enriched);
}

function normalizeSkill(s: string): string {
  return s.toLowerCase().trim().replace(/[\s_\-./]+/g, ' ');
}

async function recommendSkillToLearn(userId: string, sessionResumeId: string | null, topK: number): Promise<string> {
  const resumeId = await resolveResumeId(userId, sessionResumeId);
  if (!resumeId) {
    return JSON.stringify({ error: 'No resume found. Upload a resume first.' });
  }

  // Source of truth: user_job_matches.missing_skills — same data get_job_scores returns.
  // The previous implementation re-derived gaps via RAG top-20 + string match against resume
  // skills, which silently disagreed with get_job_scores whenever the AI scoring had judged a
  // skill missing (verbatim term not in resume) but a generic resume skill string-matched it.
  const { data: matches, error } = await supabase
    .from('user_job_matches')
    .select('relevance_score, missing_skills')
    .eq('user_id', userId)
    .eq('resume_id', resumeId);
  if (error) return JSON.stringify({ error: error.message });

  const scored = (matches ?? []).filter((m: any) => Array.isArray((m as any).missing_skills));
  if (scored.length === 0) {
    return JSON.stringify({
      error: 'No scored matches yet. Run scoring from the Matches page first so we have AI-determined skill gaps to aggregate.',
    });
  }

  const gapCounts = new Map<string, { display: string; count: number }>();
  for (const m of scored) {
    const missing = (m as any).missing_skills as string[];
    const seenInThisJob = new Set<string>();
    for (const skill of missing) {
      if (typeof skill !== 'string') continue;
      const norm = normalizeSkill(skill);
      if (!norm || seenInThisJob.has(norm)) continue;
      seenInThisJob.add(norm);
      const existing = gapCounts.get(norm);
      if (existing) existing.count += 1;
      else gapCounts.set(norm, { display: skill, count: 1 });
    }
  }

  const ranked = Array.from(gapCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, topK);

  if (ranked.length === 0) {
    return JSON.stringify({
      message: `Across your ${scored.length} scored matches the AI flagged no missing skills. Strong fit.`,
      sample_size: scored.length,
      gaps: [],
    });
  }

  return JSON.stringify({
    message: `Skill gaps aggregated from AI-determined missing_skills across your ${scored.length} scored matches.`,
    sample_size: scored.length,
    gaps: ranked.map(g => ({
      skill: g.display,
      appears_in: g.count,
      out_of: scored.length,
    })),
  });
}

async function getCachedScore(userId: string, sessionResumeId: string | null, jobId: string): Promise<string> {
  const resumeId = await resolveResumeId(userId, sessionResumeId);
  if (!resumeId) {
    return JSON.stringify({ error: 'No resume found. Upload a resume first.' });
  }

  // NOTE: the Redis score:* key is only a PRESENCE marker (value is the integer 1),
  // not a stored score — so we must NOT return it as the score. Always read the real
  // score from user_job_matches below. (M1)
  const { data: match, error } = await supabase
    .from('user_job_matches')
    .select('relevance_score, matched_skills, missing_skills, ai_reasoning, jobs:job_id (title, company)')
    .eq('user_id', userId)
    .eq('job_id', jobId)
    .maybeSingle();
  if (error) return JSON.stringify({ error: error.message });
  if (!match) {
    return JSON.stringify({
      error: 'No score found for this job yet. Run scoring from the Search or Matches page first.',
    });
  }
  return JSON.stringify({
    source: 'supabase',
    resume_id: resumeId,
    job_id: jobId,
    title: (match.jobs as any)?.title,
    company: (match.jobs as any)?.company,
    relevance_score: match.relevance_score,
    matched_skills: match.matched_skills,
    missing_skills: match.missing_skills,
    ai_reasoning: match.ai_reasoning,
  });
}
