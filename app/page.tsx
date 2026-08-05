"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Icon,
  Input,
  Label,
  avatarGradient,
  useClickAway,
  type IconName,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  TODAY_ISO,
  addDays,
  dateOnly,
  daysBetween,
  fmtFecha,
  fmtFechaLarga,
  gestionNombre,
  gestionTone,
  initials,
  iso,
  type Actividad,
  type Competencia,
  type Entregable,
  type EstadoActividad,
  type Funcionario,
  type Gestion,
} from "@/lib/data";
import {
  KanbanBoard,
  boardMonth,
  filterActivities,
  inBoardMonth,
  type Filters,
} from "@/components/kanban";
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
type LoadState = "loading" | "ready" | "error";
type SyncState = "idle" | "saving" | "saved" | "error";
type GoogleBusyState = "status" | "sync" | "disconnect" | "preferences" | null;
type HeaderMenu = "google" | "perfil" | null;

interface GoogleStatus {
  connected: boolean;
  googleEmail: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  syncReuniones: boolean;
  syncAsignaciones: boolean;
}

const GOOGLE_DISCONNECTED_STATUS: GoogleStatus = {
  connected: false,
  googleEmail: null,
  lastSyncedAt: null,
  lastError: null,
  syncReuniones: true,
  syncAsignaciones: true,
};

