import { task, logger, metadata } from "@trigger.dev/sdk/v3";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
// Relative import (not the @/ tsconfig alias): this file is bundled by
// Trigger.dev's own build, separate from Next.js's, and this worktree has no
// trigger.config.ts to confirm alias resolution there — a relative path is
// unambiguous in either bundler.
import { SYSTEM_PROMPT, buildPrompt, normalizeScore, type ScoreResult } from "../lib/scoring/prompt";

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

// MatchedSkillEvidence, GapItem, FastestPathStep, FastestPath, MatchConfidence,
// ApplicationOutlook, ScoreResult all now live in ../lib/scoring/prompt.ts.

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
            profile_strengths: score.profile_strengths ?? null,
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
