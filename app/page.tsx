"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Icon, Input, Label, Select, useClickAway, type IconName } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  TODAY_ISO,
  dateOnly,
  daysBetween,
  fmtFechaLarga,
  gestionNombre,
  iso,
  type Actividad,
  type Competencia,
  type Entregable,
  type EstadoActividad,
  type Funcionario,
  type Gestion,
} from "@/lib/data";
import { KanbanBoard, type Filters } from "@/components/kanban";
import { CalendarView } from "@/components/calendar";
import { DetailPanel } from "@/components/detail";
import { StatsView } from "@/components/stats";
import { CatalogsView } from "@/components/catalogs";
import { NewActivityDialog, type CreateActivityHandler } from "@/components/new-activity";
import { ExportDialog } from "@/components/export";
import { UsersView } from "@/components/users";
import type { AuthUser } from "@/lib/auth-token";
import {
  ActivityPersistenceError,
  activityFieldMismatches,
  failureKindForStatus,
  persistActivityWithVerification,
} from "@/lib/activity-client";
import { DataMergeConflictError, rebaseDataDocument, type DataDocument } from "@/lib/data-rebase";
import { canFuncionarioEditActivity } from "@/lib/activity-access";

type Tab = "kanban" | "stats" | "catalogs" | "users";
type BoardView = "columns" | "week" | "month";
type Density = "standard" | "compact";
type LoadState = "loading" | "ready" | "error";
type SyncState = "idle" | "saving" | "saved" | "error";
type GoogleBusyState = "status" | "sync" | "disconnect" | null;
type StatsDateMode = "current-month" | "custom";

interface GoogleStatus {
  connected: boolean;
  googleEmail: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

interface Settings {
  density: Density;
  useAvatars: boolean;
}

const SYNC_DEBOUNCE_MS = 800;
const SERVER_READ_TIMEOUT_MS = 10_000;
const LEGACY_SAVE_TIMEOUT_MS = 15_000;

interface ServerDataSnapshot extends DataDocument {
  revision: number;
}

function snapshotPayload(snapshot: DataDocument): string {
  return JSON.stringify(snapshot);
}

function snapshotDocument(snapshot: ServerDataSnapshot): DataDocument {
  return {
    gestiones: snapshot.gestiones,
    funcionarios: snapshot.funcionarios,
    competencias: snapshot.competencias,
    entregables: snapshot.entregables,
    actividades: snapshot.actividades,
  };
}

function parseServerSnapshot(value: Record<string, unknown>): ServerDataSnapshot {
  const revision = Number(value.revision);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("El servidor no devolvió una revisión de datos válida.");
  }
  if (
    !Array.isArray(value.gestiones) ||
    !Array.isArray(value.funcionarios) ||
    !Array.isArray(value.competencias) ||
    !Array.isArray(value.entregables) ||
    !Array.isArray(value.actividades)
  ) {
    throw new Error("El servidor devolvió datos incompletos.");
  }
  return {
    gestiones: value.gestiones as Gestion[],
    funcionarios: value.funcionarios as Funcionario[],
    competencias: value.competencias as Competencia[],
    entregables: value.entregables as Entregable[],
    actividades: value.actividades as Actividad[],
    revision,
  };
}

/* Loads the catalog + activities from /api/data on mount, then writes the
   whole document back (debounced) for legacy edits. Every PUT carries the
   revision read from PostgreSQL, so a stale snapshot is rejected before it can
   erase a concurrently-created activity. New activities use their own POST. */
