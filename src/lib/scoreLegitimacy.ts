/**
 * TypeScript port of the n8n `Score Legitimacy` node.
 *
 * Pure-compute legitimacy scoring (no external calls). Mirrors the 11-signal
 * heuristic in the n8n workflow so pool-promoted jobs (which bypass n8n)
 * land in the `jobs` table with the same `legitimacy_tier` + `legitimacy_signals`
 * shape that n8n-ingested rows have.
 *
 * Signals (composite_score reflects all 11):
 *   1. posting_age_days     — fresher = better
 *   2. jd_specificity_score — tech keyword density in description
 *   3. red_phrase_matches   — walk-in / scam phrases
 *   4. salary_disclosed     — positive only (India norm is no salary)
 *   5. has_company_name     — present, ≠ 'Unknown'
 *   6. apply_destination_type — official_ats / aggregator / company / anonymous_form / invalid
 *   7. jd_length_chars      — too short = suspicious
 *   8. spam_title           — $$$, !!!, easy money, etc.
 *   9. has_discrimination_phrase — Female/Male only (illegal in IN)
 *  10. has_clerical_phrase  — data entry / receptionist disguised as tech
 *  11. has_hard_years_minimum — "X+ years compulsory" — excludes freshers
 *
 * Tier mapping: score >= 4 → verified, >= 0 → proceed_with_caution, else → suspicious.
 */

const TECH_KEYWORDS = [
    // Languages
    'python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'golang', 'rust', 'kotlin', 'swift', 'ruby', 'php', 'scala',
    // Frontend frameworks
    'react', 'reactjs', 'next.js', 'nextjs', 'angular', 'vue', 'vuejs', 'nuxt', 'svelte', 'solid.js', 'remix', 'astro', 'gatsby',
    'redux', 'mobx', 'zustand', 'tanstack', 'react query', 'jquery',
    // Frontend styling
    'html', 'html5', 'css', 'css3', 'sass', 'scss', 'less', 'tailwind', 'bootstrap', 'material-ui', 'mui', 'chakra', 'styled-components', 'emotion', 'responsive design', 'figma',
    // Build tools
    'webpack', 'vite', 'esbuild', 'rollup', 'parcel', 'babel', 'eslint', 'prettier', 'npm', 'yarn', 'pnpm', 'turbopack',
    // CMS
    'wordpress', 'elementor', 'shopify', 'contentful', 'sanity', 'webflow', 'strapi',
    // Backend
    'node', 'nodejs', 'express', 'nestjs', 'fastify', 'django', 'flask', 'fastapi', 'spring', 'spring boot', 'hibernate', 'rails', 'laravel', 'asp.net', 'dotnet', '.net',
    // Cloud & infra
    'aws', 'azure', 'gcp', 'google cloud', 'digitalocean', 'heroku', 'vercel', 'netlify', 'cloudflare', 'docker', 'kubernetes', 'k8s', 'terraform', 'ansible', 'helm', 'istio', 'prometheus', 'grafana', 'datadog', 'new relic', 'sentry',
    // CI/CD
    'jenkins', 'ci/cd', 'circleci', 'github actions', 'gitlab ci', 'travis', 'bitbucket', 'git', 'github', 'gitlab',
    // Databases
    'sql', 'mysql', 'postgres', 'postgresql', 'mongodb', 'mongo', 'redis', 'kafka', 'rabbitmq', 'elasticsearch', 'dynamodb', 'cassandra', 'neo4j', 'firebase', 'firestore', 'supabase',
    // APIs
    'rest', 'restful', 'graphql', 'grpc', 'websocket', 'microservices', 'serverless', 'lambda', 'event-driven', 'soap',
    // Methodology
    'agile', 'scrum', 'kanban', 'jira', 'confluence', 'tdd', 'bdd', 'pair programming',
    // Security / SOC
    'splunk', 'wazuh', 'elk', 'siem', 'soc', 'edr', 'xdr', 'mdr', 'incident response', 'threat detection', 'firewall', 'iam', 'penetration testing', 'pen test', 'owasp', 'vulnerability',
    // Testing
    'selenium', 'cypress', 'playwright', 'junit', 'testng', 'pytest', 'jest', 'mocha', 'chai', 'vitest', 'testing library',
    // Data / analytics
    'tableau', 'power bi', 'looker', 'snowflake', 'databricks', 'airflow', 'dbt', 'spark', 'hadoop', 'pandas', 'numpy', 'jupyter', 'etl', 'elt', 'data warehouse', 'data lake',
    // SysAdmin / Networking
    'linux', 'unix', 'windows server', 'active directory', 'vmware', 'vsphere', 'hyper-v', 'bash', 'powershell', 'ssh', 'tcp/ip', 'dns', 'dhcp', 'vpn', 'load balancer', 'nginx', 'apache', 'iis', 'rhel', 'centos', 'ubuntu',
    // SEO / web perf
    'seo', 'google analytics', 'google tag manager', 'gtm', 'core web vitals', 'conversion rate', 'a/b testing', 'lighthouse',
]

