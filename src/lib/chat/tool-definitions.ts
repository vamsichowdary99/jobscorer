import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const chatTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_user_resume',
      description: 'Fetch the user\'s parsed resume including skills, work history, education, and contact info.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_job_scores',
      description: 'Fetch the user\'s AI-scored job matches from the Matches page, ordered by relevance score. ALWAYS call this first when the user asks "which jobs are my strongest fit", "show me my top matches", "what are my best matches", "what should I apply to", or any question about their current/existing match results. Returns the same scores shown on the Matches page (AI-evaluated, not just similarity). Set limit to 15–20 to show all matches. PREFER this over find_matching_jobs when the user is asking about their scored matches.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Number of top matches to return. Defaults to 5. Set to 15 or 20 to see all scored matches.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_job_details',
      description: 'Fetch full details for a specific job by its ID, including title, company, location, description, and required skills.',
      parameters: {
        type: 'object',
        properties: {
          job_id: {
            type: 'string',
            description: 'The UUID of the job to fetch details for.',
          },
        },
        required: ['job_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_company_research',
      description: 'Fetch research data about a company including overview, tech stack, culture, hiring signals, and resume optimization insights.',
      parameters: {
        type: 'object',
        properties: {
          company_name: {
            type: 'string',
            description: 'The name of the company to research.',
          },
        },
        required: ['company_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_skill_gaps',
      description: 'Fetch learning paths and skill gaps for the user relative to a specific job. Returns skills to learn with importance and resources.',
      parameters: {
        type: 'object',
        properties: {
          job_id: {
            type: 'string',
            description: 'The UUID of the job to check skill gaps for.',
          },
        },
        required: ['job_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_jobs',
      description: 'Search for new jobs by triggering the job ingestion pipeline. Use when the user wants to find new job listings.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Job title or keywords to search for (e.g., "cybersecurity", "frontend developer").',
          },
          location: {
            type: 'string',
            description: 'Location to search in (e.g., "Hyderabad", "Remote").',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_matching_jobs',
      description: 'Discover jobs via RAG vector search — use for EXPLORATION when the user wants to browse new job options, find unscored jobs in a specific city, or discover matches beyond what is already on their Matches page. Do NOT use this when the user is asking about their existing/current match results or "strongest fit" — call get_job_scores for that. Pass `location` whenever the user names a city/region (e.g. "frontend roles in Hyderabad" → location:"Hyderabad").',
      parameters: {
        type: 'object',
        properties: {
          count: {
            type: 'number',
            description: 'Number of top matches to return. Defaults to 10.',
          },
          location: {
            type: 'string',
            description: 'Optional city/region/country to filter results to (case-insensitive substring match against the job location). Pass the user-given city verbatim. Omit to search globally.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recommend_skill_to_learn',
      description: 'Recommend the most impactful skills the user should learn next, based on aggregating required_skills across their top-20 RAG-matched jobs and subtracting skills they already have. Returns frequency-ranked skill gaps with counts. Use when the user asks what to learn, what skill to pick up, or how to improve their match rate.',
      parameters: {
        type: 'object',
        properties: {
          top_k: {
            type: 'number',
            description: 'How many skill gaps to return. Defaults to 5.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cached_score',
      description: 'Look up a previously computed match score for the user against a specific job. Reads Redis cache first (24h TTL) then falls back to user_job_matches. Use when the user asks "what was my score for X" or "did I already score against this job".',
      parameters: {
        type: 'object',
        properties: {
          job_id: {
            type: 'string',
            description: 'The UUID of the job to look up the cached score for.',
          },
        },
        required: ['job_id'],
      },
    },
  },
];
