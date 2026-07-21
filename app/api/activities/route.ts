import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { syncLatestGoogleCalendars } from "@/lib/google-calendar";
import {
  ActivityRequestError,
  createActivityIdempotent,
  errorTraceFields,
  logActivityTrace,
  normalizeActivityRequest,
  normalizeClientRequestId,
  publicActivity,
  requestIdFor,
  retryAttemptFor,
} from "@/lib/activity-create";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function responseHeaders(requestId: string, revision?: number): HeadersInit {
  return {
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "X-Request-Id": requestId,
    ...(revision == null ? {} : { "X-Data-Revision": String(revision) }),
  };
}

function errorResponse(err: unknown, requestId: string) {
  if (err instanceof ActivityRequestError) {
    return NextResponse.json(
      { ok: false, error: err.publicMessage, code: err.code, requestId },
      { status: err.status, headers: responseHeaders(requestId) },
    );
  }
  if (err instanceof Error && err.message === "No autenticado") {
    return NextResponse.json(
      { ok: false, error: "No autenticado", code: "UNAUTHENTICATED", requestId },
      { status: 401, headers: responseHeaders(requestId) },
    );
  }
  return NextResponse.json(
    {
      ok: false,
      error: "No se pudo guardar la actividad.",
      code: "INTERNAL_ERROR",
      requestId,
    },
    { status: 500, headers: responseHeaders(requestId) },
  );
}

function queueGoogleCalendarSync(trace: {
  requestId: string;
  clientRequestId: string;
  userId: string;
  attempt: number;
  activityId: string;
}) {
  logActivityTrace({ ...trace, event: "google_sync_queued" });
  // Google is deliberately outside the persistence transaction and response
  // path. A slow or unavailable provider cannot turn a committed activity into
  // an ambiguous HTTP result.
  void (async () => {
    const summary = await syncLatestGoogleCalendars();
    logActivityTrace({
      ...trace,
      event: summary.failed > 0 ? "google_sync_completed_with_errors" : "google_sync_completed",
      ...(summary.failed > 0
        ? {
            errorCode: "GOOGLE_SYNC_FAILED",
            detail: { synced: summary.synced, failed: summary.failed, errors: summary.errors },
          }
        : {}),
    });
  })().catch((err: unknown) => {
    logActivityTrace({
      ...trace,
      event: "google_sync_failed",
      errorCode: "GOOGLE_SYNC_FAILED",
      ...errorTraceFields(err, { stack: true }),
    });
  });
}

export async function POST(req: Request) {
  const requestId = requestIdFor(req);
  const attempt = retryAttemptFor(req);
  let userId: string | undefined;
  let clientRequestId: string | undefined;

  try {
    const user = await requireUser();
    userId = user.id;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ActivityRequestError(400, "INVALID_REQUEST", "El cuerpo JSON no es válido.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ActivityRequestError(400, "INVALID_REQUEST", "El cuerpo de la solicitud no es válido.");
    }

    const envelope = body as Record<string, unknown>;
    clientRequestId = normalizeClientRequestId(envelope.clientRequestId);
    const activityRequest = normalizeActivityRequest(envelope.activity);

    logActivityTrace({
      requestId,
      clientRequestId,
      userId,
      event: "create_started",
      attempt,
      detail: {
        tipo: activityRequest.tipo,
        estado: activityRequest.estado,
        requestedFuncionarioId: activityRequest.requestedFuncionarioId,
        competenciaId: activityRequest.competenciaId,
        entregableId: activityRequest.entregableId,
        participantes: activityRequest.participantesIds.length,
        tituloLength: activityRequest.titulo.length,
      },
    });
    const result = await createActivityIdempotent({
      clientRequestId,
      request: activityRequest,
      user,
    });
    logActivityTrace({
      requestId,
      clientRequestId,
      userId,
      event: result.idempotentReplay ? "create_replayed" : "create_committed",
      attempt,
      activityId: result.activity.id,
    });
    // Replays also enqueue reconciliation: if the original process died after
    // COMMIT, a manual retry repairs the auxiliary calendar without a duplicate.
    queueGoogleCalendarSync({
      requestId,
      clientRequestId,
      userId,
      attempt,
      activityId: result.activity.id,
    });

    return NextResponse.json(
      {
        ok: true,
        activity: publicActivity(result.activity),
        clientRequestId,
        idempotentReplay: result.idempotentReplay,
        requestId,
      },
      {
        status: result.idempotentReplay ? 200 : 201,
        headers: responseHeaders(requestId, result.revision),
      },
    );
  } catch (err) {
    const errorCode =
      err instanceof ActivityRequestError
        ? err.code
        : err instanceof Error && err.message === "No autenticado"
          ? "UNAUTHENTICATED"
          : "INTERNAL_ERROR";
    logActivityTrace({
      requestId,
      clientRequestId,
      userId,
      event: "create_failed",
      attempt,
      errorCode,
      ...errorTraceFields(err, { stack: errorCode === "INTERNAL_ERROR" }),
    });
    return errorResponse(err, requestId);
  }
}
