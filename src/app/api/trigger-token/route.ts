import { auth, runs } from "@trigger.dev/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Mints a Realtime token scoped to exactly one run the caller owns — never a
// project-wide token. Ownership is verified server-side via the run's tags
// (score-jobs is triggered with `tags: [user:<id>]`, see /api/score), not
// trusted from the request body.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const runId = typeof body.runId === "string" ? body.runId : "";
  if (!runId) return NextResponse.json({ error: "Missing runId" }, { status: 400 });

  let run;
  try {
    run = await runs.retrieve(runId);
  } catch {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (!run.tags?.includes(`user:${user.id}`)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = await auth.createPublicToken({
    scopes: { read: { runs: [runId] } },
    expirationTime: "1h",
  });

  return NextResponse.json({ token });
}
