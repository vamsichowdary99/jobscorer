import { createClient as createServiceClient } from '@supabase/supabase-js';

export type WorkflowType =
    | 'ingest_jobs'
    | 'score'
    | 'company_research'
    | 'optimize_resume'
    | 'learning_path'
    | 'resume_parse';

export interface QueueJob {
    id: string;
    user_id: string;
    workflow_type: WorkflowType;
    payload: Record<string, unknown>;
    status: 'pending' | 'processing' | 'done' | 'failed';
    retry_count: number;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    result: Record<string, unknown> | null;
    error: string | null;
}

let _sb: ReturnType<typeof createServiceClient> | null = null;
function sb() {
    if (_sb) return _sb;
    _sb = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    return _sb;
}

/**
 * Insert a job into the queue. Returns the new job_id and the user's current
 * queue position (number of pending jobs ahead of this one in the global FIFO).
 *
 * After insert, fires (non-blocking) a wake-up POST to the Queue Processor's
 * /webhook/queue-wake endpoint so n8n picks the job up within ~1s instead of
 * waiting up to 60s for the next schedule trigger. If the wake-up fails,
 * the schedule trigger eventually catches the job — so this is best-effort.
 */
export async function enqueue(
    userId: string,
    workflowType: WorkflowType,
    payload: Record<string, unknown>,
): Promise<{ job_id: string; queue_position: number }> {
    const client = sb();

    const { data, error } = await client
        .from('job_queue' as any)
        .insert({
            user_id: userId,
            workflow_type: workflowType,
            payload,
        } as any)
        .select('id, created_at')
        .single();

    if (error || !data) {
        throw new Error(`enqueue: insert failed: ${error?.message ?? 'no data'}`);
    }

    const row = data as { id: string; created_at: string };

    // Queue position = number of pending rows older than this one.
    const { count } = await client
        .from('job_queue' as any)
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .lt('created_at', row.created_at);

    // Fire-and-forget wake-up so the Queue Processor picks up the job within
    // ~1s instead of waiting for the next 60s schedule tick. We don't await
    // and we don't surface errors — the schedule trigger is the safety net.
    void wakeQueueProcessor();

    return { job_id: row.id, queue_position: (count ?? 0) + 1 };
}

async function wakeQueueProcessor(): Promise<void> {
    const url = process.env.N8N_QUEUE_WAKE_URL || 'http://localhost:5678/webhook/queue-wake';
    try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 2000);
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
            signal: ctrl.signal,
        }).catch(() => { /* best-effort */ });
        clearTimeout(timeout);
    } catch {
        // ignore — schedule trigger is the fallback
    }
}

/**
 * Look up a single queue job by id. Returns null if not found.
 * Uses service-role client (RLS is enforced in /api routes via auth check).
 */
export async function getQueueJob(id: string): Promise<QueueJob | null> {
    const client = sb();
    const { data, error } = await client
        .from('job_queue' as any)
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (error || !data) return null;
    return data as unknown as QueueJob;
}

/**
 * List recent queue items for a user.
 */
export async function listUserQueue(userId: string, limit = 20): Promise<QueueJob[]> {
    const client = sb();
    const { data, error } = await client
        .from('job_queue' as any)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw new Error(`listUserQueue: ${error.message}`);
    return (data ?? []) as unknown as QueueJob[];
}