const RED_PHRASES = [
    'walk-in', 'walk in', 'walkin', 'immediate joiner', 'urgent hiring', 'urgent requirement',
    'mass hiring', 'unlimited openings', 'no skills required', 'no experience required and high salary',
    'work from home daily payment', 'whatsapp resume', 'share resume on whatsapp', 'easy money', 'daily payout',
]

const ATS_HOSTS = ['greenhouse.io', 'lever.co', 'ashbyhq.com', 'workday', 'myworkdayjobs.com', 'smartrecruiters.com', 'jobvite.com', 'bamboohr.com', 'recruitee.com', 'workable.com', 'breezy.hr']
const AGGREGATOR_HOSTS = ['linkedin.com', 'indeed.com', 'naukri.com', 'foundit.in', 'glassdoor.com', 'google.com']
const FORM_HOSTS = ['forms.google.com', 'forms.gle', 'docs.google.com/forms', 'typeform.com']

const DISCRIM_PATTERNS = [
    /\bfemale\s*(only|preferred|candidates?\s*only)\b/i,
    /\bmale\s*(only|preferred|candidates?\s*only)\b/i,
    /\b(ladies|women|girls|men|boys)\s*only\b/i,
]
const CLERICAL_PATTERNS = [
    /\bdata\s*entry\b/i,
    /\btele\s*caller\b/i,
    /\btelecaller\b/i,
    /\boffice\s*(boy|peon)\b/i,
    /\bback\s*office\s+(operation|executive|associate)\b/i,
    /\brecord\s*management\b/i,
    /\breceptionist\b/i,
    /\bfront\s*desk\b/i,
]
const HARD_YEARS_PATTERNS = [
    /\d+\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|exp)\s+(?:is\s+)?(compulsory|mandatory|must|required\s+strictly)/i,
    /(?:minimum|atleast|at\s*least)\s+\d+\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|exp)\s+(?:is\s+)?(compulsory|mandatory)/i,
]

export type LegitimacyTier = 'verified' | 'proceed_with_caution' | 'suspicious'

export interface LegitimacySignals {
    posting_age_days: number | null
    jd_specificity_score: number
    matched_tech_keywords: string[]
    red_phrase_matches: string[]
    has_walk_in_phrase: boolean
    salary_disclosed: boolean
    has_company_name: boolean
    apply_destination_type: 'missing' | 'invalid_url' | 'anonymous_form' | 'official_ats' | 'aggregator' | 'company_or_other'
    jd_length_chars: number
    spam_title: boolean
    has_discrimination_phrase: boolean
    has_clerical_phrase: boolean
    has_hard_years_minimum: boolean
    _composite_score: number
}

export interface LegitimacyResult {
    legitimacy_tier: LegitimacyTier
    legitimacy_signals: LegitimacySignals
}

export interface ScoreJobInput {
    title?: string | null
    description?: string | null
    company?: string | null
    source_url?: string | null
    salary?: string | null
    posted_date?: string | null
}

