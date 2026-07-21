import { NextRequest, NextResponse } from "next/server";
import { getFormByToken } from "@/lib/db";
import { ingestSubmission } from "@/lib/ingest";

// Public form-ingest endpoint. Anonymous by design: authorization is the
// form's unguessable token in the URL. Embedded forms and the tracking-code
// snippet both POST here. CORS is wide-open because forms are embedded on
// arbitrary customer sites — the token is the capability.
//
// NOTE: today this reads/writes the in-memory repository (src/lib/db). When
// Supabase is wired up, this route should use the service-role admin client
// (src/lib/supabase/admin) since it runs without a user session.

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const form = await getFormByToken(token);
  if (!form) {
    return NextResponse.json(
      { ok: false, error: "Form not found or inactive" },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  // Accept either JSON or urlencoded/multipart form posts.
  let payload: Record<string, unknown> = {};
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      payload = (await req.json()) as Record<string, unknown>;
    } else {
      const fd = await req.formData();
      for (const [k, v] of fd.entries()) {
        payload[k] = typeof v === "string" ? v : v.name;
      }
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const sourceIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const result = await ingestSubmission(form, payload, sourceIp);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 400,
    headers: CORS_HEADERS,
  });
}
