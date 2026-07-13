-- Cost-optimization telemetry (post-Plan-21-Phase-3): capture OpenAI's real
-- prompt-cache hit count and call latency so caching effectiveness and cost
-- can be measured from data instead of assumption, before further optimizing.
ALTER TABLE public.usage_events
  ADD COLUMN IF NOT EXISTS cached_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS latency_ms   INTEGER;