export function scoreJob(j: ScoreJobInput): LegitimacyResult {
    const desc = String(j.description || '').toLowerCase()
    const title = String(j.title || '').toLowerCase()
    const company = String(j.company || '').trim()
    const url = String(j.source_url || '')
    const salary = j.salary
    const posted = j.posted_date

    let score = 0
    const signals: Partial<LegitimacySignals> = {}

    // 1. Posting age
    if (posted) {
        const t = Date.parse(posted)
        if (!isNaN(t)) {
            const ageDays = Math.floor((Date.now() - t) / 86_400_000)
            signals.posting_age_days = ageDays
            if (ageDays >= 0 && ageDays <= 30) score += 1
            else if (ageDays > 45) score -= 1
        } else {
            signals.posting_age_days = null
        }
    } else {
        signals.posting_age_days = null
    }

    // 2. JD specificity — tech keyword density
    const matched = TECH_KEYWORDS.filter(k => desc.includes(k))
    signals.jd_specificity_score = matched.length
    signals.matched_tech_keywords = matched.slice(0, 8)
    if (matched.length >= 5) score += 2
    else if (matched.length >= 2) score += 1
    else if (matched.length === 0) score -= 2

    // 3. Walk-in / scam phrases
    const redHits = RED_PHRASES.filter(p => desc.includes(p) || title.includes(p))
    signals.red_phrase_matches = redHits
    signals.has_walk_in_phrase = redHits.length > 0
    if (redHits.length > 0) score -= 2

    // 4. Salary disclosed (positive only)
    signals.salary_disclosed = !!salary && String(salary).trim() !== ''
    if (signals.salary_disclosed) score += 1

    // 5. Company presence
    const hasCompany = !!company && company.toLowerCase() !== 'unknown' && company.length > 2
    signals.has_company_name = hasCompany
    if (hasCompany) score += 1
    else score -= 2

    // 6. Apply destination type — use regex (matches n8n sandbox approach)
    let applyType: LegitimacySignals['apply_destination_type'] = 'missing'
    if (url) {
        const hm = String(url).match(/^https?:\/\/([^/\?#]+)/i)
        if (hm) {
            const host = hm[1].toLowerCase()
            if (FORM_HOSTS.some(h => host.includes(h))) { applyType = 'anonymous_form'; score -= 3 }
            else if (ATS_HOSTS.some(h => host.includes(h))) { applyType = 'official_ats'; score += 2 }
            else if (AGGREGATOR_HOSTS.some(h => host.includes(h))) { applyType = 'aggregator'; score += 1 }
            else { applyType = 'company_or_other'; score += 1 }
        } else {
            applyType = 'invalid_url'
            score -= 1
        }
    } else {
        score -= 1
    }
    signals.apply_destination_type = applyType

    // 7. JD length sanity
    const jdLen = (j.description || '').length
    signals.jd_length_chars = jdLen
    if (jdLen >= 500) score += 1
    else if (jdLen < 150) score -= 2

    // 8. Title spam markers
    const spamMarkers = ['$$$', '!!!', '🚀🚀', 'no skills', 'easy money', 'urgent!!']
    const spamTitle = spamMarkers.some(m => title.includes(m))
    signals.spam_title = spamTitle
    if (spamTitle) score -= 3

    // 9. Discrimination phrases
    const td = desc + ' ' + title
    const discrimHits = DISCRIM_PATTERNS.filter(p => p.test(td))
    signals.has_discrimination_phrase = discrimHits.length > 0
    if (discrimHits.length > 0) score -= 4

    // 10. Clerical / non-tech in tech clothing
    const clericalHits = CLERICAL_PATTERNS.filter(p => p.test(desc))
    signals.has_clerical_phrase = clericalHits.length > 0
    if (clericalHits.length > 0) score -= 4

    // 11. Hard-minimum-years language
    const hardYearsHits = HARD_YEARS_PATTERNS.filter(p => p.test(desc))
    signals.has_hard_years_minimum = hardYearsHits.length > 0
    if (hardYearsHits.length > 0) score -= 2

    signals._composite_score = score

    let tier: LegitimacyTier
    if (score >= 4) tier = 'verified'
    else if (score >= 0) tier = 'proceed_with_caution'
    else tier = 'suspicious'

    return {
        legitimacy_tier: tier,
        legitimacy_signals: signals as LegitimacySignals,
    }
}
