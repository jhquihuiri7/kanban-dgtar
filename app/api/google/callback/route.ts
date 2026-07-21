import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { connectGoogleAccount } from "@/lib/google-calendar";
import { publicUrl } from "@/lib/public-url";
import { errorTraceFields, logActivityTrace, requestIdFor } from "@/lib/activity-create";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const requestId = requestIdFor(req);
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  let userId: string | undefined;

  try {
    const user = await requireUser();
    userId = user.id;
    // Google's consent screen reports its own refusal (access_denied,
    // admin_policy_enforced, …) here — the decisive signal that a Workspace
    // policy or an unverified-app restriction blocked the account, not our code.
    if (oauthError) {
      logActivityTrace({
        requestId,
        userId,
        event: "google_connect_denied_by_google",
        errorCode: "GOOGLE_OAUTH_DENIED",
        detail: {
          oauthError,
          oauthErrorDescription: url.searchParams.get("error_description"),
          userEmail: user.email,
        },
      });
      throw new Error(`Google rechazo la vinculacion: ${oauthError}`);
    }
    if (!code || !state) throw new Error("Callback de Google incompleto.");

    logActivityTrace({ requestId, userId, event: "google_connect_started", detail: { userEmail: user.email } });
    await connectGoogleAccount(req, user.id, code, state);
    logActivityTrace({ requestId, userId, event: "google_connect_succeeded", detail: { userEmail: user.email } });
    return NextResponse.redirect(publicUrl(req, "/?google=connected"));
  } catch (err) {
    console.error("[api/google/callback]", err);
    // Skip if we already logged the explicit Google refusal above.
    if (!oauthError) {
      logActivityTrace({
        requestId,
        userId,
        event: "google_connect_failed",
        errorCode: "GOOGLE_CONNECT_FAILED",
        ...errorTraceFields(err, { stack: true }),
      });
    }
    const redirect = publicUrl(req, "/?google=error");
    redirect.searchParams.set("message", errorMessage(err));
    return NextResponse.redirect(redirect);
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Error desconocido";
}