function useServerSync({
  gestiones,
  funcionarios,
  competencias,
  entregables,
  activities,
  setGestiones,
  setFuncionarios,
  setCompetencias,
  setEntregables,
  setActivities,
  setCurrentUser,
}: {
  gestiones: Gestion[];
  funcionarios: Funcionario[];
  competencias: Competencia[];
  entregables: Entregable[];
  activities: Actividad[];
  setGestiones: React.Dispatch<React.SetStateAction<Gestion[]>>;
  setFuncionarios: React.Dispatch<React.SetStateAction<Funcionario[]>>;
  setCompetencias: React.Dispatch<React.SetStateAction<Competencia[]>>;
  setEntregables: React.Dispatch<React.SetStateAction<Entregable[]>>;
  setActivities: React.Dispatch<React.SetStateAction<Actividad[]>>;
  setCurrentUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
}) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [reloadKey, setReloadKey] = useState(0);

  const hydratedPayloadRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revisionRef = useRef<number | null>(null);
  const pendingPayloadRef = useRef<string | null>(null);
  const confirmedPayloadRef = useRef<string | null>(null);
  const activeSavePromiseRef = useRef<Promise<void> | null>(null);
  const lastSaveErrorRef = useRef<Error | null>(null);
  const latestSnapshotRef = useRef<ServerDataSnapshot | null>(null);
  const currentDocumentRef = useRef<DataDocument>({
    gestiones,
    funcionarios,
    competencias,
    entregables,
    actividades: activities,
  });
  currentDocumentRef.current = { gestiones, funcionarios, competencias, entregables, actividades: activities };

  function applyServerSnapshot(snapshot: ServerDataSnapshot) {
    if (revisionRef.current != null && snapshot.revision < revisionRef.current && latestSnapshotRef.current) {
      return latestSnapshotRef.current;
    }
    const data = snapshotDocument(snapshot);
    currentDocumentRef.current = data;
    revisionRef.current = snapshot.revision;
    const payload = snapshotPayload(data);
    hydratedPayloadRef.current = payload;
    confirmedPayloadRef.current = payload;
    latestSnapshotRef.current = snapshot;
    setGestiones(data.gestiones);
    setFuncionarios(data.funcionarios);
    setCompetencias(data.competencias);
    setEntregables(data.entregables);
    setActivities(data.actividades);
    return snapshot;
  }

  function currentPayload(): string {
    return snapshotPayload(currentDocumentRef.current);
  }

  function applyLocalDocument(data: DataDocument, revision: number, payload: string) {
    currentDocumentRef.current = data;
    hydratedPayloadRef.current = payload;
    latestSnapshotRef.current = { ...data, revision };
    setGestiones(data.gestiones);
    setFuncionarios(data.funcionarios);
    setCompetencias(data.competencias);
    setEntregables(data.entregables);
    setActivities(data.actividades);
  }

  async function fetchServerSnapshot(): Promise<ServerDataSnapshot> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SERVER_READ_TIMEOUT_MS);
    try {
      const response = await fetch("/api/data", { cache: "no-store", signal: controller.signal });
      const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok || !json) {
        const kind = failureKindForStatus(response.status);
        throw new ActivityPersistenceError(
          kind,
          typeof json?.error === "string" ? json.error : "No se pudo leer la fuente oficial de datos.",
          typeof json?.code === "string" ? json.code : "SERVER_SNAPSHOT_FAILED",
          response.status,
        );
      }
      return parseServerSnapshot(json);
    } catch (error) {
      if (error instanceof ActivityPersistenceError) throw error;
      if (controller.signal.aborted || (error as { name?: string })?.name === "AbortError") {
        throw new ActivityPersistenceError(
          "timeout",
          "La actualización desde el servidor tardó demasiado; los datos locales permanecen disponibles.",
          "SERVER_SNAPSHOT_TIMEOUT",
        );
      }
      throw new ActivityPersistenceError(
        "network",
        "No fue posible consultar la fuente oficial de datos.",
        "SERVER_SNAPSHOT_NETWORK_ERROR",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async function flushPendingChanges(): Promise<void> {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (activeSavePromiseRef.current) await activeSavePromiseRef.current;
    const payload = currentPayload();
    if (payload !== confirmedPayloadRef.current) {
      await persistPayload(payload);
    }
    if (lastSaveErrorRef.current) throw lastSaveErrorRef.current;
  }

  async function refreshFromServer(options: {
    flushPending?: boolean;
    beforeApply?: (snapshot: ServerDataSnapshot) => void;
  } = {}): Promise<ServerDataSnapshot> {
    if (options.flushPending !== false) await flushPendingChanges();
    const snapshot = await fetchServerSnapshot();
    options.beforeApply?.(snapshot);
    return applyServerSnapshot(snapshot);
  }

  function persistPayload(payload: string): Promise<void> {
    pendingPayloadRef.current = payload;
    if (activeSavePromiseRef.current) return activeSavePromiseRef.current;

    lastSaveErrorRef.current = null;
    const drain = (async () => {
      try {
        while (pendingPayloadRef.current) {
          let nextPayload = pendingPayloadRef.current;
          pendingPayloadRef.current = null;
          let revision = revisionRef.current;
          if (revision == null) throw new Error("No existe una revisión cargada para guardar.");
          setSyncState("saving");
          let json: Record<string, unknown> | null = null;
          let rebasedDocument: DataDocument | null = null;
          for (let rebaseAttempt = 0; ; rebaseAttempt++) {
            const document = JSON.parse(nextPayload) as DataDocument;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), LEGACY_SAVE_TIMEOUT_MS);
            let res: Response;
            try {
              res = await fetch("/api/data", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...document, revision }),
                signal: controller.signal,
              });
              json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
            } catch (error) {
              if (controller.signal.aborted || (error as { name?: string })?.name === "AbortError") {
                throw new ActivityPersistenceError(
                  "timeout",
                  "El guardado pendiente tardó demasiado. Los cambios locales se conservaron.",
                  "LEGACY_SAVE_TIMEOUT",
                );
              }
              throw new ActivityPersistenceError(
                "network",
                "No fue posible guardar los cambios pendientes. Los datos locales se conservaron.",
                "LEGACY_SAVE_NETWORK_ERROR",
              );
            } finally {
              clearTimeout(timeout);
            }

            if (res.status !== 409 || json?.code !== "STALE_REVISION") {
              if (!res.ok || json?.ok !== true) {
                const kind = failureKindForStatus(res.status);
                throw new ActivityPersistenceError(
                  kind,
                  typeof json?.error === "string" ? json.error : "No se pudieron guardar los cambios pendientes.",
                  typeof json?.code === "string" ? json.code : "LEGACY_SAVE_FAILED",
                  res.status,
                );
              }
              break;
            }

            if (rebaseAttempt >= 2 || !confirmedPayloadRef.current) {
              throw new ActivityPersistenceError(
                "conflict",
                "Los datos cambiaron repetidamente en otra pestaña. Tus cambios locales se conservaron.",
                "STALE_REVISION",
                409,
              );
            }

            const remote = await fetchServerSnapshot();
            try {
              rebasedDocument = rebaseDataDocument(
                JSON.parse(confirmedPayloadRef.current) as DataDocument,
                document,
                snapshotDocument(remote),
              );
              // An edit may have produced Q while the stale PUT(P) and remote
              // read were in flight. Q is based on P, so fold Q over the
              // already-rebased P before applying or retrying it; sending the
              // raw Q later could erase the remote rows preserved above.
              const queuedDuringRebase = pendingPayloadRef.current;
              if (queuedDuringRebase) {
                pendingPayloadRef.current = null;
                rebasedDocument = rebaseDataDocument(
                  document,
                  JSON.parse(queuedDuringRebase) as DataDocument,
                  rebasedDocument,
                );
              }
            } catch (error) {
              if (error instanceof DataMergeConflictError) {
                throw new ActivityPersistenceError(
                  "conflict",
                  "La misma información cambió en otra pestaña. Tus cambios locales se conservaron para conciliarlos.",
                  `DATA_MERGE_CONFLICT:${error.conflicts.join(",")}`,
                  409,
                );
              }
              throw error;
            }
            revision = remote.revision;
            confirmedPayloadRef.current = snapshotPayload(snapshotDocument(remote));
            latestSnapshotRef.current = remote;
            nextPayload = snapshotPayload(rebasedDocument);
            // Keep the merged local view even if the retry times out after this
            // point; otherwise a later save could mistake a remote addition for
            // a local deletion.
            applyLocalDocument(rebasedDocument, remote.revision, nextPayload);
          }

          const nextRevision = Number(json?.revision);
          if (!Number.isSafeInteger(nextRevision) || nextRevision <= revision) {
            throw new Error("El servidor no confirmó una nueva revisión después de guardar.");
          }
          revisionRef.current = Math.max(revisionRef.current ?? nextRevision, nextRevision);
          confirmedPayloadRef.current = nextPayload;
          if (rebasedDocument) applyLocalDocument(rebasedDocument, nextRevision, nextPayload);
          if (
            (json.googleSync as { failed?: number; errors?: unknown[] } | undefined)?.failed ||
            (json.googleSync as { failed?: number; errors?: unknown[] } | undefined)?.errors?.length
          ) {
            console.warn("[sync] Los datos se guardaron, pero Google Calendar reportó fallos.");
          }
          setSyncState("saved");
        }
      } catch (err) {
        const saveError = err instanceof Error ? err : new Error("Error desconocido al guardar.");
        lastSaveErrorRef.current = saveError;
        console.error("[sync] PUT /api/data", saveError);
        setSyncState("error");
      }
    })();
    const active = drain.finally(() => {
      if (activeSavePromiseRef.current === active) activeSavePromiseRef.current = null;
      const queued = pendingPayloadRef.current;
      if (queued) {
        // The queued payload is a newer full snapshot. Give it one independent
        // attempt even when the in-flight request failed; do not loop-retry a
        // single failing payload forever.
        pendingPayloadRef.current = null;
        queueMicrotask(() => {
          void persistPayload(queued);
        });
      }
    });
    activeSavePromiseRef.current = active;
    return active;
  }

  function saveNow(overrides?: {
    gestiones?: Gestion[];
    funcionarios?: Funcionario[];
    competencias?: Competencia[];
    entregables?: Entregable[];
    activities?: Actividad[];
  }) {
    if (loadState !== "ready") return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const document: DataDocument = {
      gestiones: overrides?.gestiones ?? gestiones,
      funcionarios: overrides?.funcionarios ?? funcionarios,
      competencias: overrides?.competencias ?? competencias,
      entregables: overrides?.entregables ?? entregables,
      actividades: overrides?.activities ?? activities,
    };
    currentDocumentRef.current = document;
    const payload = snapshotPayload(document);
    hydratedPayloadRef.current = payload;
    setSyncState("saving");
    void persistPayload(payload);
  }

  // Initial load (and manual retry via reloadKey).
  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setLoadError("");
    (async () => {
      try {
        const [meRes, dataRes] = await Promise.all([
          fetch("/api/auth/me", { cache: "no-store" }),
          fetch("/api/data", { cache: "no-store" }),
        ]);
        const meJson = await meRes.json();
        const dataJson = (await dataRes.json()) as Record<string, unknown>;
        if (!meRes.ok) throw new Error(meJson?.error || meRes.statusText);
        if (!dataRes.ok) throw new Error(typeof dataJson?.error === "string" ? dataJson.error : dataRes.statusText);
        if (cancelled) return;
        const nextData = parseServerSnapshot(dataJson);
        setCurrentUser(meJson.user ?? null);
        applyServerSnapshot(nextData);
        setLoadState("ready");
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Error desconocido");
        setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  // Debounced full-document write on any data change.
  useEffect(() => {
    if (loadState !== "ready") return;
    const payload = JSON.stringify({ gestiones, funcionarios, competencias, entregables, actividades: activities });
    if (payload === hydratedPayloadRef.current) {
      hydratedPayloadRef.current = null;
      return;
    }
    setSyncState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      await persistPayload(payload);
    }, SYNC_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [gestiones, funcionarios, competencias, entregables, activities, loadState]);

  useEffect(() => {
    if (loadState !== "ready") return;
    const hasUnsavedChanges = () =>
      Boolean(timerRef.current || activeSavePromiseRef.current || pendingPayloadRef.current) ||
      currentPayload() !== confirmedPayloadRef.current;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const retryWhenOnline = () => {
      if (!hasUnsavedChanges()) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      setSyncState("saving");
      void persistPayload(currentPayload());
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("online", retryWhenOnline);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("online", retryWhenOnline);
    };
    // Refs carry the latest document/queue; listeners only depend on readiness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadState]);

  return {
    loadState,
    loadError,
    syncState,
    saveNow,
    flushPendingChanges,
    refreshFromServer,
    retry: () => setReloadKey((k) => k + 1),
  };
}

export default function Page() {
  const [settings, setSettings] = useState<Settings>({
    density: "standard",
    useAvatars: true,
  });
  const setTweak = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const [tab, setTab] = useState<Tab>("kanban");
  const [gestiones, setGestiones] = useState<Gestion[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [entregables, setEntregables] = useState<Entregable[]>([]);
  const [activities, setActivities] = useState<Actividad[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  const { loadState, loadError, syncState, saveNow, flushPendingChanges, refreshFromServer, retry } = useServerSync({
    gestiones,
    funcionarios,
    competencias,
    entregables,
    activities,
    setGestiones,
    setFuncionarios,
    setCompetencias,
    setEntregables,
    setActivities,
    setCurrentUser,
  });

  const [openActivityId, setOpenActivityId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDefaultEstado, setDialogDefaultEstado] = useState<EstadoActividad>("pendiente");
  const [exportOpen, setExportOpen] = useState(false);

  const [filters, setFilters] = useState<Filters>({ funcionario: "all", competencia: "all", q: "" });
  const creationAttemptsRef = useRef(new Map<string, number>());

  const isAdmin = currentUser?.role === "admin";

  useEffect(() => {
    if (!isAdmin && (tab === "catalogs" || tab === "users")) setTab("kanban");
  }, [isAdmin, tab]);

  function setAllowedTab(nextTab: Tab) {
    if (!isAdmin && (nextTab === "catalogs" || nextTab === "users")) {
      setTab("kanban");
      return;
    }
    setTab(nextTab);
  }

  const createActivity: CreateActivityHandler = async (input, clientRequestId, onPhase) => {
    if (!currentUser) {
      throw new ActivityPersistenceError("authentication", "No hay una sesión autenticada.");
    }
    const attempt = (creationAttemptsRef.current.get(clientRequestId) ?? 0) + 1;
    const trace = {
      attempt,
      requestId: `req_${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`,
    };
    creationAttemptsRef.current.set(clientRequestId, attempt);

    // Do not let the authoritative refresh below cancel a pending drag/edit.
    // Serialize and confirm the legacy queue before starting the isolated POST.
    await flushPendingChanges();

    let verified: Actividad;
    try {
      verified = await persistActivityWithVerification({
        input,
        clientRequestId,
        retryAttempt: trace.attempt,
        requestId: trace.requestId,
        onPhase,
      });
    } catch (error) {
      // A lost response followed by user edits is an intentional idempotency
      // conflict. The row carried by the error was read directly from DB; make
      // it visible in the official list before offering "Aceptar guardada".
      if (error instanceof ActivityPersistenceError && error.existingActivity?.id) {
        const existingId = error.existingActivity.id;
        await refreshFromServer({
          beforeApply: (snapshot) => {
            if (!snapshot.actividades.some((activity) => activity.id === existingId)) {
              throw new ActivityPersistenceError(
                "verification",
                "La actividad previa ya no está disponible en la fuente oficial.",
                "EXISTING_ACTIVITY_REFRESH_MISSING",
              );
            }
          },
        });
        creationAttemptsRef.current.delete(clientRequestId);
      }
      throw error;
    }

    // Refresh every collection from the official source and suppress the
    // legacy autosync echo. The activity returned to the modal is the row from
    // this second no-cache server read, not the optimistic POST response.
    let official: Actividad | undefined;
    await refreshFromServer({
      beforeApply: (snapshot) => {
        official = snapshot.actividades.find((activity) => activity.id === verified.id);
        const mismatches = official ? activityFieldMismatches(official, input) : ["id"];
        if (!official || mismatches.length > 0) {
          throw new ActivityPersistenceError(
            "verification",
            "La actividad dejó de estar disponible durante la actualización del listado.",
            `OFFICIAL_REFRESH_MISMATCH:${mismatches.join(",")}`,
          );
        }
      },
    });

    creationAttemptsRef.current.delete(clientRequestId);
    return official!;
  };

  if (loadState !== "ready" || !currentUser) {
    return <LoadingGate state={loadState} error={loadError} onRetry={retry} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header
        tab={tab}
        setTab={setAllowedTab}
        settings={settings}
        setTweak={setTweak}
        syncState={syncState}
        currentUser={currentUser}
        isAdmin={isAdmin}
        onExport={() => setExportOpen(true)}
        onNew={() => {
          setDialogDefaultEstado("pendiente");
          setDialogOpen(true);
        }}
      />

      <main className="mx-auto max-w-[1500px] px-3 py-4 sm:px-6 sm:py-6">
        {tab === "kanban" && (
          <KanbanScreen
            activities={activities}
            setActivities={setActivities}
            gestiones={gestiones}
            funcionarios={funcionarios}
            competencias={competencias}
            filters={filters}
            setFilters={setFilters}
            density={settings.density}
            useAvatars={settings.useAvatars}
            isAdmin={isAdmin}
            currentUser={currentUser}
            onOpen={(id) => setOpenActivityId(id)}
            onAdd={(estado) => {
              setDialogDefaultEstado(estado);
              setDialogOpen(true);
            }}
          />
        )}

        {tab === "stats" && (
          <StatsScreen
            activities={activities}
            gestiones={gestiones}
            funcionarios={funcionarios}
            competencias={competencias}
            entregables={entregables}
            useAvatars={settings.useAvatars}
            currentUser={currentUser}
            isAdmin={isAdmin}
            onOpen={(id) => setOpenActivityId(id)}
          />
        )}

        {isAdmin && tab === "catalogs" && (
          <CatalogsScreen
            gestiones={gestiones}
            setGestiones={setGestiones}
            funcionarios={funcionarios}
            setFuncionarios={setFuncionarios}
            competencias={competencias}
            setCompetencias={setCompetencias}
            entregables={entregables}
            setEntregables={setEntregables}
            activities={activities}
            setActivities={setActivities}
            useAvatars={settings.useAvatars}
          />
        )}

        {isAdmin && tab === "users" && (
          <UsersScreen
            funcionarios={funcionarios}
            currentUser={currentUser}
          />
        )}
      </main>

      {openActivityId && (
        <DetailPanel
          activityId={openActivityId}
          activities={activities}
          setActivities={setActivities}
          gestiones={gestiones}
          funcionarios={funcionarios}
          competencias={competencias}
          entregables={entregables}
          useAvatars={settings.useAvatars}
          isAdmin={isAdmin}
          currentUser={currentUser}
          saveNow={(nextActivities) => saveNow({ activities: nextActivities })}
          onClose={() => setOpenActivityId(null)}
        />
      )}

      <NewActivityDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreate={createActivity}
        gestiones={gestiones}
        funcionarios={funcionarios}
        competencias={competencias}
        entregables={entregables}
        defaultEstado={dialogDefaultEstado}
        currentUser={currentUser}
        isAdmin={isAdmin}
      />

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        activities={activities}
        gestiones={gestiones}
        funcionarios={funcionarios}
        competencias={competencias}
        entregables={entregables}
      />
    </div>
  );
}

function Header({
  tab,
  setTab,
  settings,
  setTweak,
  syncState,
  currentUser,
  isAdmin,
  onExport,
  onNew,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  settings: Settings;
  setTweak: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  syncState: SyncState;
  currentUser: AuthUser;
  isAdmin: boolean;
  onExport: () => void;
  onNew: () => void;
}) {
  const displayName = currentUser.nombre.trim() || "Usuario";

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2 sm:px-6 xl:flex-nowrap xl:gap-6 xl:py-2.5">
        {/* user session */}
        <div className="order-1 flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2.5 xl:order-none">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm">
            <Icon name="kanban" size={16} />
          </div>
          <div className="hidden min-w-0 max-w-[220px] flex-col items-start sm:flex">
            <div className="truncate text-[13px] font-semibold leading-tight text-slate-900">
              {displayName}
            </div>
            <form action="/api/auth/logout" method="post" className="mt-1 inline-flex">
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[11px]"
                title="Cerrar sesión"
              >
                <Icon name="logout" size={12} />
                Cerrar sesión
              </Button>
            </form>
          </div>
          <form action="/api/auth/logout" method="post" className="inline-flex sm:hidden">
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <Icon name="logout" size={14} />
            </Button>
          </form>
        </div>

        {/* tabs */}
        <nav
          className="order-3 flex w-full min-w-0 items-stretch gap-0.5 overflow-x-auto rounded-lg bg-slate-100/70 p-1 xl:order-none xl:ml-2 xl:w-auto xl:items-center xl:overflow-visible xl:bg-transparent xl:p-0"
          aria-label="Navegación principal"
        >
          <TabBtn active={tab === "kanban"} onClick={() => setTab("kanban")}>
            <Icon name="kanban" size={14} /> Tablero
          </TabBtn>
          <TabBtn active={tab === "stats"} onClick={() => setTab("stats")}>
            <Icon name="chart" size={14} /> Estadísticas
          </TabBtn>
          {isAdmin && (
            <>
              <TabBtn active={tab === "catalogs"} onClick={() => setTab("catalogs")}>
                <Icon name="list" size={14} /> Catálogos
              </TabBtn>
              <TabBtn active={tab === "users"} onClick={() => setTab("users")}>
                <Icon name="users" size={14} /> Usuarios
              </TabBtn>
            </>
          )}
        </nav>

        <div className="order-2 ml-auto flex shrink-0 items-center gap-1 sm:gap-2 xl:order-none">
          <SyncIndicator state={syncState} />
          <GoogleCalendarControl currentUser={currentUser} />
          <SettingsMenu settings={settings} setTweak={setTweak} />
          <Button
            variant="outline"
            className="h-11 w-11 px-0 sm:h-8 sm:w-auto sm:px-3"
            onClick={onExport}
            title="Exportar actividades"
            aria-label="Exportar actividades"
          >
            <Icon name="download" size={14} />
            <span className="hidden sm:inline">Exportar</span>
          </Button>
          <Button
            className="h-11 w-11 px-0 sm:h-8 sm:w-auto sm:px-3"
            onClick={onNew}
            title="Nueva actividad"
            aria-label="Nueva actividad"
          >
            <Icon name="plus" size={14} />
            <span className="hidden sm:inline">Nueva actividad</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

function formatSyncDate(value: string | null): string {
  if (!value) return "Pendiente";
  return new Date(value).toLocaleString("es-EC", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function GoogleCalendarControl({ currentUser }: { currentUser: AuthUser }) {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [busy, setBusy] = useState<GoogleBusyState>("status");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useClickAway(ref, () => setOpen(false));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") !== "connected") return;

    setOpen(true);
    params.delete("google");
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

  const loadStatus = React.useCallback(async () => {
    setBusy((state) => state || "status");
    setError("");
    try {
      const res = await fetch("/api/google/status");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || res.statusText);
      setStatus(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setStatus({ connected: false, googleEmail: null, lastSyncedAt: null, lastError: null });
    } finally {
      setBusy((state) => (state === "status" ? null : state));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBusy("status");
    setError("");
    (async () => {
      try {
        const res = await fetch("/api/google/status");
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || res.statusText);
        if (!cancelled) setStatus(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error desconocido");
          setStatus({ connected: false, googleEmail: null, lastSyncedAt: null, lastError: null });
        }
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser.id]);

  async function syncNow() {
    setBusy("sync");
    setError("");
    try {
      const res = await fetch("/api/google/sync", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || res.statusText);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!window.confirm("¿Desvincular Google Calendar de este usuario?")) return;
    setBusy("disconnect");
    setError("");
    try {
      const res = await fetch("/api/google/disconnect", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || res.statusText);
      setStatus({ connected: false, googleEmail: null, lastSyncedAt: null, lastError: null });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setBusy(null);
    }
  }

  if (busy === "status" && !status) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-11 min-w-11 px-0 sm:h-7 sm:min-w-0 sm:px-2.5"
        disabled
        title="Google Calendar"
        aria-label="Consultando estado de Google Calendar"
      >
        <Icon name="loader" size={13} className="animate-spin" />
        <span className="hidden lg:inline">Google</span>
      </Button>
    );
  }

  if (!status?.connected) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-11 min-w-11 px-0 sm:h-7 sm:min-w-0 sm:px-2.5"
        onClick={() => {
          window.location.href = "/api/google/connect";
        }}
        title={error || "Vincular Google Calendar"}
        aria-label={error || "Vincular Google Calendar"}
      >
        <Icon name="calendar" size={13} />
        <span className="hidden lg:inline">Vincular Google</span>
      </Button>
    );
  }

  const googleEmail = status.googleEmail || "Cuenta Google";
  const connectedTitle = status.lastError
    ? status.lastError
    : `Google Calendar vinculado a ${googleEmail}`;

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "h-11 min-w-11 max-w-[270px] justify-center overflow-hidden px-0 sm:h-7 sm:min-w-0 sm:justify-start sm:px-2.5",
          status.lastError
            ? "border-red-200 bg-red-50 text-red-800 hover:bg-red-100"
            : "border-green-200 bg-green-50 text-green-800 hover:bg-green-100",
        )}
        onClick={() => setOpen((value) => !value)}
        title={connectedTitle}
        aria-label={connectedTitle}
      >
        <Icon name={status.lastError ? "alert" : "checkCircle"} size={13} />
        <span className="hidden lg:inline">{status.lastError ? "Error Google" : "Vinculado"}</span>
        <span className="hidden max-w-[155px] truncate xl:inline">{googleEmail}</span>
      </Button>
      {open && (
        <div className="fixed inset-x-3 top-28 z-40 max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-xl bg-white p-3 ring-1 ring-foreground/10 shadow-xl xl:absolute xl:inset-x-auto xl:right-0 xl:top-auto xl:mt-2 xl:max-h-none xl:w-72 xl:overflow-visible">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Google Calendar
            </div>
            <Badge variant={status.lastError ? "red" : "green"}>
              {status.lastError ? "Error" : "Vinculado"}
            </Badge>
          </div>
          <div className="mt-2 truncate text-sm font-semibold text-slate-900">
            {googleEmail}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Ultima sincronizacion: {formatSyncDate(status.lastSyncedAt)}
          </div>
          {(status.lastError || error) && (
            <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 ring-1 ring-red-200">
              {error || status.lastError}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-11 flex-1 sm:h-7 sm:flex-none"
              onClick={syncNow}
              disabled={busy === "sync"}
            >
              <Icon name={busy === "sync" ? "loader" : "refresh"} size={13} className={busy === "sync" ? "animate-spin" : ""} />
              Sincronizar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-11 flex-1 sm:h-7 sm:flex-none"
              onClick={disconnect}
              disabled={busy === "disconnect"}
            >
              <Icon name={busy === "disconnect" ? "loader" : "close"} size={13} className={busy === "disconnect" ? "animate-spin" : ""} />
              Desvincular
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative inline-flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-md px-1 py-1 text-[10px] font-medium leading-tight transition sm:min-h-0 sm:flex-row sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm xl:flex-none",
        active
          ? "bg-white text-slate-900 shadow-sm ring-1 ring-foreground/10"
          : "text-slate-600 hover:text-slate-900 hover:bg-white/60",
      )}
    >
      {children}
    </button>
  );
}

/* Settings popover — view controls for the board. */
function SettingsMenu({
  settings,
  setTweak,
}: {
  settings: Settings;
  setTweak: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickAway(ref, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="icon"
        className="h-11 w-11 sm:h-8 sm:w-8"
        onClick={() => setOpen((o) => !o)}
        title="Vista"
        aria-label="Opciones de vista"
      >
        <Icon name="filter" size={14} />
      </Button>
      {open && (
        <div className="fixed inset-x-3 top-28 z-40 max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-xl bg-white p-3 ring-1 ring-foreground/10 shadow-xl xl:absolute xl:inset-x-auto xl:right-0 xl:top-auto xl:mt-2 xl:max-h-none xl:w-64 xl:overflow-visible">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Tablero</div>
          <div className="mt-2 space-y-2">
            <div>
              <div className="mb-1 text-xs font-medium text-slate-700">Densidad de cards</div>
              <Seg
                value={settings.density}
                options={[
                  { value: "standard", label: "Estándar" },
                  { value: "compact", label: "Compacto" },
                ]}
                onChange={(v) => setTweak("density", v as Density)}
              />
            </div>
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span className="text-xs font-medium text-slate-700">Avatares con color</span>
              <Toggle on={settings.useAvatars} onChange={(v) => setTweak("useAvatars", v)} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function Seg({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex w-full rounded-lg bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-11 flex-1 rounded-md px-2 py-1 text-xs font-medium transition sm:min-h-0",
            value === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="relative inline-flex h-11 w-12 shrink-0 items-center justify-center sm:h-4 sm:w-7"
    >
      <span
        className={cn(
          "relative inline-flex h-7 w-12 items-center rounded-full transition-colors sm:h-4 sm:w-7",
          on ? "bg-slate-900" : "bg-slate-300",
        )}
      >
        <span
          className={cn(
            "absolute left-1 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform sm:left-0.5 sm:h-3 sm:w-3",
            on ? "translate-x-5 sm:translate-x-3" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}

/* ── Screens ────────────────────────────────────────────────────────── */

function KanbanScreen({
  activities,
  setActivities,
  gestiones,
  funcionarios,
  competencias,
  filters,
  setFilters,
  density,
  useAvatars,
  isAdmin,
  currentUser,
  onOpen,
  onAdd,
}: {
  activities: Actividad[];
  setActivities: React.Dispatch<React.SetStateAction<Actividad[]>>;
  gestiones: Gestion[];
  funcionarios: Funcionario[];
  competencias: Competencia[];
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  density: Density;
  useAvatars: boolean;
  isAdmin: boolean;
  currentUser: AuthUser;
  onOpen: (id: string) => void;
  onAdd: (estado: EstadoActividad) => void;
}) {
  const [view, setView] = useState<BoardView>("columns");

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of activities) m[a.estado] = (m[a.estado] || 0) + 1;
    m.fechaFinSuperada = activities.filter(
      (a) => a.estado !== "cumplida" && daysBetween(TODAY_ISO, a.fechaFin) < 0,
    ).length;
    return m;
  }, [activities]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar actividad…"
              className="h-11 w-full pl-8 sm:h-9"
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            />
          </div>
          <Select
            value={filters.funcionario}
            onChange={(e) => setFilters({ ...filters, funcionario: e.target.value })}
            className="h-11 w-full sm:h-9"
          >
            <option value="all">Todos los funcionarios</option>
            {funcionarios.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
              </option>
            ))}
          </Select>
          <Select
            value={filters.competencia}
            onChange={(e) => setFilters({ ...filters, competencia: e.target.value })}
            className="h-11 w-full sm:col-span-2 sm:h-9"
          >
            <option value="all">Todas las competencias</option>
            {competencias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} — {gestionNombre(c.gestionId, gestiones)}
              </option>
            ))}
          </Select>
      </div>

      {/* Page header */}
      <div className="flex flex-wrap items-stretch justify-between gap-3 sm:items-end">
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight text-slate-900 sm:text-2xl">Tablero de Actividades</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <span>{activities.length} actividades</span>
            <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:block" />
            <span>
              <b className="text-red-600">{counts.fechaFinSuperada}</b> con fecha fin superada
            </span>
            <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:block" />
            <span>
              <b className="text-slate-700">{counts.cumplida || 0}</b> cumplidas
            </span>
          </div>
        </div>
        <div className="w-full shrink-0 sm:w-64">
          <Seg
            value={view}
            options={[
              { value: "columns", label: "Columnas" },
              { value: "week", label: "Semana" },
              { value: "month", label: "Mes" },
            ]}
            onChange={(v) => setView(v as BoardView)}
          />
        </div>
      </div>

      {view === "columns" ? (
        <KanbanBoard
          activities={activities}
          setActivities={setActivities}
          gestiones={gestiones}
          funcionarios={funcionarios}
          competencias={competencias}
          useAvatars={useAvatars}
          density={density}
          canCreate={isAdmin || Boolean(currentUser.funcionarioId)}
          canManageActivity={(activity) =>
            isAdmin || canFuncionarioEditActivity(activity, currentUser.funcionarioId)
          }
          onOpen={onOpen}
          onAdd={onAdd}
          filters={filters}
        />
      ) : (
        <CalendarView
          mode={view}
          activities={activities}
          gestiones={gestiones}
          funcionarios={funcionarios}
          competencias={competencias}
          useAvatars={useAvatars}
          filters={filters}
          onOpen={onOpen}
        />
      )}
    </div>
  );
}

function StatsScreen({
  activities,
  gestiones,
  funcionarios,
  competencias,
  entregables,
  useAvatars,
  currentUser,
  isAdmin,
  onOpen,
}: {
  activities: Actividad[];
  gestiones: Gestion[];
  funcionarios: Funcionario[];
  competencias: Competencia[];
  entregables: Entregable[];
  useAvatars: boolean;
  currentUser: AuthUser;
  isAdmin: boolean;
  onOpen: (activityId: string) => void;
}) {
  const currentMonth = useMemo(() => {
    const [year, month] = TODAY_ISO.split("-").map(Number);
    return {
      from: `${TODAY_ISO.slice(0, 7)}-01`,
      to: iso(new Date(Date.UTC(year, month, 0, 12))),
    };
  }, []);
  const [dateMode, setDateMode] = useState<StatsDateMode>("current-month");
  const [customFrom, setCustomFrom] = useState(currentMonth.from);
  const [customTo, setCustomTo] = useState(currentMonth.to);

  const activeRange = dateMode === "current-month"
    ? currentMonth
    : { from: customFrom, to: customTo };
  const invalidRange = !activeRange.from || !activeRange.to || activeRange.from > activeRange.to;
  const filteredActivities = useMemo(() => {
    if (invalidRange) return [];
    return activities.filter((activity) => {
      const startDate = dateOnly(activity.fechaInicio);
      const endDate = dateOnly(activity.fechaFin);
      return startDate <= activeRange.to && endDate >= activeRange.from;
    });
  }, [activities, activeRange.from, activeRange.to, invalidRange]);

  const visibleFuncionarios = isAdmin
    ? funcionarios
    : funcionarios.filter((f) => f.id === currentUser.funcionarioId);
  const subtitle = isAdmin
    ? "Métricas generales y cumplimiento por funcionario"
    : "Métricas de tu usuario";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold leading-tight text-slate-900 sm:text-2xl">Estadísticas</h1>
        <div className="mt-1 text-sm text-slate-500">
          {subtitle} · corte al {fmtFechaLarga(TODAY_ISO)}
        </div>
      </div>

      <section
        className="rounded-xl bg-white p-3 ring-1 ring-foreground/10 sm:p-4"
        aria-label="Filtro de fechas para los gráficos"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-slate-700">Período de los gráficos</div>
            <div className="flex flex-col gap-2 min-[420px]:flex-row" role="group" aria-label="Tipo de período">
              <Button
                type="button"
                size="sm"
                variant={dateMode === "current-month" ? "default" : "outline"}
                aria-pressed={dateMode === "current-month"}
                onClick={() => setDateMode("current-month")}
              >
                <Icon name="calendar" size={14} /> Mes actual
              </Button>
              <Button
                type="button"
                size="sm"
                variant={dateMode === "custom" ? "default" : "outline"}
                aria-pressed={dateMode === "custom"}
                onClick={() => setDateMode("custom")}
              >
                <Icon name="filter" size={14} /> Rango personalizado
              </Button>
            </div>
          </div>

          {dateMode === "custom" ? (
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="stats-date-from">Desde</Label>
                <Input
                  id="stats-date-from"
                  type="date"
                  lang="es-EC"
                  value={customFrom}
                  max={customTo || undefined}
                  aria-invalid={invalidRange}
                  aria-describedby="stats-date-status"
                  onChange={(event) => setCustomFrom(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stats-date-to">Hasta</Label>
                <Input
                  id="stats-date-to"
                  type="date"
                  lang="es-EC"
                  value={customTo}
                  min={customFrom || undefined}
                  aria-invalid={invalidRange}
                  aria-describedby="stats-date-status"
                  onChange={(event) => setCustomTo(event.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200">
              {fmtFechaLarga(currentMonth.from)} – {fmtFechaLarga(currentMonth.to)}
            </div>
          )}
        </div>

        <div
          id="stats-date-status"
          className="mt-3 flex items-start gap-2 border-t border-slate-100 pt-3 text-xs"
          aria-live="polite"
        >
          <Icon
            name={invalidRange ? "alert" : "calendar"}
            size={14}
            className={invalidRange ? "mt-0.5 shrink-0 text-red-500" : "mt-0.5 shrink-0 text-slate-400"}
          />
          {invalidRange ? (
            <span className="text-red-600">Selecciona un rango de fechas válido.</span>
          ) : (
            <span className="text-slate-500">
              Rango de actividad: {fmtFechaLarga(activeRange.from)} – {fmtFechaLarga(activeRange.to)} ·{" "}
              <b className="text-slate-700">{filteredActivities.length}</b> de {activities.length} actividades
            </span>
          )}
        </div>
      </section>

      {invalidRange ? (
        <div className="rounded-xl bg-white px-4 py-12 text-center text-sm text-slate-500 ring-1 ring-foreground/10">
          Completa ambas fechas para mostrar las estadísticas.
        </div>
      ) : (
        <StatsView
          activities={filteredActivities}
          gestiones={gestiones}
          funcionarios={visibleFuncionarios}
          responsables={funcionarios}
          competencias={competencias}
          entregables={entregables}
          useAvatars={useAvatars}
          dateRange={activeRange}
          onOpenActivity={onOpen}
        />
      )}
    </div>
  );
}

function CatalogsScreen(props: {
  gestiones: Gestion[];
  setGestiones: React.Dispatch<React.SetStateAction<Gestion[]>>;
  funcionarios: Funcionario[];
  setFuncionarios: React.Dispatch<React.SetStateAction<Funcionario[]>>;
  competencias: Competencia[];
  setCompetencias: React.Dispatch<React.SetStateAction<Competencia[]>>;
  entregables: Entregable[];
  setEntregables: React.Dispatch<React.SetStateAction<Entregable[]>>;
  activities: Actividad[];
  setActivities: React.Dispatch<React.SetStateAction<Actividad[]>>;
  useAvatars: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold leading-tight text-slate-900 sm:text-2xl">Catálogos</h1>
        <div className="mt-1 text-sm text-slate-500">
          Administra gestiones, funcionarios, competencias y entregables. Estos catálogos alimentan el tablero.
        </div>
      </div>
      <CatalogsView {...props} />
    </div>
  );
}

function UsersScreen({
  funcionarios,
  currentUser,
}: {
  funcionarios: Funcionario[];
  currentUser: AuthUser;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold leading-tight text-slate-900 sm:text-2xl">Usuarios</h1>
        <div className="mt-1 text-sm text-slate-500">
          Crea accesos, asigna roles y vincula cada usuario con su funcionario.
        </div>
      </div>
      <UsersView funcionarios={funcionarios} currentUser={currentUser} />
    </div>
  );
}

/* ── Sync / load UI ─────────────────────────────────────────────────── */

function SyncIndicator({ state }: { state: SyncState }) {
  if (state === "idle") return null;
  const map: Record<Exclude<SyncState, "idle">, { icon: IconName; text: string; cls: string; spin?: boolean }> = {
    saving: { icon: "loader", text: "Guardando…", cls: "text-slate-500", spin: true },
    saved: { icon: "check", text: "Guardado", cls: "text-emerald-600" },
    error: { icon: "alert", text: "Error al guardar", cls: "text-red-600" },
  };
  const s = map[state];
  return (
    <div className={cn("flex items-center gap-1.5 text-xs font-medium", s.cls)} title="Sincronización con la base de datos">
      <Icon name={s.icon} size={14} className={s.spin ? "animate-spin" : undefined} />
      <span className="hidden sm:inline">{s.text}</span>
    </div>
  );
}

function LoadingGate({
  state,
  error,
  onRetry,
}: {
  state: LoadState;
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900">
      {state === "error" ? (
        <div className="max-w-md rounded-xl bg-white p-6 text-center ring-1 ring-foreground/10 shadow-sm">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <Icon name="alert" size={20} />
          </div>
          <div className="text-sm font-semibold text-slate-900">No se pudo cargar desde la base de datos</div>
          <p className="mx-auto mt-1.5 max-w-sm text-xs text-slate-500 break-words">{error}</p>
          <p className="mx-auto mt-2 max-w-sm text-xs text-slate-400">
            Revisa que PostgreSQL esté arriba y que <span className="font-mono">DATABASE_URL</span> sea
            correcta.
          </p>
          <Button className="mt-4" onClick={onRetry}>
            <Icon name="refresh" size={14} /> Reintentar
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 text-sm text-slate-500">
          <Icon name="loader" size={18} className="animate-spin" />
          Cargando datos…
        </div>
      )}
    </div>
  );
}
