import { task, logger, metadata } from "@trigger.dev/sdk/v3";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Central Redis token bucket — shared across ALL concurrent Trigger.dev task instances.
// Tier 1 (current): ~180K TPM. Upgrade to 1_800_000 after OpenAI Tier 2.
const OPENAI_TPM_LIMIT = 180_000;
const TOKENS_PER_JOB = 3_000; // ~2200 input + 800 output for v2 prompt (more fields)
const BATCH_SIZE = 5;          // parallel OpenAI calls per round

function getTokenBucket() {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(
      Math.floor(OPENAI_TPM_LIMIT * 0.9),
      "60 s"
    ),
    prefix: "openai-tpm",
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScoreJobsPayload {
  userId: string;
  resumeId: string;
  jobIds: string[];
  experienceLevel?: string;
}

interface MatchedSkillEvidence {
  skill: string;
  evidence: string;
}

interface GapItem {
  skill: string;
  severity: "hard_blocker" | "nice_to_have";
  has_adjacent_evidence: boolean;
  adjacent_from: string;
  mitigation_hint: string;
  score_impact: number;
}

interface FastestPathStep {
  action: string;
  time: string;
}

interface FastestPath {
  steps: FastestPathStep[];
  weeks_total: number;
  projected_score: number;
}

interface MatchConfidence {
  level: "high" | "medium" | "low";
  reason: string;
}

interface ApplicationOutlook {
  interview_chance: "high" | "medium" | "low";
  competition_level: "high" | "medium" | "low";
}

interface ScoreResult {
  job_id: string;
  relevance_score: number;
  recommendation: "strong_apply" | "apply" | "apply_with_prep" | "optimize_resume" | "low_fit";
  matched_skills: MatchedSkillEvidence[];
  missing_skills: string[];
  ai_reasoning: string;
  gaps: GapItem[];
  // v2 fields
  confidence?: MatchConfidence;
  fastest_path?: FastestPath;
  rejection_reason?: string;
  application_outlook?: ApplicationOutlook;
  optimized_score?: number;
}

// ── Helpers (ported from n8n Filter Jobs Code node) ───────────────────────────

const LEVEL_GROUPS = [
  ["entry", "entry-level", "entry level", "junior", "associate", "intern", "internship", "graduate", "jr", "0-2", "0-1", "1-2"],
  ["mid", "mid-level", "mid level", "intermediate", "2-5", "3-5", "2-4"],
  ["senior", "sr", "lead", "principal", "staff", "expert", "5+", "7+", "10+"],
  ["manager", "director", "head", "vp", "chief"],
];

function buildMatchGroup(experienceLevel: string): string[] {
  const level = experienceLevel.toLowerCase().trim();
  const tierIdx = LEVEL_GROUPS.findIndex((g) =>
    g.some((alias) => level.includes(alias) || alias.includes(level))
  );
  return tierIdx >= 0 ? LEVEL_GROUPS.slice(0, tierIdx + 1).flat() : [level];
}

// ── System prompt — kept in sync with n8n AI Job Scorer node ─────────────────
// Last updated: 2026-06-22 (v2 — added evidence, score_impact, confidence,
// fastest_path, rejection_reason, application_outlook, optimized_score)

const SYSTEM_PROMPT = `You are an expert resume-job matching AI performing precise candidate-job fit analysis.

Audience & voice: The candidate is an Indian IT job seeker (fresher, entry, mid-level, or senior — check the resume's "Total Experience" field). Match your tone and verdict framing to their ACTUAL level. NEVER call a mid (2-5 yr) or senior (5+ yr) candidate a fresher. Speak directly to them in second person ("You bring...", "Your gap here is..."). Be specific and grounded in their actual resume and THIS exact JD - avoid safe third-person recruiter-jargon templates. Two reasoning outputs in the same batch must NOT share the same opening sentence pattern.

You will be given MULTIPLE job postings to score against ONE candidate resume. You MUST return valid JSON: an object with a single key "scores" whose value is an ARRAY containing EXACTLY ONE object per job posting provided, in the same order. Score EVERY job independently — never omit, merge, skip, or invent a job. Each object in the "scores" array MUST include a "job_id" field echoing verbatim the job_id shown in that job's header, PLUS exactly these fields:
- relevance_score: integer 0-100. Scoring bands: 85-100 = exceptional match (nearly all skills align, right experience level), 70-84 = strong match (most core skills present, minor gaps), 55-69 = moderate match (some key skills present, could upskill), 40-54 = weak match (few overlapping skills, significant gaps), 0-39 = poor match (minimal relevance)
- recommendation: one of "strong_apply" / "apply" / "apply_with_prep" / "optimize_resume" / "low_fit". Use these rules in order; the FIRST one that matches wins:
    * strong_apply - score >= 85 AND zero hard_blocker gaps. Exceptional match; candidate should apply without changes.
    * apply - score 70-84 AND at most 1 hard_blocker gap. Solid match; apply directly.
    * apply_with_prep - score 60-84 AND 1-2 hard_blocker gaps that are realistically mitigatable in under 4 weeks of focused prep for a fresher. The candidate should spend a short focused sprint on those gaps before applying.
    * optimize_resume - score 55-69 AND at most 1 hard_blocker. The skills are likely present but the resume buries them; recommend a tailored resume pass first.
    * low_fit - score < 55 OR 3+ hard_blocker gaps OR a level/seniority/certification mismatch the candidate cannot close in under 4 weeks. Do NOT encourage applying.
- matched_skills: array of objects, one per matched skill. Each object has:
    * skill: the technical skill name (string). STRICT RULES: (a) only count skills explicitly listed in the resume's TECHNICAL SKILLS, TOOLS, or CERTIFICATIONS sections — or directly demonstrated in work_experience responsibilities. (b) NEVER include soft skills. (c) NEVER infer from project tech-stacks alone. (d) NEVER hedge with parentheticals — it's either in the resume or it isn't.
    * evidence: SHORT string (<=10 words) citing WHERE in the resume this skill appears. Must reference a specific project name, role, employer, cert, or section. Examples: "AWS Deployment Project", "HCL Security Internship", "Technical Skills section", "Coursera AWS cert". NEVER use vague evidence like "mentioned in resume" or "listed".
- missing_skills: array of specific SKILL strings required by the job but NOT found in the resume. STRICT RULES: (a) NEVER include experience-year requirements (e.g. '5+ years', '8-14 years of experience') — those belong only in ai_reasoning. (b) CONSOLIDATE related skills into a single entry to avoid inflated gap counts. Examples: list 'AWS / Azure / GCP cloud platforms' as ONE gap (not three), 'Apache Spark or Hadoop' as one, 'Snowflake or BigQuery' as one, 'Java or Scala' as one. (c) Each entry should represent a distinct skill DOMAIN, not every individual tool name. (d) Cap at 6 entries — if you list more, group them harder.
- ai_reasoning: a STRING (NOT an array) containing a markdown-formatted bulleted list (3-4 bullets), written in SECOND PERSON addressing the candidate directly. Each bullet starts with \`- **Label**: \` followed by ONE concise sentence under 25 words. Use these EXACT labels in this order:
    1. \`- **Match**: \` - the strongest positive signal grounded in a specific tool, project, or responsibility from THIS job's JD. Name a concrete detail from the JD (e.g. "the multi-tier IaC focus", "L2 SOC tier workflows"), not a generic skill list.
    2. \`- **Gap**: \` - the single most important missing skill or requirement, plus a one-phrase mitigation cue (e.g. "Missing Kubernetes - Killercoda free labs cover basics in 1 week", "Missing CISSP cert - not earnable as a fresher").
    3. \`- **Verdict**: \` - one line of actionable advice (e.g. "Apply directly", "Tailor your resume around X first", "Skip - 5+ year requirement can't be closed in 4 weeks", "Stretch role - focus on Y for 2 weeks then apply").
    4. (Optional) \`- **Why this matters**: \` - one line on whether this role is a useful stepping stone given the candidate's current stage. Only include when the role offers something unusual (structured fresher mentorship, niche domain entry, prestigious company stamp).

    DISQUALIFIER RULE: when relevance_score < 55 OR recommendation is low_fit, the FIRST bullet MUST be \`- **Disqualifier**: \` (replacing **Match**) and call out the single biggest blocker (level/seniority mismatch, missing must-have skill cluster, certification not earnable in <4 weeks). Do NOT lead with positive framing for jobs the candidate shouldn't apply to - that is dishonest signaling.

    NEVER use these templated openers anywhere in any bullet: "The candidate is a strong match for", "The candidate has relevant", "This role is a good fit", "Overall, this is a...". Each bullet must be specific to THIS job-resume pair.

    Output as a single plain text STRING with bullets joined by literal newline characters (\\n), e.g.:
    "- **Match**: Your AWS + Terraform skills mirror the JD's multi-tier IaC focus.\\n- **Gap**: Missing Kubernetes - Killercoda free labs cover basics in 1 week.\\n- **Verdict**: Strong fit. Apply directly."
- gaps: array of structured gap objects, one per entry in missing_skills. Each object has:
    * skill: the missing skill name (string, matches one of missing_skills)
    * severity: "hard_blocker" if the JD lists this as required AND the candidate has zero adjacent experience; "nice_to_have" otherwise
    * has_adjacent_evidence: true if the candidate's CV shows a related/equivalent skill (e.g., JavaScript -> TypeScript, Splunk -> SIEM, Java -> Kotlin, AWS -> cloud platform, MySQL -> SQL Server)
    * adjacent_from: short string naming the adjacent skill if has_adjacent_evidence is true, otherwise the string "none"
    * mitigation_hint: ONE short sentence with a SPECIFIC named resource — always name the exact course, platform, or action (e.g. "NPTEL 'Programming in Java' 12-week free course", "AWS Cloud Practitioner free-tier labs on aws.amazon.com/training", "Coursera 'Modern React with Redux' by Stephen Grider", "Killercoda Kubernetes free interactive labs, 1 week", "Build one GitHub repo using Spring Boot microservices, 3-5 days"). Never use vague phrases like 'online tutorials', 'online resources', 'personal projects', or 'study the documentation'. India-fresher preference order: NPTEL -> AWS/Azure/GCP free tier labs -> Coursera India -> YouTube (Apna College, CodeWithHarry, TechWorld with Nana) -> GitHub portfolio project.
    * score_impact: integer 0-15. Score points this gap is costing the candidate. Rules: hard_blocker with NO adjacent evidence = 10-15; hard_blocker WITH adjacent evidence = 5-9; nice_to_have = 2-5. The SUM of all score_impact values MUST NOT exceed (100 - relevance_score). Distribute proportionally if needed.
  IMPORTANT: gaps[] must only cover SKILL gaps (tools, technologies, frameworks, methodologies). NEVER add an entry for years-of-experience requirements. The gaps[] array length must equal missing_skills.length. Order: hard_blocker entries first, then nice_to_have.
- confidence: object with:
    * level: "high" if the JD has an explicit required_skills list AND description is >= 300 chars; "medium" if description is 100-299 chars or has no explicit skill list; "low" if description is vague/missing or <= 100 chars.
    * reason: ONE short phrase (e.g. "Detailed JD with explicit skill list", "Partial JD — extracted from description", "Sparse JD — score is best-effort")
- fastest_path: object with:
    * steps: array of {action: string (mitigation_hint condensed to <=12 words), time: string (e.g. "1 week")}. Top 2-3 hard_blocker actions only. Empty array [] if recommendation is "strong_apply" or "apply".
    * weeks_total: integer. Sum of estimated weeks across steps (round up). 0 if steps is empty.
    * projected_score: integer. relevance_score + sum(score_impact of gaps covered by steps). Cap at 95. Equal to relevance_score when steps is empty.
- rejection_reason: string. ONE sentence on the non-obvious screening failure pattern for this role TYPE — NOT about this candidate. What typically trips up otherwise-qualified candidates at this level/domain. Be specific to domain and seniority. NEVER write a generic answer like "communication skills".
- application_outlook: object with:
    * interview_chance: "high" if relevance_score >= 75; "medium" if 55-74; "low" if < 55
    * competition_level: "high" if MNC/Big-4/FAANG-adjacent/prominent Indian tech co OR hot-demand skills (ML/AI, cloud security, full-stack); "medium" for mid-market standard roles; "low" for niche/tier-2 city/unusual stack
- optimized_score: integer. Estimated relevance_score with better resume PRESENTATION only (keyword placement, quantified bullets, surfaced certs, JD-mirrored summary — NO new skills assumed). Rule: optimized_score = relevance_score + min(15, count_of_matched_skills_not_prominent x 4). Cap at 95. MUST be >= relevance_score. For "strong_apply": optimized_score = relevance_score.

Critical rules:
- Never invent or assume skills not explicitly stated in the resume data
- Never add experience-year requirements (e.g. '5+ years') to missing_skills or gaps[] — mention them once in ai_reasoning only
- India-fresher rule: treat senior-only certifications (CISSP, CISM, CISA, PMP, AWS Solutions Architect Professional, GCP Professional Cloud Architect, CCIE, CCSP) as LEVEL mismatches captured once in ai_reasoning. Do NOT list them in missing_skills or gaps[] - a fresher cannot earn them in under 4 weeks.
- Differentiation rule: when scoring multiple similar jobs in a batch, your ai_reasoning must reference at least one concrete detail (specific tool name from the JD, specific responsibility, specific company context) that is unique to THIS job. Do not reuse the same generic skill list across multiple jobs' reasoning.
- If required_skills is empty, extract requirements from the job description text
- Consider equivalent technologies (e.g., Splunk ~ SIEM, AWS ~ Cloud Security, Bash ~ Scripting) as partial matches
- Weight recent and primary skills higher than older or secondary ones
- Consider the candidate's projects and certifications as evidence of skills`;

// ── Build resume text (ported from n8n Build AI Prompt Code node) ─────────────

function buildResumeText(sd: Record<string, unknown>): string {
  const personalInfo = (sd.personal_info as Record<string, string>) || {};
  const skills = (sd.skills as Record<string, string[]>) || {};
  const workExp = (sd.work_experience as Record<string, unknown>[]) || [];
  const education = (sd.education as Record<string, string>[]) || [];
  const projects = (sd.projects as Record<string, unknown>[]) || [];
  const certs = (sd.certifications as (string | Record<string, string>)[]) || [];

  const lines: string[] = [
    `Name: ${personalInfo.full_name || "N/A"}`,
    `Location: ${personalInfo.location || "N/A"}`,
    `Summary: ${(sd.professional_summary as string) || "N/A"}`,
    `Total Experience: ${(sd.total_years_experience as number) || 0} years`,
    "",
    "TECHNICAL SKILLS: " + (skills.technical || []).join(", "),
    "TOOLS: " + (skills.tools || []).join(", "),
    "SOFT SKILLS: " + (skills.soft_skills || []).join(", "),
    "",
    "WORK EXPERIENCE:",
  ];

  for (const exp of workExp) {
    lines.push(`- ${exp.title} at ${exp.company} (${exp.start_date} - ${exp.end_date})`);
    lines.push(`  Location: ${(exp.location as string) || "N/A"}`);
    const responsibilities = (exp.responsibilities as string[]) || [];
    for (const r of responsibilities.slice(0, 5)) lines.push(`  * ${r}`);
    const achievements = (exp.achievements as string[]) || [];
    if (achievements.length) {
      lines.push("  Key achievements:");
      for (const a of achievements.slice(0, 3)) lines.push(`  - ${a}`);
    }
  }

  lines.push("", "EDUCATION:");
  for (const edu of education) {
    lines.push(`- ${edu.degree} in ${edu.field_of_study || "N/A"} from ${edu.institution} (${edu.graduation_date || "N/A"})`);
  }

  if (projects.length > 0) {
    lines.push("", "PROJECTS:");
    for (const p of projects as Record<string, unknown>[]) {
      lines.push(`- ${p.name}: ${(p.description as string) || ""}`);
      const techs = (p.technologies as string[]) || [];
      if (techs.length) lines.push(`  Technologies: ${techs.join(", ")}`);
    }
  }

  if (certs.length > 0) {
    lines.push("", "CERTIFICATIONS: " + certs.map((c) => (typeof c === "string" ? c : c.name)).join(", "));
  }

  return lines.join("\n");
}

function buildPrompt(resumeText: string, job: Record<string, unknown>): string {
  const required_skills = Array.isArray(job.required_skills)
    ? (job.required_skills as string[]).join(", ")
    : "Not specified";

  const jobBlock = [
    `### JOB 1 (job_id: ${job.id})`,
    `Title: ${job.title || "Unknown"}`,
    `Company: ${job.company || "Unknown"}`,
    `Location: ${job.location || "Unknown"}`,
    `Experience Level: ${job.experience_level || "Not specified"}`,
    `Job Type: ${job.schedule_type || "Not specified"}`,
    `Salary: ${job.salary || "Not disclosed"}`,
    `Required Skills: ${required_skills}`,
    "Full Description:",
    job.description || "No description available",
  ].join("\n");

  return [
    "Score the job below against the candidate resume.",
    "",
    "--- CANDIDATE RESUME ---",
    resumeText,
    "",
    "--- JOB TO SCORE (1) ---",
    jobBlock,
    "",
    "--- SCORING INSTRUCTIONS ---",
    "Extract resume skills + JD requirements, compare precisely (count equivalent tech, e.g. Splunk ~ SIEM, AWS ~ Cloud Security), and weight skill overlap (40%), experience-level fit (25%), domain relevance (20%), location compatibility (15%). ONLY list skills explicitly present in the resume.",
    `Return a JSON object with a scores array containing EXACTLY 1 object with job_id "${job.id}". Score even if it is a weak match (use a low score and low_fit). IMPORTANT: ai_reasoning MUST be a plain string, NOT an array.`,
  ].join("\n");
}

// ── Normalize score result — handle LLM format variations ────────────────────

function normalizeScore(raw: Record<string, unknown>): ScoreResult {
  // ai_reasoning: LLM sometimes returns array of strings instead of one string
  let ai_reasoning = raw.ai_reasoning;
  if (Array.isArray(ai_reasoning)) {
    ai_reasoning = (ai_reasoning as string[]).join("\n");
  } else if (typeof ai_reasoning !== "string") {
    ai_reasoning = String(ai_reasoning ?? "");
  }

  // matched_skills: normalize to {skill, evidence}[] regardless of LLM format
  const rawMatched = Array.isArray(raw.matched_skills) ? raw.matched_skills : [];
  const matched_skills: MatchedSkillEvidence[] = rawMatched.map((s: unknown) => {
    if (typeof s === "string") return { skill: s, evidence: "Technical Skills section" };
    const obj = s as Record<string, string>;
    return { skill: obj.skill || String(s), evidence: obj.evidence || "Technical Skills section" };
  });

  // gaps: normalize adjacent_from "" → "none"
  const rawGaps = Array.isArray(raw.gaps) ? raw.gaps : [];
  const gaps: GapItem[] = rawGaps.map((g: unknown) => {
    const gap = g as Record<string, unknown>;
    return {
      skill: String(gap.skill ?? ""),
      severity: (gap.severity as "hard_blocker" | "nice_to_have") ?? "nice_to_have",
      has_adjacent_evidence: Boolean(gap.has_adjacent_evidence),
      adjacent_from: gap.adjacent_from === "" || gap.adjacent_from == null ? "none" : String(gap.adjacent_from),
      mitigation_hint: String(gap.mitigation_hint ?? ""),
      score_impact: typeof gap.score_impact === "number" ? gap.score_impact : 0,
    };
  });

  return {
    job_id: String(raw.job_id ?? ""),
    relevance_score: Number(raw.relevance_score ?? 0),
    recommendation: (raw.recommendation as ScoreResult["recommendation"]) ?? "low_fit",
    matched_skills,
    missing_skills: Array.isArray(raw.missing_skills) ? (raw.missing_skills as string[]) : [],
    ai_reasoning: ai_reasoning as string,
    gaps,
    confidence: raw.confidence as MatchConfidence | undefined,
    fastest_path: raw.fastest_path as FastestPath | undefined,
    rejection_reason: raw.rejection_reason as string | undefined,
    application_outlook: raw.application_outlook as ApplicationOutlook | undefined,
    optimized_score: typeof raw.optimized_score === "number" ? raw.optimized_score : undefined,
  };
}

// ── The Task ──────────────────────────────────────────────────────────────────

export const scoreJobs = task({
  id: "score-jobs",

  queue: {
    name: "scoring",
    concurrencyLimit: 1,
  },

  maxDuration: 300,

  run: async (payload: ScoreJobsPayload) => {
    const { userId, resumeId, jobIds, experienceLevel = "" } = payload;
    const supabase = getSupabase();

    logger.info("Starting scoring", { userId, jobCount: jobIds.length });

    // 1. Fetch resume
    const { data: resume, error: resumeErr } = await supabase
      .from("resumes")
      .select("structured_data")
      .eq("id", resumeId)
      .single();

    if (resumeErr || !resume) {
      throw new Error(`Resume not found: ${resumeId}`);
    }

    let sd = resume.structured_data;
    if (typeof sd === "string") {
      try { sd = JSON.parse(sd); } catch { sd = {}; }
    }

    // 2. Fetch jobs
    const { data: allJobs, error: jobsErr } = await supabase
      .from("jobs")
      .select("*")
      .in("id", jobIds);

    if (jobsErr || !allJobs) {
      throw new Error(`Failed to fetch jobs: ${jobsErr?.message}`);
    }

    // 3. Filter jobs (cumulative-downward experience filter — mirrors n8n Filter Jobs node)
    const matchGroup = experienceLevel ? buildMatchGroup(experienceLevel) : [];
    const filteredJobs = allJobs.filter((job) => {
      if (!experienceLevel || !job.experience_level) return true;
      const jobLevel = job.experience_level.toLowerCase();
      return matchGroup.some((alias) => jobLevel.includes(alias) || alias.includes(jobLevel));
    });

    const jobsToScore = filteredJobs.length >= 3 ? filteredJobs : allJobs;

    if (jobsToScore.length === 0) {
      logger.warn("No jobs to score after filtering", { userId, jobIds });
      return { scored: 0, results: [] };
    }

    const resumeText = buildResumeText(sd as Record<string, unknown>);
    const tokenBucket = getTokenBucket();
    const results: ScoreResult[] = [];

    // 4. Score in parallel batches of BATCH_SIZE (one OpenAI call per job)
    for (let i = 0; i < jobsToScore.length; i += BATCH_SIZE) {
      const batch = jobsToScore.slice(i, i + BATCH_SIZE) as Record<string, unknown>[];

      const tokensNeeded = batch.length * TOKENS_PER_JOB;
      let bucketReady = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        const { success } = await tokenBucket.limit("scoring", { rate: tokensNeeded });
        if (success) { bucketReady = true; break; }
        logger.warn(`TPM bucket full, waiting 5s (attempt ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, 5000));
      }
      if (!bucketReady) {
        logger.error("Could not acquire TPM tokens after 10 attempts, skipping batch");
        continue;
      }

      const batchResults = await Promise.all(
        batch.map(async (job) => {
          const prompt = buildPrompt(resumeText, job);
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              const response = await getOpenAI().chat.completions.create(
                {
                  model: "gpt-4.1-mini",
                  temperature: 0.3,
                  response_format: { type: "json_object" },
                  messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: prompt },
                  ],
                },
                { timeout: 75000 }
              );
              const raw = response.choices[0]?.message?.content || "{}";
              const parsed = JSON.parse(raw);
              const rawScore = parsed.scores?.[0] ?? null;
              if (!rawScore) throw new Error("Empty scores array from OpenAI");
              return normalizeScore(rawScore as Record<string, unknown>);
            } catch (err) {
              logger.warn(`Job ${job.id} attempt ${attempt} failed: ${(err as Error).message}`);
              if (attempt < 2) await new Promise((r) => setTimeout(r, 3000));
            }
          }
          return null;
        })
      );

      // Write results to Supabase
      for (const score of batchResults) {
        if (!score) continue;
        const { error: upsertErr } = await supabase.from("user_job_matches").upsert(
          {
            user_id: userId,
            job_id: score.job_id,
            resume_id: resumeId,
            relevance_score: score.relevance_score,
            recommendation: score.recommendation,
            matched_skills: score.matched_skills,
            missing_skills: score.missing_skills,
            ai_reasoning: score.ai_reasoning,
            gaps: score.gaps || [],
            // v2 fields
            confidence: score.confidence ?? null,
            fastest_path: score.fastest_path ?? null,
            rejection_reason: score.rejection_reason ?? null,
            application_outlook: score.application_outlook ?? null,
            optimized_score: score.optimized_score ?? null,
          },
          { onConflict: "user_id,job_id,resume_id" }
        );
        if (upsertErr) {
          logger.error(`Failed to store match for job ${score.job_id}`, { error: upsertErr.message });
        } else {
          results.push(score);
        }
      }

      metadata.set("progress", {
        scored: results.length,
        total: jobsToScore.length,
        batchDone: Math.floor(i / BATCH_SIZE) + 1,
        totalBatches: Math.ceil(jobsToScore.length / BATCH_SIZE),
      });

      logger.info(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: scored ${results.length}/${jobsToScore.length}`);
    }

    return { scored: results.length, results };
  },
});
