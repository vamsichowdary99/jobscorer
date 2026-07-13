/**
 * v2 GitHub validation (design doc §"GitHub Validation — Graduated Approach"):
 * one Contents-API call per deliverable file to confirm it actually exists in the
 * submitted repo, rather than trusting the URL on the honor system alone. Not code
 * execution, not cloning — a single presence check per file.
 */

const GITHUB_URL_RE = /github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?(?:[?#].*)?$/i

function parseGithubRepo(url: string): { owner: string; repo: string } | null {
    const match = url.match(GITHUB_URL_RE)
    if (!match) return null
    return { owner: match[1], repo: match[2] }
}

/**
 * Returns the subset of `fileNames` that could NOT be confirmed present in the repo.
 * Deliberately conservative: any ambiguous outcome (bad URL, rate-limited, network
 * error, non-404 error) is treated as "can't tell" and excluded from the missing
 * list — this check should only ever ADD a hard signal, never produce a false
 * positive that blocks a user who actually did the work.
 */
export async function checkMissingGithubFiles(githubUrl: string, fileNames: string[]): Promise<string[]> {
    const repo = parseGithubRepo(githubUrl)
    if (!repo || fileNames.length === 0) return []

    const missing: string[] = []
    for (const file of fileNames) {
        try {
            const res = await fetch(
                `https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/${encodeURIComponent(file)}`,
                {
                    headers: { 'User-Agent': 'jobscorer-app', Accept: 'application/vnd.github+json' },
                    signal: AbortSignal.timeout(8_000),
                },
            )
            if (res.status === 404) missing.push(file)
            // Any other status (200 exists, 403 rate-limited, 5xx, etc.) — inconclusive, don't flag.
        } catch (err) {
            console.warn(`[github-check] presence check failed for ${file}:`, err)
        }
    }
    return missing
}
