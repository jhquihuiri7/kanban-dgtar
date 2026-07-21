import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import {
  ActivityRequestError,
  errorTraceFields,
  findVerifiedActivity,
  logActivityTrace,
  normalizeClientRequestId,
  publicActivity,
  requestIdFor,
  retryAttemptFor,
  verificationAttemptFor,
} from "@/lib/activity-create";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function responseHeaders(requestId: string): HeadersInit {
  return {
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "X-Request-Id": requestId,
  };
}

export async function GET(req: Request) {
  const requestId = requestIdFor(req);
  const attempt = retryAttemptFor(req);
  const verificationAttempt = verificationAttemptFor(req);
  let userId: string | undefined;
  let clientRequestId: string | undefined;

  try {
    const user = await requireUser();
    userId = user.id;
    clientRequestId = normalizeClientRequestId(new URL(req.url).searchParams.get("clientRequestId"));
    logActivityTrace({ requestId, clientRequestId, userId, event: "verification_started", attempt, verificationAttempt });

    const activity = await findVerifiedActivity(clientRequestId, user);
    if (!activity) {
      logActivityTrace({ requestId, clientRequestId, userId, event: "verification_not_found", attempt, verificationAttempt });
      return NextResponse.json(
        {
          ok: false,
          verified: false,
          error: "No se encontró una actividad guardada para esta operación.",
          code: "ACTIVITY_NOT_FOUND",
          clientRequestId,
          requestId,
        },
        { status: 404, headers: responseHeaders(requestId) },
      );
    }

    logActivityTrace({
      requestId,
      clientRequestId,
      userId,
      event: "verification_succeeded",
      attempt,
      verificationAttempt,
      activityId: activity.id,
    });
    return NextResponse.json(
      {
        ok: true,
        verified: true,
        activity: publicActivity(activity),
        clientRequestId,
        requestId,
      },
      { status: 200, headers: responseHeaders(requestId) },
    );
  } catch (err) {
    const status =
      err instanceof ActivityRequestError
        ? err.status
        : err instanceof Error && err.message === "No autenticado"
          ? 401
          : 500;
    const code =
      err instanceof ActivityRequestError
        ? err.code
        : status === 401
          ? "UNAUTHENTICATED"
          : "INTERNAL_ERROR";
    const error =
      err instanceof ActivityRequestError
        ? err.publicMessage
        : status === 401
          ? "No autenticado"
          : "No se pudo verificar la actividad.";
    logActivityTrace({
      requestId,
      clientRequestId,
      userId,
      event: "verification_failed",
      attempt,
      verificationAttempt,
      errorCode: code,
      ...errorTraceFields(err, { stack: code === "INTERNAL_ERROR" }),
    });
    return NextResponse.json(
      { ok: false, verified: false, error, code, clientRequestId, requestId },
      { status, headers: responseHeaders(requestId) },
    );
  }
}