interface Settings {
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

/* El rediseño retira el menú de ajustes de la cabecera: el tablero se muestra
   siempre en densidad estándar y con avatares de color. */
const VIEW_SETTINGS: Settings = { useAvatars: true };

export default function Page() {
  const settings = VIEW_SETTINGS;

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

  /* La cuenta referencia al funcionario por clave foránea, así que Usuarios
     necesita esperar a que el documento esté confirmado en el servidor antes
     de crear o borrar la cuenta asociada. */
  async function persistFuncionarios(next: Funcionario[], nextActivities?: Actividad[]) {
    setFuncionarios(next);
    if (nextActivities) setActivities(nextActivities);
    // Ambas colecciones viajan en el mismo PUT: el servidor rechaza el
    // documento si una actividad apunta a un funcionario que ya no existe.
    saveNow({ funcionarios: next, activities: nextActivities });
    await flushPendingChanges();
  }

  if (loadState !== "ready" || !currentUser) {
    return <LoadingGate state={loadState} error={loadError} onRetry={retry} />;
  }

  return (
    <div className="min-h-screen bg-app text-ink">
      <Header
        tab={tab}
        setTab={setAllowedTab}
        syncState={syncState}
        currentUser={currentUser}
        funcionarios={funcionarios}
        gestiones={gestiones}
        isAdmin={isAdmin}
        query={filters.q}
        setQuery={(q) => setFilters((f) => ({ ...f, q }))}
        onExport={() => setExportOpen(true)}
        onNew={() => {
          setDialogDefaultEstado("pendiente");
          setDialogOpen(true);
        }}
      />

      <main className="mx-auto max-w-[1500px] px-3 py-4 sm:px-6 sm:py-[22px] sm:pb-14">
        {tab === "kanban" && (
          <KanbanScreen
            activities={activities}
            setActivities={setActivities}
            gestiones={gestiones}
            funcionarios={funcionarios}
            competencias={competencias}
            filters={filters}
            setFilters={setFilters}
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
            competencias={competencias}
            setCompetencias={setCompetencias}
            entregables={entregables}
            setEntregables={setEntregables}
            activities={activities}
            setActivities={setActivities}
          />
        )}

        {isAdmin && tab === "users" && (
          <UsersScreen
            funcionarios={funcionarios}
            setFuncionarios={setFuncionarios}
            gestiones={gestiones}
            activities={activities}
            currentUser={currentUser}
            useAvatars={settings.useAvatars}
            persistFuncionarios={persistFuncionarios}
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
  syncState,
  currentUser,
  funcionarios,
  gestiones,
  isAdmin,
  query,
  setQuery,
  onExport,
  onNew,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  syncState: SyncState;
  currentUser: AuthUser;
  funcionarios: Funcionario[];
  gestiones: Gestion[];
  isAdmin: boolean;
  query: string;
  setQuery: (q: string) => void;
  onExport: () => void;
  onNew: () => void;
}) {
  // Un solo popover abierto a la vez (cabecera: Google y perfil).
  const [menu, setMenu] = useState<HeaderMenu>(null);

  return (
    <header className="sticky top-0 z-30 border-b border-line-strong bg-app/[.86] backdrop-blur-[14px]">
      <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-6 sm:py-3 xl:flex-nowrap xl:gap-[18px]">
        {/* marca */}
        <div className="order-1 flex shrink-0 items-center gap-[11px] xl:order-none">
          <div className="flex h-[38px] w-[38px] items-center justify-center rounded-xl bg-ink text-white shadow-[0_2px_6px_rgba(18,18,26,.18)]">
            <Icon name="kanban" size={19} />
          </div>
          <div className="hidden flex-col gap-px sm:flex">
            <div className="text-[14px] font-bold leading-[1.15] tracking-[-.02em]">Kanban DGTAR</div>
            <div className="text-[10.5px] font-medium leading-[1.15] text-ink-faint">
              Dirección de Planificación
            </div>
          </div>
        </div>

        {/* navegación */}
        <nav
          className="order-3 flex w-full min-w-0 items-center gap-1 overflow-x-auto rounded-full bg-track p-1 xl:order-none xl:w-auto"
          aria-label="Navegación principal"
        >
          <TabBtn active={tab === "kanban"} onClick={() => setTab("kanban")}>
            <Icon name="kanban" size={15} /> Tablero
          </TabBtn>
          <TabBtn active={tab === "stats"} onClick={() => setTab("stats")}>
            <Icon name="chart" size={15} /> Estadísticas
          </TabBtn>
          {isAdmin && (
            <>
              <TabBtn active={tab === "catalogs"} onClick={() => setTab("catalogs")}>
                <Icon name="list" size={15} /> Catálogos
              </TabBtn>
              <TabBtn active={tab === "users"} onClick={() => setTab("users")}>
                <Icon name="users" size={15} /> Usuarios
              </TabBtn>
            </>
          )}
        </nav>

        {/* buscador — comparte estado con el del Tablero */}
        <div className="order-4 flex w-full min-w-0 justify-center xl:order-none xl:flex-1">
          <HeaderSearch query={query} setQuery={setQuery} />
        </div>

        {/* acciones */}
        <div className="order-2 ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2 xl:order-none xl:ml-0">
          <SyncIndicator state={syncState} />
          <GoogleCalendarControl
            currentUser={currentUser}
            open={menu === "google"}
            setOpen={(open) => setMenu(open ? "google" : null)}
          />
          <Button
            shape="pill"
            className="w-11 px-0 sm:w-auto sm:px-[15px]"
            onClick={onNew}
            title="Nueva actividad"
            aria-label="Nueva actividad"
          >
            <Icon name="plus" size={14} />
            <span className="hidden sm:inline">Nueva actividad</span>
          </Button>
          <ProfileMenu
            currentUser={currentUser}
            funcionarios={funcionarios}
            gestiones={gestiones}
            onExport={onExport}
            open={menu === "perfil"}
            setOpen={(open) => setMenu(open ? "perfil" : null)}
          />
        </div>
      </div>
    </header>
  );
}

/* Buscador de la cabecera: controlado, con atajo ⌘/Ctrl + K y botón de limpieza. */
function HeaderSearch({ query, setQuery }: { query: string; setQuery: (q: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const buscando = query.trim().length > 0;

  return (
    <div
      className={cn(
        "flex h-[38px] w-full max-w-[340px] items-center gap-[9px] rounded-full border bg-white pl-[14px] pr-1.5 shadow-card transition-colors",
        buscando ? "border-accent-border ring-[3px] ring-accent/10" : "border-line-strong",
      )}
    >
      <Icon name="search" size={15} className="shrink-0 text-ink-faint" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar actividad…"
        aria-label="Buscar actividad"
        className="h-full min-w-0 flex-1 border-0 bg-transparent text-[13px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-faint"
      />
      {buscando ? (
        <button
          type="button"
          onClick={() => setQuery("")}
          aria-label="Limpiar búsqueda"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-estado-pendiente-bg text-ink-muted transition-colors hover:bg-chip hover:text-ink"
        >
          <Icon name="close" size={12} />
        </button>
      ) : (
        <span className="hidden shrink-0 rounded-full bg-estado-pendiente-bg px-2 py-[3px] text-[10.5px] font-semibold text-ink-faint sm:inline">
          ⌘ K
        </span>
      )}
    </div>
  );
}

/* Perfil: avatar con popover de cuenta y cierre de sesión. */
function ProfileMenu({
  currentUser,
  funcionarios,
  gestiones,
  onExport,
  open,
  setOpen,
}: {
  currentUser: AuthUser;
  funcionarios: Funcionario[];
  gestiones: Gestion[];
  onExport: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useClickAway(ref, () => setOpen(false));

  const funcionario = funcionarios.find((f) => f.id === currentUser.funcionarioId);
  const displayName = currentUser.nombre.trim() || funcionario?.nombre.trim() || "Usuario";
  const monograma = initials(displayName);
  const gestion = gestiones.find((g) => g.id === funcionario?.gestionId);
  const fondo = funcionario ? avatarGradient(funcionario.color) : "linear-gradient(135deg,#4B4B57,#12121A)";
  const titulo = funcionario?.cargo ? `${displayName} · ${funcionario.cargo}` : displayName;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={titulo}
        aria-label={`Cuenta de ${displayName}`}
        aria-expanded={open}
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full text-[12px] font-bold text-white sm:h-[34px] sm:w-[34px]",
          open ? "shadow-avatar-active" : "shadow-avatar",
        )}
        style={{ background: fondo }}
      >
        {monograma}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+9px)] z-[60] w-[262px] rounded-2xl border border-line bg-white p-[7px] shadow-popover">
          <div className="flex items-center gap-[11px] px-[11px] pb-3 pt-2.5">
            <span
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
              style={{ background: fondo }}
            >
              {monograma}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-bold tracking-[-.01em]">{displayName}</div>
              <div className="truncate font-mono text-[11px] font-medium text-ink-ghost">
                {currentUser.email}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-[7px] px-[11px] pb-[11px]">
            <Badge variant={currentUser.role === "admin" ? "blue" : "slate"}>
              {currentUser.role === "admin" ? "Admin" : "User"}
            </Badge>
            {gestion && (
              <Badge variant={gestionTone(gestion.id, gestiones)} className="truncate">
                {gestion.nombre}
              </Badge>
            )}
          </div>
          <div className="border-t border-line-soft pt-1.5">
            <button
              type="button"
              /* Abre primero y cierra después: así no depende del orden de
                 desmontaje del popover. */
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onExport();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-btn px-[11px] py-2.5 text-left text-[13px] font-semibold text-ink-soft transition-colors hover:bg-surface-subtle hover:text-ink"
            >
              <Icon name="download" size={15} className="text-ink-faint" />
              Exportar actividades
            </button>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 rounded-btn px-[11px] py-2.5 text-left text-[13px] font-semibold text-estado-vencida-fg transition-colors hover:bg-estado-vencida-bg"
              >
                <Icon name="logout" size={15} />
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
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

function GoogleCalendarControl({
  currentUser,
  open,
  setOpen,
}: {
  currentUser: AuthUser;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [busy, setBusy] = useState<GoogleBusyState>("status");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setStatus(GOOGLE_DISCONNECTED_STATUS);
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
          setStatus(GOOGLE_DISCONNECTED_STATUS);
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

  // Los dos tipos son independientes, pero al menos uno debe quedar marcado:
  // sin ninguno no habria nada que vincular en Google Calendar.
  async function togglePreference(key: "syncReuniones" | "syncAsignaciones") {
    if (!status?.connected) return;
    const next = { syncReuniones: status.syncReuniones, syncAsignaciones: status.syncAsignaciones };
    next[key] = !next[key];
    if (!next.syncReuniones && !next.syncAsignaciones) {
      setError("Selecciona al menos un tipo de actividad para sincronizar.");
      return;
    }
    setBusy("preferences");
    setError("");
    setStatus({ ...status, ...next });
    try {
      const res = await fetch("/api/google/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || res.statusText);
      setStatus(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      await loadStatus();
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
      setStatus(GOOGLE_DISCONNECTED_STATUS);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setBusy(null);
    }
  }

  // Botón circular común a los tres estados (cargando / sin vincular / vinculado).
  const circle =
    "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-white transition-colors hover:border-line-hover hover:bg-surface-subtle disabled:pointer-events-none disabled:opacity-60 sm:h-[34px] sm:w-[34px]";

  if (busy === "status" && !status) {
    return (
      <button type="button" className={circle} disabled title="Google Calendar" aria-label="Consultando estado de Google Calendar">
        <Icon name="loader" size={15} className="animate-spin text-ink-faint" />
      </button>
    );
  }

  if (!status?.connected) {
    return (
      <button
        type="button"
        className={circle}
        onClick={() => {
          window.location.href = "/api/google/connect";
        }}
        title={error || "Vincular Google Calendar"}
        aria-label={error || "Vincular Google Calendar"}
      >
        <Icon name="calendar" size={15} className="text-ink-faint" />
      </button>
    );
  }

  const googleEmail = status.googleEmail || "Cuenta Google";
  const connectedTitle = status.lastError
    ? status.lastError
    : `Google Calendar vinculado a ${googleEmail}`;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        className={circle}
        onClick={() => setOpen(!open)}
        title={connectedTitle}
        aria-label={connectedTitle}
        aria-expanded={open}
      >
        <Icon name="calendar" size={15} className="text-accent" />
        <span
          className={cn(
            "absolute -right-px -top-px h-[9px] w-[9px] rounded-full shadow-[0_0_0_2px_#F4F4F6]",
            status.lastError ? "bg-estado-vencida" : "bg-estado-cumplida",
          )}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+9px)] z-[60] w-[292px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-line bg-white p-[15px] shadow-popover">
          <div className="flex items-center justify-between gap-2.5">
            <span className="text-[10px] font-bold uppercase tracking-[.06em] text-ink-label">
              Google Calendar
            </span>
            <Badge variant={status.lastError ? "red" : "green"}>
              <Icon name={status.lastError ? "alert" : "check"} size={10} />
              {status.lastError ? "Error" : "Vinculado"}
            </Badge>
          </div>
          <div className="mt-2.5 truncate text-[13.5px] font-bold tracking-[-.01em]">{googleEmail}</div>
          <div className="mt-1 text-[11.5px] font-medium text-ink-faint">
            Última sincronización: {formatSyncDate(status.lastSyncedAt)}
          </div>
          <div className="mt-[13px] space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-[.06em] text-ink-label">
              Sincronizar
            </div>
            {(
              [
                ["syncReuniones", "Reuniones"],
                ["syncAsignaciones", "Asignaciones"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 text-[12.5px] font-medium"
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-accent"
                  checked={status[key]}
                  disabled={busy === "preferences"}
                  onChange={() => togglePreference(key)}
                />
                {label}
              </label>
            ))}
          </div>
          {(status.lastError || error) && (
            <div className="mt-2.5 rounded-btn bg-estado-vencida-bg p-2 text-[11.5px] font-medium text-estado-vencida-fg">
              {error || status.lastError}
            </div>
          )}
          <div className="mt-[13px] flex items-center gap-2">
            <Button variant="outline" className="flex-1" onClick={syncNow} disabled={busy === "sync"}>
              <Icon
                name={busy === "sync" ? "loader" : "refresh"}
                size={13}
                className={busy === "sync" ? "animate-spin" : undefined}
              />
              Sincronizar
            </Button>
            <Button
              variant="ghost"
              className="text-estado-vencida-fg hover:bg-estado-vencida-bg hover:text-estado-vencida-fg"
              onClick={disconnect}
              disabled={busy === "disconnect"}
            >
              <Icon
                name={busy === "disconnect" ? "loader" : "close"}
                size={13}
                className={busy === "disconnect" ? "animate-spin" : undefined}
              />
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
        "relative inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-[7px] whitespace-nowrap rounded-full px-3 text-[12px] font-[650] leading-tight transition-colors sm:h-8 sm:px-[15px] sm:text-[13px] xl:flex-none",
        active ? "bg-accent-soft text-accent shadow-pill" : "text-ink-muted hover:text-ink",
      )}
    >
      {children}
    </button>
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
    <div className="inline-flex w-full rounded-full bg-track p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "h-11 flex-1 rounded-full px-3 text-[12.5px] font-[650] transition-colors sm:h-8",
            value === o.value ? "bg-white text-ink shadow-seg" : "text-ink-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Screens ────────────────────────────────────────────────────────── */

/* Cursor de mes del Tablero. «Hoy» se atenúa cuando ya estás en el mes actual. */
function MonthCursor({
  label,
  offset,
  onPrev,
  onNext,
  onToday,
}: {
  label: string;
  offset: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const flecha =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-estado-pendiente-bg hover:text-ink sm:h-[26px] sm:w-[26px]";
  return (
    <div className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-line bg-white pl-[7px] pr-1.5 sm:h-9">
      <button type="button" onClick={onPrev} aria-label="Mes anterior" className={flecha}>
        <Icon name="chevronLeft" size={13} />
      </button>
      <span className="min-w-[104px] text-center text-[12.5px] font-bold tracking-[-.01em] text-ink">
        {label}
      </span>
      <button type="button" onClick={onNext} aria-label="Mes siguiente" className={flecha}>
        <Icon name="chevronRight" size={13} />
      </button>
      <button
        type="button"
        onClick={onToday}
        disabled={offset === 0}
        title={offset === 0 ? "Ya estás en el mes actual" : "Volver al mes actual"}
        className={cn(
          "h-9 shrink-0 rounded-full px-2.5 text-[11.5px] font-bold transition-colors sm:h-[26px]",
          offset === 0
            ? "cursor-default text-ink-disabled"
            : "bg-accent-soft text-accent hover:bg-accent-border/60",
        )}
      >
        Hoy
      </button>
    </div>
  );
}

/* Select nativo con la apariencia de píldora de la barra de filtros. */
function FilterSelect({
  icon,
  value,
  onChange,
  children,
  "aria-label": ariaLabel,
}: {
  icon: IconName;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  "aria-label": string;
}) {
  return (
    <div className="relative flex h-11 min-w-0 flex-1 items-center rounded-full border border-line bg-white sm:h-9 transition-colors hover:border-line-hover hover:bg-surface-subtle focus-within:border-accent-border sm:flex-none sm:basis-auto">
      <Icon name={icon} size={14} className="pointer-events-none absolute left-3.5 text-ink-faint" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="h-full w-full min-w-0 max-w-[220px] appearance-none truncate rounded-full bg-transparent pl-[34px] pr-8 text-[12.5px] font-semibold text-[#2B2B36] outline-none"
      >
        {children}
      </select>
      <Icon name="chevronDown" size={13} className="pointer-events-none absolute right-3 text-ink-ghost" />
    </div>
  );
}

function LeyendaPunto({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-[7px] w-[7px] rounded-full", className)} />
      {children}
    </span>
  );
}

function KanbanScreen({
  activities,
  setActivities,
  gestiones,
  funcionarios,
  competencias,
  filters,
  setFilters,
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
  useAvatars: boolean;
  isAdmin: boolean;
  currentUser: AuthUser;
  onOpen: (id: string) => void;
  onAdd: (estado: EstadoActividad) => void;
}) {
  const [view, setView] = useState<BoardView>("columns");
  const [boardOffset, setBoardOffset] = useState(0);

  const month = useMemo(() => boardMonth(boardOffset), [boardOffset]);
  const buscando = filters.q.trim().length > 0;

  const filtered = useMemo(
    () => filterActivities(activities, filters, { funcionarios, competencias, gestiones }),
    [activities, filters, funcionarios, competencias, gestiones],
  );

  // En columnas el conjunto visible se acota al mes del cursor; en semana y mes
  // manda la navegación propia del calendario.
  const visible = useMemo(
    () => (view === "columns" ? filtered.filter((a) => inBoardMonth(a, month)) : filtered),
    [filtered, month, view],
  );

  const counts = useMemo(() => {
    const cumplidas = visible.filter((a) => a.estado === "cumplida").length;
    const vencidas = visible.filter(
      (a) => a.estado !== "cumplida" && daysBetween(TODAY_ISO, a.fechaFin) < 0,
    ).length;
    return { total: visible.length, cumplidas, vencidas };
  }, [visible]);

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <h1 className="text-[20px] font-extrabold leading-[1.15] tracking-[-.03em] sm:text-[23px]">
            Tablero de Actividades
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-[11px] gap-y-1 text-[12.5px] font-medium text-ink-faint">
            <span>
              {counts.total} {counts.total === 1 ? "actividad" : "actividades"}
            </span>
            <span className="hidden h-[3px] w-[3px] rounded-full bg-[#D0D0D8] sm:block" />
            <span>
              <b className="font-bold text-[#E11D48]">{counts.vencidas}</b> con fecha fin superada
            </span>
            <span className="hidden h-[3px] w-[3px] rounded-full bg-[#D0D0D8] sm:block" />
            <span>
              <b className="font-bold text-ink-soft">{counts.cumplidas}</b>{" "}
              {counts.cumplidas === 1 ? "cumplida" : "cumplidas"}
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

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-2.5">
        {view === "columns" && (
          <MonthCursor
            label={month.label}
            offset={boardOffset}
            onPrev={() => setBoardOffset((o) => o - 1)}
            onNext={() => setBoardOffset((o) => o + 1)}
            onToday={() => setBoardOffset(0)}
          />
        )}

        <div
          className={cn(
            "flex h-11 min-w-[190px] flex-1 items-center gap-1.5 rounded-full border bg-white pl-[7px] pr-1.5 sm:h-9 sm:flex-none sm:basis-[240px]",
            buscando ? "border-accent-border ring-[3px] ring-accent/10" : "border-line",
          )}
        >
          <Icon name="search" size={14} className="shrink-0 text-ink-ghost" />
          <input
            type="text"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="Buscar actividad…"
            aria-label="Buscar en el tablero"
            className="h-full min-w-0 flex-1 border-0 bg-transparent text-[12.5px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-faint"
          />
          {buscando && (
            <button
              type="button"
              onClick={() => setFilters({ ...filters, q: "" })}
              aria-label="Limpiar búsqueda"
              className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-estado-pendiente-bg text-ink-muted transition-colors hover:bg-chip hover:text-ink"
            >
              <Icon name="close" size={11} />
            </button>
          )}
        </div>

        {buscando && (
          <span className="inline-flex h-11 shrink-0 items-center rounded-full bg-accent-soft px-[13px] text-[12px] font-bold text-accent sm:h-9">
            {visible.length} {visible.length === 1 ? "resultado" : "resultados"}
          </span>
        )}

        <FilterSelect
          icon="users"
          value={filters.funcionario}
          onChange={(value) => setFilters({ ...filters, funcionario: value })}
          aria-label="Filtrar por funcionario"
        >
          <option value="all">Todos los funcionarios</option>
          {funcionarios.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nombre}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          icon="briefcase"
          value={filters.competencia}
          onChange={(value) => setFilters({ ...filters, competencia: value })}
          aria-label="Filtrar por competencia"
        >
          <option value="all">Todas las competencias</option>
          {competencias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} — {gestionNombre(c.gestionId, gestiones)}
            </option>
          ))}
        </FilterSelect>

        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11px] font-semibold text-ink-ghost lg:ml-auto">
          <LeyendaPunto className="bg-estado-vencida">Fin superado</LeyendaPunto>
          <LeyendaPunto className="bg-estado-revision">Finaliza pronto</LeyendaPunto>
          <LeyendaPunto className="bg-estado-pendiente">Fin futuro</LeyendaPunto>
          <LeyendaPunto className="bg-estado-cumplida">Cumplida</LeyendaPunto>
        </div>
      </div>

      {view === "columns" ? (
        <KanbanBoard
          activities={visible}
          setActivities={setActivities}
          gestiones={gestiones}
          funcionarios={funcionarios}
          competencias={competencias}
          month={month}
          searching={buscando}
          useAvatars={useAvatars}
          canCreate={isAdmin || Boolean(currentUser.funcionarioId)}
          canManageActivity={(activity) =>
            isAdmin || canFuncionarioEditActivity(activity, currentUser.funcionarioId)
          }
          onOpen={onOpen}
          onAdd={onAdd}
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

/* ── Estadísticas: rango del período ────────────────────────────────── */

function monthRangeIso(offset: number): { from: string; to: string } {
  const [year, month] = TODAY_ISO.split("-").map(Number);
  return {
    from: iso(new Date(Date.UTC(year, month - 1 + offset, 1, 12))),
    to: iso(new Date(Date.UTC(year, month + offset, 0, 12))),
  };
}

const SHORTCUTS: { id: string; label: string; range: () => { from: string; to: string } }[] = [
  { id: "mes", label: "Este mes", range: () => monthRangeIso(0) },
  { id: "mes-anterior", label: "Mes anterior", range: () => monthRangeIso(-1) },
  { id: "30d", label: "Últimos 30 días", range: () => ({ from: iso(addDays(TODAY_ISO, -29)), to: TODAY_ISO }) },
  { id: "90d", label: "Últimos 90 días", range: () => ({ from: iso(addDays(TODAY_ISO, -89)), to: TODAY_ISO }) },
  {
    id: "trimestre",
    label: "Trimestre actual",
    range: () => {
      const [year, month] = TODAY_ISO.split("-").map(Number);
      const inicio = Math.floor((month - 1) / 3) * 3;
      return {
        from: iso(new Date(Date.UTC(year, inicio, 1, 12))),
        to: iso(new Date(Date.UTC(year, inicio + 3, 0, 12))),
      };
    },
  },
  {
    id: "anio",
    label: "Este año",
    range: () => {
      const year = Number(TODAY_ISO.slice(0, 4));
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    },
  },
];

/* "01 jun – 30 jun 2026", con ambos años si el rango los cruza. */
function fmtRango(range: { from: string; to: string }): string {
  const anioDesde = range.from.slice(0, 4);
  const anioHasta = range.to.slice(0, 4);
  const desde = anioDesde === anioHasta ? fmtFecha(range.from) : `${fmtFecha(range.from)} ${anioDesde}`;
  return `${desde} – ${fmtFecha(range.to)} ${anioHasta}`;
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
  const [statsIni, setStatsIni] = useState(SHORTCUTS[0].range().from);
  const [statsFin, setStatsFin] = useState(SHORTCUTS[0].range().to);
  const [menuRango, setMenuRango] = useState(false);
  const rangoRef = useRef<HTMLDivElement>(null);
  useClickAway(rangoRef, () => setMenuRango(false));

  // Fechas invertidas: no se bloquea el guardado, se ordena el rango.
  const invertido = Boolean(statsIni && statsFin && statsIni > statsFin);
  const range = useMemo(() => {
    const desde = statsIni || statsFin || TODAY_ISO;
    const hasta = statsFin || statsIni || TODAY_ISO;
    return desde <= hasta ? { from: desde, to: hasta } : { from: hasta, to: desde };
  }, [statsIni, statsFin]);

  // Una actividad entra si su rango se solapa con el período.
  const filteredActivities = useMemo(
    () =>
      activities.filter((activity) => {
        const inicio = dateOnly(activity.fechaInicio);
        const fin = dateOnly(activity.fechaFin);
        return inicio <= range.to && fin >= range.from;
      }),
    [activities, range],
  );

  const visibleFuncionarios = isAdmin
    ? funcionarios
    : funcionarios.filter((f) => f.id === currentUser.funcionarioId);
  const subtitle = isAdmin
    ? "Métricas generales y cumplimiento por funcionario"
    : "Métricas de tu usuario";
  const dias = daysBetween(range.from, range.to) + 1;
  const atajoActivo = SHORTCUTS.find((s) => {
    const r = s.range();
    return r.from === range.from && r.to === range.to;
  });

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <h1 className="text-[20px] font-extrabold leading-[1.15] tracking-[-.03em] sm:text-[23px]">
            Estadísticas
          </h1>
          <div className="mt-1.5 text-[12.5px] font-medium text-ink-faint">
            {subtitle} · {filteredActivities.length} de {activities.length} actividades · corte al{" "}
            {fmtFechaLarga(TODAY_ISO)}
          </div>
        </div>

        <div className="relative" ref={rangoRef}>
          <button
            type="button"
            onClick={() => setMenuRango((v) => !v)}
            aria-expanded={menuRango}
            className="flex h-11 items-center gap-2 rounded-full border border-line bg-white px-[15px] text-[12.5px] font-[650] text-ink transition-colors hover:border-line-hover hover:bg-surface-subtle sm:h-[34px]"
          >
            <Icon name="calendar" size={14} className="text-ink-faint" />
            {fmtRango(range)}
            <Icon name="chevronDown" size={12} className="text-ink-ghost" />
          </button>

          {menuRango && (
            <div className="absolute right-0 top-[calc(100%+9px)] z-[60] w-[320px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-line bg-white p-4 shadow-popover">
              <div className="text-[10px] font-[750] uppercase tracking-[.06em] text-ink-label">Período</div>
              <div className="mt-[11px] grid grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="stats-date-from" className="!text-[11px]">
                    Desde
                  </Label>
                  <Input
                    id="stats-date-from"
                    type="date"
                    lang="es-EC"
                    value={statsIni}
                    onChange={(e) => setStatsIni(e.target.value)}
                    className="!h-[38px] !rounded-btn border-line-dashed !text-[12.5px]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="stats-date-to" className="!text-[11px]">
                    Hasta
                  </Label>
                  <Input
                    id="stats-date-to"
                    type="date"
                    lang="es-EC"
                    value={statsFin}
                    onChange={(e) => setStatsFin(e.target.value)}
                    className={cn(
                      "!h-[38px] !rounded-btn !text-[12.5px]",
                      invertido ? "border-accent-border" : "border-line-dashed",
                    )}
                  />
                </div>
              </div>

              {invertido && (
                <div className="mt-2.5 flex items-center gap-[7px] rounded-[9px] bg-accent-softer px-2.5 py-2 text-[11px] font-[650] text-accent">
                  <Icon name="refresh" size={12} />
                  Fechas invertidas: se aplica {fmtRango(range)}
                </div>
              )}

              <div className="mt-[13px] text-[10px] font-[750] uppercase tracking-[.06em] text-ink-label">
                Atajos
              </div>
              <div className="mt-[9px] grid grid-cols-2 gap-[7px]">
                {SHORTCUTS.map((atajo) => {
                  const activo = atajoActivo?.id === atajo.id;
                  return (
                    <button
                      key={atajo.id}
                      type="button"
                      onClick={() => {
                        const r = atajo.range();
                        setStatsIni(r.from);
                        setStatsFin(r.to);
                      }}
                      className={cn(
                        "h-9 rounded-btn border px-2 text-[11.5px] font-[650] transition-colors",
                        activo
                          ? "border-accent-border bg-accent-softer text-accent"
                          : "border-line bg-white text-ink-soft hover:border-line-hover hover:bg-surface-subtle",
                      )}
                    >
                      {atajo.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-[13px] flex items-center justify-between gap-2.5 border-t border-line-soft pt-3">
                <span className="text-[11.5px] font-semibold text-ink-faint">
                  {dias} {dias === 1 ? "día seleccionado" : "días seleccionados"}
                </span>
                <Button onClick={() => setMenuRango(false)}>Listo</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <StatsView
        activities={filteredActivities}
        gestiones={gestiones}
        funcionarios={visibleFuncionarios}
        responsables={funcionarios}
        competencias={competencias}
        entregables={entregables}
        useAvatars={useAvatars}
        dateRange={range}
        onOpenActivity={onOpen}
      />
    </div>
  );
}

function CatalogsScreen(props: {
  gestiones: Gestion[];
  setGestiones: React.Dispatch<React.SetStateAction<Gestion[]>>;
  funcionarios: Funcionario[];
  competencias: Competencia[];
  setCompetencias: React.Dispatch<React.SetStateAction<Competencia[]>>;
  entregables: Entregable[];
  setEntregables: React.Dispatch<React.SetStateAction<Entregable[]>>;
  activities: Actividad[];
  setActivities: React.Dispatch<React.SetStateAction<Actividad[]>>;
}) {
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <h1 className="text-[20px] font-extrabold leading-[1.15] tracking-[-.03em] sm:text-[23px]">Catálogos</h1>
          <div className="mt-1.5 text-[12.5px] font-medium text-ink-faint">
            Cada gestión define sus competencias y sus entregables
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-white px-3.5 py-[7px] text-[11.5px] font-[650] text-ink-faint">
          <span className="text-ink">Gestión</span>
          <Icon name="chevronRight" size={12} className="text-ink-disabled" />
          <span className="text-ink">Competencia</span>
          <span className="text-ink-disabled">·</span>
          <span className="text-ink">Entregable</span>
        </div>
      </div>
      <CatalogsView {...props} />
    </div>
  );
}

function UsersScreen({
  funcionarios,
  setFuncionarios,
  gestiones,
  activities,
  currentUser,
  useAvatars,
  persistFuncionarios,
}: {
  funcionarios: Funcionario[];
  setFuncionarios: React.Dispatch<React.SetStateAction<Funcionario[]>>;
  gestiones: Gestion[];
  activities: Actividad[];
  currentUser: AuthUser;
  useAvatars: boolean;
  persistFuncionarios: (next: Funcionario[], nextActivities?: Actividad[]) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="min-w-0">
        <h1 className="text-[20px] font-extrabold leading-[1.15] tracking-[-.03em] sm:text-[23px]">Usuarios</h1>
        <div className="mt-1.5 text-[12.5px] font-medium text-ink-faint">
          Funcionarios de la Dirección, su gestión y su rol en la plataforma
        </div>
      </div>
      <UsersView
        funcionarios={funcionarios}
        setFuncionarios={setFuncionarios}
        gestiones={gestiones}
        activities={activities}
        currentUser={currentUser}
        useAvatars={useAvatars}
        persistFuncionarios={persistFuncionarios}
      />
    </div>
  );
}

/* ── Sync / load UI ─────────────────────────────────────────────────── */

function SyncIndicator({ state }: { state: SyncState }) {
  if (state === "idle") return null;
  const map: Record<Exclude<SyncState, "idle">, { icon: IconName; text: string; cls: string; spin?: boolean }> = {
    saving: { icon: "loader", text: "Guardando…", cls: "bg-estado-pendiente-bg text-ink-muted", spin: true },
    saved: { icon: "checkCircle", text: "Guardado", cls: "bg-estado-cumplida-bg text-estado-cumplida-fg" },
    error: { icon: "alert", text: "Error al guardar", cls: "bg-estado-vencida-bg text-estado-vencida-fg" },
  };
  const s = map[state];
  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-[650] sm:px-[11px]",
        s.cls,
      )}
      title="Sincronización con la base de datos"
    >
      <Icon name={s.icon} size={13} className={s.spin ? "animate-spin" : undefined} />
      <span className="hidden lg:inline">{s.text}</span>
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
    <div className="flex min-h-screen items-center justify-center bg-app p-6 text-ink">
      {state === "error" ? (
        <div className="max-w-md rounded-section border border-line bg-white p-6 text-center shadow-card">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-btn bg-estado-vencida-bg text-estado-vencida-fg">
            <Icon name="alert" size={20} />
          </div>
          <div className="text-[16px] font-bold tracking-[-.02em]">
            No se pudo cargar desde la base de datos
          </div>
          <p className="mx-auto mt-1.5 max-w-sm break-words text-[12px] font-medium text-ink-faint">{error}</p>
          <p className="mx-auto mt-2 max-w-sm text-[12px] font-medium text-ink-ghost">
            Revisa que PostgreSQL esté arriba y que <span className="font-mono">DATABASE_URL</span> sea
            correcta.
          </p>
          <Button className="mt-4" shape="pill" onClick={onRetry}>
            <Icon name="refresh" size={14} /> Reintentar
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 text-[13px] font-medium text-ink-faint">
          <Icon name="loader" size={18} className="animate-spin" />
          Cargando datos…
        </div>
      )}
    </div>
  );
}
