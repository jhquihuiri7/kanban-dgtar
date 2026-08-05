"use client";

import * as React from "react";
import { useEffect, useReducer, useRef, useState } from "react";
import { Badge, Button, Icon, Input, Label, Select, Textarea } from "@/components/ui";
import {
  ACTIVITY_DRAFT_VERSION,
  activityDraftStorageKey,
  isActivityDraftStorageKey,
  parseActivityDraft,
  serializeActivityDraft,
  type ActivityDraft,
} from "@/lib/activity-draft";
import { ActivityPersistenceError } from "@/lib/activity-client";
import {
  INITIAL_ACTIVITY_OPERATION,
  activityOperationReducer,
  canClearVerifiedActivityDraft,
  createSubmissionGuard,
  type ActivityCreationPhase,
  type ActivityCreationState,
  type SubmissionGuard,
} from "@/lib/activity-operation";
import { cn, createId } from "@/lib/utils";
import {
  ESTADOS,
  TIPOS,
  ZONE_TZ,
  addDays,
  gestionNombre,
  iso,
  todayIsoForZone,
  type Actividad,
  type Competencia,
  type Entregable,
  type EstadoActividad,
  type Funcionario,
  type Gestion,
  type TipoActividad,
} from "@/lib/data";
import type { AuthUser } from "@/lib/auth-token";

export type NewActivityInput = Omit<Actividad, "id" | "orden">;
export type { ActivityCreationPhase, ActivityCreationState } from "@/lib/activity-operation";
export type CreateActivityHandler = (
  input: NewActivityInput,
  clientRequestId: string,
  onPhase: (phase: ActivityCreationPhase) => void,
) => Promise<Actividad>;

type ResultDialog = "success" | "error" | null;
type ValidationField =
  | "titulo"
  | "funcionarioId"
  | "gestionId"
  | "competenciaId"
  | "entregableId"
  | "fechaInicio"
  | "fechaFin"
  | "fechaReunion"
  | "horaReunion";
type ValidationErrors = Partial<Record<ValidationField, string>>;

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

function cleanParticipantes(ids: string[], responsableId: string, validIds: Set<string>): string[] {
  return Array.from(new Set(ids.filter((id) => id && id !== responsableId && validIds.has(id))));
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3]);
}

function isClockTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function NewActivityDialog({
  open,
  onClose,
  onCreate,
  gestiones,
  funcionarios,
  competencias,
  entregables,
  defaultEstado = "pendiente",
  currentUser,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: CreateActivityHandler;
  gestiones: Gestion[];
  funcionarios: Funcionario[];
  competencias: Competencia[];
  entregables: Entregable[];
  defaultEstado?: EstadoActividad;
  currentUser: AuthUser;
  isAdmin: boolean;
}) {
  const funcionariosDisponibles = funcionarios;

  const [tipo, setTipo] = useState<TipoActividad>("asignacion");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [accionesPendientes, setAccionesPendientes] = useState("");
  const [resultadosAlcanzados, setResultadosAlcanzados] = useState("");
  const [funcionarioId, setFuncionarioId] = useState(funcionariosDisponibles[0]?.id || "");
  const [participantesIds, setParticipantesIds] = useState<string[]>([]);
  // Los tres campos del catálogo arrancan vacíos a propósito: obligan a elegir
  // en vez de aceptar el primero de la lista sin que el usuario lo mire.
  const [gestionId, setGestionId] = useState("");
  const [competenciaId, setCompetenciaId] = useState("");
  const [entregableId, setEntregableId] = useState("");
  const [fechaInicio, setFechaInicio] = useState(() => todayIsoForZone(ZONE_TZ));
  const [fechaFin, setFechaFin] = useState(() => iso(addDays(todayIsoForZone(ZONE_TZ), 7)));
  const [fechaReunion, setFechaReunion] = useState(() => todayIsoForZone(ZONE_TZ));
  const [horaReunion, setHoraReunion] = useState("09:00");
  const [estado, setEstado] = useState<Exclude<EstadoActividad, "archivada">>("pendiente");
  const [clientRequestId, setClientRequestId] = useState("");
  const [operation, dispatchOperation] = useReducer(activityOperationReducer, INITIAL_ACTIVITY_OPERATION);
  const creationState: ActivityCreationState = operation.state;
  const [resultDialog, setResultDialog] = useState<ResultDialog>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [creationErrorDetail, setCreationErrorDetail] = useState("");
  const [existingConflict, setExistingConflict] = useState<Actividad | null>(null);
  const [retryAllowed, setRetryAllowed] = useState(true);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftScope, setDraftScope] = useState("");
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [draftStorageWarning, setDraftStorageWarning] = useState("");
  const submissionGuardRef = useRef<SubmissionGuard | null>(null);
  if (!submissionGuardRef.current) submissionGuardRef.current = createSubmissionGuard();
  const clientRequestIdRef = useRef("");
  const hydratedUserIdRef = useRef("");
  const draftWarningBaseRef = useRef("");
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const draftKey = activityDraftStorageKey(currentUser.id, draftScope || "pending-tab");
  const isBusy = creationState === "saving" || creationState === "verifying";

  const competenciasDisponibles = competencias.filter((c) => c.gestionId === gestionId);
  // El entregable cuelga de la competencia, así que la lista sigue a esta.
  const entregablesDisponibles = entregables.filter((e) => e.competenciaId === competenciaId);

  useEffect(() => {
    if (!open) {
      setDraftHydrated(false);
      hydratedUserIdRef.current = "";
      submissionGuardRef.current?.invalidate();
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
      return;
    }

    if (!dialogRef.current?.contains(document.activeElement)) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }

    setDraftHydrated(false);
    dispatchOperation({ type: "reset" });
    setResultDialog(null);
    setValidationErrors({});
    setCreationErrorDetail("");
    setExistingConflict(null);
    setRetryAllowed(true);
    setReloadRequired(false);
    setDraftStorageWarning("");
    hydratedUserIdRef.current = "";
    draftWarningBaseRef.current = "";

    // A fresh scope prevents two tabs from writing the same draft key. All
    // scopes remain discoverable in localStorage, so closing a tab cannot
    // orphan the only pointer to an unverified activity.
    const resolvedScope = createId("draft_tab");
    setDraftScope(resolvedScope);
    const resolvedDraftKey = activityDraftStorageKey(currentUser.id, resolvedScope);

    let storedRaw: string | null = null;
    let storedDraft: ActivityDraft | null = null;
    let storedKey = "";
    const invalidKeys: string[] = [];
    try {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key || !isActivityDraftStorageKey(key, currentUser.id)) continue;
        const raw = window.localStorage.getItem(key);
        const parsed = parseActivityDraft(raw);
        if (!parsed) {
          invalidKeys.push(key);
          continue;
        }
        if (!storedDraft || parsed.savedAt > storedDraft.savedAt) {
          storedRaw = raw;
          storedDraft = parsed;
          storedKey = key;
        }
      }
      for (const key of invalidKeys) window.localStorage.removeItem(key);
      if (storedRaw && storedKey !== resolvedDraftKey) {
        window.localStorage.setItem(resolvedDraftKey, storedRaw);
        window.localStorage.removeItem(storedKey);
      }
      if (invalidKeys.length > 0) {
        draftWarningBaseRef.current = "Se descartó un borrador local dañado o incompatible.";
        setDraftStorageWarning(draftWarningBaseRef.current);
      }
    } catch (error) {
      console.error("[new-activity] No se pudo leer el borrador local", error);
      draftWarningBaseRef.current = "No se pudo acceder al borrador guardado en este navegador.";
      setDraftStorageWarning(draftWarningBaseRef.current);
    }

    if (storedDraft) {
      setTipo(storedDraft.tipo);
      setEstado(storedDraft.estado);
      setTitulo(storedDraft.titulo);
      setDescripcion(storedDraft.descripcion);
      setAccionesPendientes(storedDraft.accionesPendientes);
      setResultadosAlcanzados(storedDraft.resultadosAlcanzados);
      setFuncionarioId(isAdmin ? storedDraft.funcionarioId : currentUser.funcionarioId || "");
      const validFuncionarioIds = new Set(funcionarios.map((funcionario) => funcionario.id));
      setParticipantesIds(storedDraft.participantesIds.filter((id) => validFuncionarioIds.has(id)));
      setGestionId(storedDraft.gestionId);
      setCompetenciaId(storedDraft.competenciaId);
      setEntregableId(storedDraft.entregableId);
      setFechaInicio(storedDraft.fechaInicio);
      setFechaFin(storedDraft.fechaFin);
      setFechaReunion(storedDraft.fechaReunion);
      setHoraReunion(storedDraft.horaReunion);
      setClientRequestId(storedDraft.clientRequestId);
      clientRequestIdRef.current = storedDraft.clientRequestId;
      setRestoredDraft(true);
    } else {
      const initialFuncionarioId = isAdmin ? funcionarios[0]?.id || "" : currentUser.funcionarioId || "";
      const initialRequestId = createId("activity_request");

      setTipo("asignacion");
      setEstado(defaultEstado === "archivada" ? "pendiente" : defaultEstado);
      setTitulo("");
      setDescripcion("");
      setAccionesPendientes("");
      setResultadosAlcanzados("");
      setFuncionarioId(initialFuncionarioId);
      setParticipantesIds([]);
      setGestionId("");
      setCompetenciaId("");
      setEntregableId("");
      const initialDay = todayIsoForZone(ZONE_TZ);
      setFechaInicio(initialDay);
      setFechaFin(iso(addDays(initialDay, 7)));
      setFechaReunion(initialDay);
      setHoraReunion("09:00");
      setClientRequestId(initialRequestId);
      clientRequestIdRef.current = initialRequestId;
      setRestoredDraft(false);
    }

    hydratedUserIdRef.current = currentUser.id;
    setDraftHydrated(true);
    // The form must hydrate only when it opens or the authenticated user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentUser.id]);

  useEffect(() => {
    if (
      !open ||
      !draftHydrated ||
      !draftScope ||
      hydratedUserIdRef.current !== currentUser.id ||
      creationState === "success" ||
      !clientRequestId
    ) return;

    const draft: ActivityDraft = {
      version: ACTIVITY_DRAFT_VERSION,
      savedAt: Date.now(),
      clientRequestId,
      tipo,
      estado,
      titulo,
      descripcion,
      accionesPendientes,
      resultadosAlcanzados,
      funcionarioId,
      participantesIds,
      gestionId,
      competenciaId,
      entregableId,
      fechaInicio,
      fechaFin,
      fechaReunion,
      horaReunion,
    };

    try {
      window.localStorage.setItem(draftKey, serializeActivityDraft(draft));
      setDraftStorageWarning(draftWarningBaseRef.current);
    } catch (error) {
      console.error("[new-activity] No se pudo persistir el borrador local", error);
      setDraftStorageWarning("No se pudo guardar el borrador en este navegador. Mantén esta ventana abierta.");
    }
  }, [
    accionesPendientes,
    clientRequestId,
    competenciaId,
    creationState,
    descripcion,
    draftHydrated,
    draftKey,
    draftScope,
    entregableId,
    estado,
    fechaFin,
    fechaInicio,
    fechaReunion,
    funcionarioId,
    gestionId,
    horaReunion,
    open,
    participantesIds,
    resultadosAlcanzados,
    tipo,
    titulo,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const root = dialogRef.current;
        if (!root) return;
        const focusable = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        if (focusable.length === 0) {
          event.preventDefault();
          root.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !root.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !root.contains(active))) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key !== "Escape") return;
      if (resultDialog === "error") {
        event.preventDefault();
        setResultDialog(null);
        return;
      }
      if (resultDialog || creationState === "saving" || creationState === "verifying" || creationState === "success") {
        return;
      }
      event.preventDefault();
      setDraftHydrated(false);
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [creationState, onClose, open, resultDialog]);

  useEffect(() => {
    if (!open || !draftHydrated || resultDialog || isBusy) return;
    const frame = window.requestAnimationFrame(() => document.getElementById("titulo")?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [draftHydrated, isBusy, open, resultDialog]);

  if (!open) return null;

  const effectiveTipo = tipo;
  const effectiveEstado = estado;
  const esReunion = effectiveTipo === "reunion";
  const currentFuncionario = funcionariosDisponibles.find((f) => f.id === currentUser.funcionarioId);
  // Sin entregables tampoco se puede crear: los tres niveles del catálogo son
  // obligatorios en el formulario.
  const catalogosBase = gestiones.length === 0 || competencias.length === 0 || entregables.length === 0;
  const catalogosVacios = isAdmin
    ? funcionariosDisponibles.length === 0 || catalogosBase
    : !currentUser.funcionarioId || catalogosBase;
  const estadoDef = ESTADOS.find((e) => e.id === effectiveEstado);

  function clearValidationError(...fields: ValidationField[]) {
    setValidationErrors((current) => {
      if (!fields.some((field) => current[field])) return current;
      const next = { ...current };
      for (const field of fields) delete next[field];
      return next;
    });
  }

  function validate(): boolean {
    const next: ValidationErrors = {};
    const responsibleId = isAdmin ? funcionarioId : currentUser.funcionarioId || "";

    if (!titulo.trim()) next.titulo = "Escribe un título para la actividad.";
    if (!responsibleId || !funcionariosDisponibles.some((f) => f.id === responsibleId)) {
      next.funcionarioId = "Selecciona un funcionario responsable válido.";
    }
    if (!gestionId || !gestiones.some((gestion) => gestion.id === gestionId)) {
      next.gestionId = "Selecciona una gestión válida.";
    }
    if (!competenciaId || !competenciasDisponibles.some((competencia) => competencia.id === competenciaId)) {
      next.competenciaId = "Selecciona una competencia válida para esta gestión.";
    }
    if (!entregableId || !entregablesDisponibles.some((entregable) => entregable.id === entregableId)) {
      next.entregableId = "Selecciona un entregable válido para esta competencia.";
    }
    if (esReunion) {
      if (!isCalendarDate(fechaReunion)) next.fechaReunion = "Selecciona una fecha válida para la reunión.";
      if (!isClockTime(horaReunion)) next.horaReunion = "Selecciona una hora válida para la reunión.";
    } else {
      if (!isCalendarDate(fechaInicio)) next.fechaInicio = "Selecciona una fecha de inicio válida.";
      if (!isCalendarDate(fechaFin)) next.fechaFin = "Selecciona una fecha de fin válida.";
      if (isCalendarDate(fechaInicio) && isCalendarDate(fechaFin) && fechaInicio > fechaFin) {
        next.fechaFin = "La fecha de fin debe ser igual o posterior a la fecha de inicio.";
      }
    }

    setValidationErrors(next);
    const firstField = Object.keys(next)[0] as ValidationField | undefined;
    if (firstField) {
      const inputId: Record<ValidationField, string> = {
        titulo: "titulo",
        funcionarioId: "resp",
        gestionId: "gestion",
        competenciaId: "comp",
        entregableId: "entregable",
        fechaInicio: "fecha-inicio",
        fechaFin: "fecha-fin",
        fechaReunion: "fecha-reunion",
        horaReunion: "hora-reunion",
      };
      window.requestAnimationFrame(() => document.getElementById(inputId[firstField])?.focus());
    }
    return Object.keys(next).length === 0;
  }

  function buildInput(): NewActivityInput {
    const responsibleId = isAdmin ? funcionarioId : currentUser.funcionarioId || "";
    const clientDay = todayIsoForZone(ZONE_TZ);
    const reunionDateTime = `${fechaReunion}T${horaReunion}`;
    return {
      tipo: effectiveTipo,
      titulo: titulo.trim(),
      descripcion: descripcion.trim(),
      funcionarioId: responsibleId,
      participantesIds: cleanParticipantes(
        participantesIds,
        responsibleId,
        new Set(funcionariosDisponibles.map((funcionario) => funcionario.id)),
      ),
      competenciaId,
      entregableId: entregableId || null,
      estado: effectiveEstado,
      fechaCreacion: clientDay,
      fechaInicio: esReunion ? reunionDateTime : fechaInicio,
      fechaFin: esReunion ? reunionDateTime : fechaFin,
      fechaCumplimiento: effectiveEstado === "cumplida" ? clientDay : null,
      observaciones: "",
      accionesPendientes: accionesPendientes.trim(),
      resultadosAlcanzados: resultadosAlcanzados.trim(),
    };
  }

  async function runCreation() {
    if (creationState === "failed" && !retryAllowed) {
      setResultDialog("error");
      return;
    }
    if (!draftHydrated || !validate()) return;
    const guard = submissionGuardRef.current;
    const submissionToken = guard?.tryAcquire() ?? null;
    if (!guard || submissionToken == null) return;

    setResultDialog(null);
    setCreationErrorDetail("");
    setExistingConflict(null);
    setRetryAllowed(true);
    setReloadRequired(false);
    dispatchOperation({ type: "start" });

    let requestId = clientRequestIdRef.current || clientRequestId;
    if (!requestId) {
      requestId = createId("activity_request");
      clientRequestIdRef.current = requestId;
      setClientRequestId(requestId);
    }
    let verificationObserved = false;
    try {
      const verifiedActivity = await onCreate(buildInput(), requestId, (phase) => {
        if (!guard.isCurrent(submissionToken)) return;
        if (phase === "verifying") verificationObserved = true;
        dispatchOperation({ type: phase === "verifying" ? "verify" : "start" });
      });
      if (!guard.isCurrent(submissionToken)) return;
      if (!verifiedActivity?.id) throw new Error("La creación no devolvió una actividad verificada.");
      if (!verificationObserved) {
        throw new ActivityPersistenceError(
          "verification",
          "El flujo terminó sin acreditar la lectura de verificación.",
          "VERIFICATION_PHASE_NOT_OBSERVED",
        );
      }
      dispatchOperation({ type: "verified", activityId: verifiedActivity.id });
      setResultDialog("success");
    } catch (error) {
      if (!guard.isCurrent(submissionToken)) return;
      console.error("[new-activity] No se pudo crear o verificar la actividad", { clientRequestId: requestId, error });
      const kindLabel: Record<ActivityPersistenceError["kind"], string> = {
        validation: "Validación",
        network: "Conexión",
        server: "Servidor",
        authentication: "Sesión",
        permission: "Permisos",
        timeout: "Tiempo de espera",
        verification: "Verificación",
        conflict: "Idempotencia",
      };
      setCreationErrorDetail(
        error instanceof ActivityPersistenceError
          ? `${kindLabel[error.kind]}: ${error.message}`
          : "Error inesperado: no fue posible confirmar la operación.",
      );
      setExistingConflict(error instanceof ActivityPersistenceError ? error.existingActivity ?? null : null);
      const resourceGone =
        error instanceof ActivityPersistenceError && error.code === "IDEMPOTENCY_RESOURCE_GONE";
      const authorizationChanged =
        error instanceof ActivityPersistenceError && error.code === "AUTHORIZATION_CONTEXT_CHANGED";
      setReloadRequired(authorizationChanged);
      setRetryAllowed(!resourceGone && !authorizationChanged);
      dispatchOperation({ type: "fail" });
      setResultDialog("error");
    } finally {
      guard.release(submissionToken);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void runCreation();
  }

  function requestClose() {
    if (submissionGuardRef.current?.isLocked() || isBusy || creationState === "success") return;
    setResultDialog(null);
    setDraftHydrated(false);
    onClose();
  }

  function clearVerifiedDraftAndClose() {
    try {
      window.localStorage.removeItem(draftKey);
    } catch (error) {
      console.error("[new-activity] No se pudo eliminar el borrador confirmado", error);
    }
    setResultDialog(null);
    setDraftHydrated(false);
    setRestoredDraft(false);
    setValidationErrors({});
    clientRequestIdRef.current = "";
    onClose();
  }

  function acceptSuccess() {
    if (!canClearVerifiedActivityDraft(operation)) return;
    clearVerifiedDraftAndClose();
  }

  function acceptExistingActivity() {
    if (!existingConflict?.id) return;
    const adopted = activityOperationReducer(operation, {
      type: "adoptVerified",
      activityId: existingConflict.id,
    });
    if (!canClearVerifiedActivityDraft(adopted)) return;
    dispatchOperation({ type: "adoptVerified", activityId: existingConflict.id });
    clearVerifiedDraftAndClose();
  }

  function startNewRequestAfterDeletedActivity() {
    const nextRequestId = createId("activity_request");
    clientRequestIdRef.current = nextRequestId;
    setClientRequestId(nextRequestId);
    setResultDialog(null);
    setCreationErrorDetail("");
    setExistingConflict(null);
    setRetryAllowed(true);
    setReloadRequired(false);
    dispatchOperation({ type: "reset" });
  }

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-activity-dialog-title"
    >
      <div className="absolute inset-0 bg-[rgba(18,18,26,.32)] backdrop-blur-[3px]" onClick={requestClose} />
      <form
        onSubmit={submit}
        noValidate
        aria-busy={isBusy}
        className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[720px] flex-col overflow-hidden rounded-modal bg-white shadow-modal sm:max-h-[calc(100dvh-3rem)]"
      >
        <fieldset disabled={!draftHydrated || isBusy || creationState === "success" || Boolean(resultDialog)} className="contents">
        <div className="flex shrink-0 items-start justify-between gap-3.5 border-b border-line-soft px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <div id="new-activity-dialog-title" className="text-[18px] font-extrabold tracking-[-.025em]">
              {esReunion ? "Nueva reunión" : "Nueva actividad"}
            </div>
            <div className="mt-[3px] text-[12.5px] text-ink-faint">
              Se registrará en estado{" "}
              <Badge variant={estadoDef?.accent || "slate"}>{estadoDef?.label}</Badge>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-btn text-ink-faint transition-colors hover:bg-estado-pendiente-bg hover:text-ink sm:h-8 sm:w-8"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {restoredDraft && (
            <div className="mb-3 flex items-start gap-2 rounded-input bg-estado-progreso-bg px-3 py-2.5 text-[11.5px] font-semibold text-estado-progreso-fg">
              <Icon name="refresh" size={14} className="mt-0.5 shrink-0" />
              <span>Recuperamos el borrador guardado en este navegador.</span>
            </div>
          )}
          {draftStorageWarning && (
            <div className="mb-3 flex items-start gap-2 rounded-input bg-estado-revision-bg px-3 py-2.5 text-[11.5px] font-semibold text-estado-revision-fg" role="alert">
              <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
              <span>{draftStorageWarning}</span>
            </div>
          )}
          {isBusy && (
            <div className="mb-3 flex items-center gap-2 rounded-input border border-line-soft bg-surface-subtle px-3 py-2.5 text-[13px] font-semibold text-ink-soft" role="status" aria-live="polite">
              <Icon name="loader" size={16} className="shrink-0 animate-spin" />
              <span>{creationState === "verifying" ? "Verificando que la actividad se guardó…" : "Guardando actividad…"}</span>
            </div>
          )}
          {creationState === "failed" && resultDialog === null && (
            <div className="mb-3 flex items-start gap-2 rounded-input bg-estado-vencida-bg px-3 py-2.5 text-[11.5px] font-semibold text-estado-vencida-fg" role="alert">
              <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
              <span>No pudimos confirmar el guardado. Tus datos permanecen en el formulario y puedes intentarlo nuevamente.</span>
            </div>
          )}
          {catalogosVacios ? (
            <div className="rounded-card border border-dashed border-line-dashed bg-surface-subtle p-5 text-center sm:p-6">
              <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-input bg-estado-revision-bg text-estado-revision-fg">
                <Icon name="alert" size={18} />
              </div>
              <div className="text-[14px] font-bold">Catálogos incompletos</div>
              <p className="mx-auto mt-1 max-w-sm text-[12px] text-ink-faint">
                Necesitas al menos un funcionario y una competencia para crear
                actividades. {isAdmin ? "Revísalos en la pestaña Catálogos." : "Tu usuario debe estar vinculado a un funcionario."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-2">
              <Label>Tipo</Label>
              <div className="inline-flex self-start gap-1 rounded-full bg-track p-1" role="group" aria-label="Tipo de actividad">
                {TIPOS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={tipo === t.id}
                    onClick={() => setTipo(t.id)}
                    className={cn(
                      "h-[30px] rounded-full px-[18px] text-[12.5px] font-[650] transition-colors",
                      tipo === t.id ? "bg-white text-ink shadow-seg" : "text-ink-muted hover:text-ink",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="titulo">Título</Label>
              <Input
                id="titulo"
                placeholder="Ej. Revisar informe trimestral PMA"
                value={titulo}
                aria-invalid={Boolean(validationErrors.titulo)}
                aria-describedby={validationErrors.titulo ? "titulo-error" : undefined}
                className={validationErrors.titulo ? "!border-estado-vencida focus-visible:!ring-estado-vencida/20" : ""}
                onChange={(e) => {
                  setTitulo(e.target.value);
                  clearValidationError("titulo");
                }}
              />
              <FieldError id="titulo-error" message={validationErrors.titulo} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desc">Descripción</Label>
              <Textarea
                id="desc"
                rows={2}
                placeholder="Detalles, alcances, archivos relacionados…"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="gestion">Gestión</Label>
                <Select
                  id="gestion"
                  value={gestionId}
                  aria-invalid={Boolean(validationErrors.gestionId)}
                  aria-describedby={validationErrors.gestionId ? "gestion-error" : undefined}
                  className={validationErrors.gestionId ? "!border-estado-vencida focus-visible:!ring-estado-vencida/20" : ""}
                  onChange={(e) => {
                    const nextGestionId = e.target.value;
                    setGestionId(nextGestionId);
                    // Competencia y entregable cuelgan de la gestión: al
                    // cambiarla se limpian para que se elijan de nuevo.
                    setCompetenciaId("");
                    setEntregableId("");
                    clearValidationError("gestionId", "competenciaId", "entregableId");
                  }}
                >
                  <option value="">Selecciona una gestión</option>
                  {gestiones.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nombre}
                    </option>
                  ))}
                </Select>
                <FieldError id="gestion-error" message={validationErrors.gestionId} />
              </div>
              {isAdmin ? (
                <div className="space-y-1.5">
                  <Label htmlFor="resp">Funcionario responsable</Label>
                  <Select
                    id="resp"
                    value={funcionarioId}
                    aria-invalid={Boolean(validationErrors.funcionarioId)}
                    aria-describedby={validationErrors.funcionarioId ? "funcionario-error" : undefined}
                    className={validationErrors.funcionarioId ? "!border-estado-vencida focus-visible:!ring-estado-vencida/20" : ""}
                    onChange={(e) => {
                      setFuncionarioId(e.target.value);
                      setParticipantesIds((ids) => ids.filter((id) => id !== e.target.value));
                      clearValidationError("funcionarioId");
                    }}
                  >
                    {funcionariosDisponibles.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nombre} — {gestionNombre(f.gestionId, gestiones)}
                      </option>
                    ))}
                  </Select>
                  <FieldError id="funcionario-error" message={validationErrors.funcionarioId} />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Funcionario responsable</Label>
                  <div className="flex h-auto min-h-11 items-center break-words rounded-input border border-line-soft bg-surface-subtle px-3 py-2 text-[13px] font-semibold text-ink-soft sm:h-[38px] sm:min-h-0 sm:py-0">
                    {currentFuncionario?.nombre || currentUser.email}
                  </div>
                  <FieldError id="funcionario-error" message={validationErrors.funcionarioId} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="comp">Competencia</Label>
                <Select
                  id="comp"
                  value={competenciaId}
                  aria-invalid={Boolean(validationErrors.competenciaId)}
                  aria-describedby={validationErrors.competenciaId ? "competencia-error" : undefined}
                  className={validationErrors.competenciaId ? "!border-estado-vencida focus-visible:!ring-estado-vencida/20" : ""}
                  onChange={(e) => {
                    setCompetenciaId(e.target.value);
                    // El entregable pertenece a la competencia: al cambiarla, se limpia.
                    setEntregableId("");
                    clearValidationError("competenciaId", "entregableId");
                  }}
                >
                  <option value="">Selecciona una competencia</option>
                  {competenciasDisponibles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </Select>
                {gestionId && competenciasDisponibles.length === 0 && !validationErrors.competenciaId && (
                  <p className="text-[11px] font-semibold text-estado-revision-fg">Esta gestión no tiene competencias disponibles.</p>
                )}
                <FieldError id="competencia-error" message={validationErrors.competenciaId} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entregable">Entregable</Label>
                <Select
                  id="entregable"
                  value={entregableId}
                  aria-invalid={Boolean(validationErrors.entregableId)}
                  aria-describedby={validationErrors.entregableId ? "entregable-error" : undefined}
                  className={validationErrors.entregableId ? "!border-estado-vencida focus-visible:!ring-estado-vencida/20" : ""}
                  onChange={(e) => {
                    setEntregableId(e.target.value);
                    clearValidationError("entregableId");
                  }}
                >
                  <option value="">Selecciona un entregable</option>
                  {entregablesDisponibles.map((en) => (
                    <option key={en.id} value={en.id}>
                      {en.nombre}
                    </option>
                  ))}
                </Select>
                {competenciaId && entregablesDisponibles.length === 0 && !validationErrors.entregableId && (
                  <p className="text-[11px] font-semibold text-estado-revision-fg">Esta competencia no tiene entregables disponibles.</p>
                )}
                <FieldError id="entregable-error" message={validationErrors.entregableId} />
              </div>
              {esReunion ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="fecha-reunion">Fecha de la reunión</Label>
                    <Input
                      id="fecha-reunion"
                      type="date"
                      required
                      value={fechaReunion}
                      aria-invalid={Boolean(validationErrors.fechaReunion)}
                      aria-describedby={validationErrors.fechaReunion ? "fecha-reunion-error" : undefined}
                      className={validationErrors.fechaReunion ? "!border-estado-vencida focus-visible:!ring-estado-vencida/20" : ""}
                      onChange={(e) => {
                        setFechaReunion(e.target.value);
                        clearValidationError("fechaReunion");
                      }}
                    />
                    <FieldError id="fecha-reunion-error" message={validationErrors.fechaReunion} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="hora-reunion">Hora</Label>
                    <Input
                      id="hora-reunion"
                      type="time"
                      required
                      value={horaReunion}
                      aria-invalid={Boolean(validationErrors.horaReunion)}
                      aria-describedby={validationErrors.horaReunion ? "hora-reunion-error" : undefined}
                      className={validationErrors.horaReunion ? "!border-estado-vencida focus-visible:!ring-estado-vencida/20" : ""}
                      onChange={(e) => {
                        setHoraReunion(e.target.value);
                        clearValidationError("horaReunion");
                      }}
                    />
                    <FieldError id="hora-reunion-error" message={validationErrors.horaReunion} />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="fecha-inicio">Fecha de inicio</Label>
                    <Input
                      id="fecha-inicio"
                      type="date"
                      required
                      max={fechaFin || undefined}
                      value={fechaInicio}
                      aria-invalid={Boolean(validationErrors.fechaInicio)}
                      aria-describedby={validationErrors.fechaInicio ? "fecha-inicio-error" : undefined}
                      className={validationErrors.fechaInicio ? "!border-estado-vencida focus-visible:!ring-estado-vencida/20" : ""}
                      onChange={(e) => {
                        setFechaInicio(e.target.value);
                        clearValidationError("fechaInicio", "fechaFin");
                      }}
                    />
                    <FieldError id="fecha-inicio-error" message={validationErrors.fechaInicio} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fecha-fin">Fecha de fin</Label>
                    <Input
                      id="fecha-fin"
                      type="date"
                      required
                      min={fechaInicio || undefined}
                      value={fechaFin}
                      aria-invalid={Boolean(validationErrors.fechaFin)}
                      aria-describedby={validationErrors.fechaFin ? "fecha-fin-error" : undefined}
                      className={validationErrors.fechaFin ? "!border-estado-vencida focus-visible:!ring-estado-vencida/20" : ""}
                      onChange={(e) => {
                        setFechaFin(e.target.value);
                        clearValidationError("fechaInicio", "fechaFin");
                      }}
                    />
                    <FieldError id="fecha-fin-error" message={validationErrors.fechaFin} />
                  </div>
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Participantes adicionales (opcional)</Label>
              <div className="max-h-[150px] overflow-y-auto rounded-xl border border-line-dashed bg-white p-[7px]">
                {funcionariosDisponibles.filter((f) => f.id !== funcionarioId).length > 0 ? (
                  <div className="space-y-1">
                    {funcionariosDisponibles
                      .filter((f) => f.id !== funcionarioId)
                      .map((f) => (
                        <label
                          key={f.id}
                          className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13px] transition-colors hover:bg-surface-subtle sm:min-h-0"
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 shrink-0 accent-ink sm:h-4 sm:w-4"
                            checked={participantesIds.includes(f.id)}
                            onChange={() => setParticipantesIds((ids) => toggleId(ids, f.id))}
                          />
                          <span className="min-w-0 flex-1 truncate">{f.nombre}</span>
                          <span className="max-w-[42%] shrink-0 truncate text-[11px] text-ink-label sm:max-w-none">
                            {gestionNombre(f.gestionId, gestiones)}
                          </span>
                        </label>
                      ))}
                  </div>
                ) : (
                  <div className="px-2 py-3 text-[13px] text-ink-ghost">Sin participantes adicionales</div>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acciones">Acciones pendientes y actividades programadas</Label>
              <Textarea
                id="acciones"
                rows={2}
                placeholder="Próximos pasos, tareas programadas…"
                value={accionesPendientes}
                onChange={(e) => setAccionesPendientes(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resultados">Resultados alcanzados</Label>
              <Textarea
                id="resultados"
                rows={2}
                placeholder="Logros, entregables completados…"
                value={resultadosAlcanzados}
                onChange={(e) => setResultadosAlcanzados(e.target.value)}
              />
            </div>
            </div>
          )}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2.5 border-t border-line-soft bg-white px-5 py-4 sm:flex sm:items-center sm:justify-end sm:px-6">
          <Button className="w-full sm:!h-10 sm:w-auto sm:!rounded-input sm:!px-4" type="button" variant="outline" onClick={requestClose}>
            Cancelar
          </Button>
          <Button
            className="w-full sm:!h-10 sm:w-auto sm:!rounded-input sm:!px-[19px]"
            type="submit"
            disabled={catalogosVacios || !draftHydrated || isBusy}
          >
            {isBusy ? (
              <>
                <Icon name="loader" size={14} className="animate-spin" />
                {creationState === "verifying" ? "Verificando…" : "Guardando…"}
              </>
            ) : (
              <>
                <Icon name="plus" size={14} /> {creationState === "failed" ? "Intentar nuevamente" : esReunion ? "Crear reunión" : "Crear actividad"}
              </>
            )}
          </Button>
        </div>
        </fieldset>
      </form>
      {resultDialog && (
        <CreationResultDialog
          kind={resultDialog}
          onRetry={() => void runCreation()}
          onCloseError={() => setResultDialog(null)}
          onAcceptSuccess={acceptSuccess}
          onAcceptExisting={existingConflict ? acceptExistingActivity : undefined}
          onReload={reloadRequired ? () => window.location.reload() : undefined}
          onStartNewRequest={!retryAllowed && !reloadRequired ? startNewRequestAfterDeletedActivity : undefined}
          retryAllowed={retryAllowed}
          errorDetail={creationErrorDetail}
        />
      )}
    </div>
  );
}

function CreationResultDialog({
  kind,
  onRetry,
  onCloseError,
  onAcceptSuccess,
  onAcceptExisting,
  onReload,
  onStartNewRequest,
  retryAllowed,
  errorDetail,
}: {
  kind: Exclude<ResultDialog, null>;
  onRetry: () => void;
  onCloseError: () => void;
  onAcceptSuccess: () => void;
  onAcceptExisting?: () => void;
  onReload?: () => void;
  onStartNewRequest?: () => void;
  retryAllowed: boolean;
  errorDetail: string;
}) {
  const success = kind === "success";
  const existing = !success && Boolean(onAcceptExisting);
  const needsReload = !success && Boolean(onReload);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={`activity-result-${kind}-title`}>
      <div
        className="absolute inset-0 bg-[rgba(18,18,26,.32)] backdrop-blur-[3px]"
        onClick={success ? undefined : onCloseError}
      />
      <div className="relative z-10 w-full max-w-[440px] rounded-t-modal bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-modal sm:rounded-modal sm:p-6">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-input",
              success
                ? "bg-estado-cumplida-bg text-estado-cumplida-fg"
                : "bg-estado-vencida-bg text-estado-vencida-fg",
            )}
          >
            <Icon name={success ? "checkCircle" : "alert"} size={18} />
          </div>
          <div className="min-w-0">
            <div id={`activity-result-${kind}-title`} className="text-[16px] font-extrabold tracking-[-.02em]">
              {success ? "Actividad guardada" : existing ? "Actividad previa encontrada" : "No se pudo guardar la actividad"}
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-faint">
              {success
                ? "La actividad se guardó correctamente."
                : existing
                  ? "La primera versión sí quedó guardada, pero los datos del formulario cambiaron después. No se creó un duplicado. Puedes aceptar la versión guardada o cerrar para revisar y copiar tus cambios."
                  : needsReload
                    ? "Tu perfil cambió durante el guardado y no se creó ninguna actividad. Recarga la sesión; este borrador permanecerá guardado."
                  : retryAllowed
                    ? "No pudimos confirmar que la actividad se haya guardado. Revisa tu conexión e inténtalo nuevamente. Los datos ingresados no se perderán."
                    : "La solicitud ya había sido procesada, pero esa actividad fue eliminada. Puedes conservar el formulario y preparar una solicitud nueva si deseas crearla de nuevo."}
            </p>
            {!success && errorDetail && (
              <p className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-xs leading-relaxed text-red-700">
                {errorDetail}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
          {success ? (
            <Button autoFocus type="button" className="col-span-2 w-full sm:w-auto" onClick={onAcceptSuccess}>
              Aceptar
            </Button>
          ) : (
            <>
              <Button autoFocus type="button" className="w-full sm:w-auto" variant="outline" onClick={onCloseError}>
                Cerrar
              </Button>
              {existing ? (
                <Button type="button" className="w-full sm:w-auto" onClick={onAcceptExisting}>
                  <Icon name="checkCircle" size={14} /> Aceptar guardada
                </Button>
              ) : needsReload && onReload ? (
                <Button type="button" className="w-full sm:w-auto" onClick={onReload}>
                  <Icon name="refresh" size={14} /> Recargar sesión
                </Button>
              ) : retryAllowed ? (
                <Button type="button" className="w-full sm:w-auto" onClick={onRetry}>
                  <Icon name="refresh" size={14} /> Intentar nuevamente
                </Button>
              ) : onStartNewRequest ? (
                <Button type="button" className="w-full sm:w-auto" onClick={onStartNewRequest}>
                  <Icon name="plus" size={14} /> Preparar nueva
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-[11px] font-semibold text-estado-vencida-fg" role="alert">
      {message}
    </p>
  );
}
