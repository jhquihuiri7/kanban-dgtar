"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Avatar, Badge, Button, Icon, Input, Label, Select, Textarea, type IconName } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  ESTADOS,
  TODAY_ISO,
  dateOnly,
  fechaFinInfo,
  fmtFecha,
  fmtFechaLarga,
  fmtHora,
  gestionNombre,
  gestionTone,
  withHora,
  type Actividad,
  type Competencia,
  type Entregable,
  type EstadoActividad,
  type FechaInfo,
  type FechaTone,
  type Funcionario,
  type Gestion,
} from "@/lib/data";
import type { AuthUser } from "@/lib/auth-token";
import { canFuncionarioDeleteActivity, canFuncionarioEditActivity } from "@/lib/activity-access";

export function EstadoBadge({ estado }: { estado: EstadoActividad }) {
  const e = ESTADOS.find((x) => x.id === estado);
  if (!e) return null;
  return <Badge variant={e.accent}>{e.label}</Badge>;
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-foreground/5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 break-words text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

// Campo de texto en modo lectura: caja bloqueada con el mismo estilo que el
// bloque de Competencia. Para editarlo se usa el botón Editar del panel.
function ReadOnlyField({ label, value }: { label: string; value: string }) {
  const text = value?.trim();
  return (
    <div>
      <Label className="mb-1.5 block uppercase tracking-wide text-slate-500">{label}</Label>
      <div className="whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        {text || <span className="text-slate-400">—</span>}
      </div>
    </div>
  );
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

function cleanParticipantes(ids: string[], responsableId: string): string[] {
  return Array.from(new Set(ids.filter((id) => id && id !== responsableId)));
}

function FechaBanner({ act, info }: { act: Actividad; info: FechaInfo }) {
  const map: Record<FechaTone, { bg: string; ring: string; text: string; icon: IconName }> = {
    green: { bg: "bg-green-50", ring: "ring-green-200", text: "text-green-700", icon: "check" },
    amber: { bg: "bg-amber-50", ring: "ring-amber-200", text: "text-amber-800", icon: "clock" },
    red: { bg: "bg-red-50", ring: "ring-red-200", text: "text-red-700", icon: "alert" },
    slate: { bg: "bg-slate-50", ring: "ring-slate-200", text: "text-slate-700", icon: "clock" },
  };
  const s = map[info.tone];
  return (
    <div className={cn("flex items-start gap-3 rounded-lg p-3 ring-1 sm:items-center", s.bg, s.ring)}>
      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 bg-white", s.ring, s.text)}>
        <Icon name={s.icon} size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn("break-words text-sm font-semibold", s.text)}>{info.text}</div>
        <div className="break-words text-xs text-slate-600">
          {act.tipo === "reunion" ? "Fecha de la reunión" : "Fecha de fin"}: {fmtFechaLarga(act.fechaFin)}
          {act.tipo === "reunion" && fmtHora(act.fechaFin) ? ` · ${fmtHora(act.fechaFin)}` : ""}
        </div>
      </div>
    </div>
  );
}

function HistoryItem({
  icon,
  tone,
  text,
  when,
}: {
  icon: IconName;
  tone: "slate" | "blue" | "amber" | "green" | "red";
  text: React.ReactNode;
  when: string;
}) {
  const dotMap = {
    slate: "bg-slate-200 text-slate-700",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
  };
  return (
    <li className="flex items-start gap-3">
      <div className={cn("flex h-6 w-6 items-center justify-center rounded-full", dotMap[tone])}>
        <Icon name={icon} size={12} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="break-words text-sm text-slate-800">{text}</div>
        <div className="text-[11px] text-slate-500">{when}</div>
      </div>
    </li>
  );
}

export function DetailPanel({
  activityId,
  activities,
  setActivities,
  gestiones,
  funcionarios,
  competencias,
  entregables,
  useAvatars,
  isAdmin,
  currentUser,
  saveNow,
  onClose,
}: {
  activityId: string;
  activities: Actividad[];
  setActivities: React.Dispatch<React.SetStateAction<Actividad[]>>;
  gestiones: Gestion[];
  funcionarios: Funcionario[];
  competencias: Competencia[];
  entregables: Entregable[];
  useAvatars: boolean;
  isAdmin: boolean;
  currentUser: AuthUser;
  saveNow?: (nextActivities: Actividad[]) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Actividad | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const act = activities.find((a) => a.id === activityId);
  if (!act) return null;
  const currentActivityId = act.id;
  const fun = funcionarios.find((f) => f.id === act.funcionarioId);
  const participantes = (act.participantesIds ?? [])
    .map((id) => funcionarios.find((f) => f.id === id))
    .filter((f): f is Funcionario => Boolean(f));
  const comp = competencias.find((c) => c.id === act.competenciaId);
  const entregable = entregables.find((e) => e.id === act.entregableId);
  const fechaInfo = fechaFinInfo(act, TODAY_ISO);
  const esReunion = act.tipo === "reunion";
  const hora = fmtHora(act.fechaInicio);
  const canEdit = isAdmin || canFuncionarioEditActivity(act, currentUser.funcionarioId);
  const canDelete = isAdmin || canFuncionarioDeleteActivity(act, currentUser.funcionarioId);
  const canManageParticipants = canDelete;

  function update(patch: Partial<Actividad>) {
    const nextActivities = activities.map((a) => (a.id === currentActivityId ? { ...a, ...patch } : a));
    setActivities(nextActivities);
    saveNow?.(nextActivities);
  }
  function marcarCumplida() {
    update({ estado: "cumplida", fechaCumplimiento: TODAY_ISO });
  }

  function startEdit() {
    setDraft({ ...act! });
    setEditing(true);
  }
  function cancelEdit() {
    setEditing(false);
    setDraft(null);
  }
  function saveEdit() {
    if (!draft) return;
    if (!canEdit) return;
    const esReunion = draft.tipo === "reunion";
    const responsableId = draft.funcionarioId;
    const inicioDia = dateOnly(draft.fechaInicio);
    const finDia = dateOnly(draft.fechaFin);
    if (!inicioDia || (!esReunion && (!finDia || inicioDia > finDia))) return;
    const reunionDateTime = withHora(inicioDia, fmtHora(draft.fechaInicio) || "09:00");
    const fechaInicio = esReunion ? reunionDateTime : inicioDia;
    const fechaFin = esReunion ? reunionDateTime : finDia;
    let fechaCumplimiento = draft.fechaCumplimiento;
    if (draft.estado === "cumplida") fechaCumplimiento = fechaCumplimiento ?? TODAY_ISO;
    else fechaCumplimiento = null;
    update({
      titulo: draft.titulo.trim() || act!.titulo,
      descripcion: draft.descripcion.trim(),
      funcionarioId: responsableId,
      participantesIds: esReunion ? cleanParticipantes(draft.participantesIds ?? [], responsableId) : [],
      competenciaId: draft.competenciaId,
      entregableId: draft.entregableId,
      estado: draft.estado,
      fechaCreacion: draft.fechaCreacion,
      fechaInicio,
      fechaFin,
      fechaCumplimiento,
      observaciones: draft.observaciones.trim(),
      accionesPendientes: draft.accionesPendientes.trim(),
      resultadosAlcanzados: draft.resultadosAlcanzados.trim(),
    });
    setEditing(false);
    setDraft(null);
  }

  function eliminar() {
    if (!canDelete) return;
    const nextActivities = activities.filter((a) => a.id !== act!.id);
    setActivities(nextActivities);
    saveNow?.(nextActivities);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="relative z-10 flex h-[100dvh] w-full max-w-[520px] flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
        {/* header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur sm:items-center sm:px-5 sm:py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 py-1 sm:py-0">
            {esReunion && (
              <Badge variant="violet">
                <Icon name="users" size={11} /> Reunión
              </Badge>
            )}
            <Badge variant={comp ? gestionTone(comp.gestionId, gestiones) : "slate"}>
              {gestionNombre(comp?.gestionId, gestiones)}
            </Badge>
            <EstadoBadge estado={act.estado} />
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 sm:h-8 sm:w-8"
            aria-label="Cerrar detalle"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-5 p-3 sm:space-y-6 sm:p-5">
          {editing && draft ? (
            <EditForm
              draft={draft}
              setDraft={setDraft}
              gestiones={gestiones}
              funcionarios={funcionarios}
              competencias={competencias}
              entregables={entregables}
              isAdmin={isAdmin}
              canManageParticipants={canManageParticipants}
            />
          ) : (
          <>
          {/* title + description */}
          <div>
            <h2 className="break-words text-lg font-semibold leading-snug text-slate-900">{act.titulo}</h2>
            <p className="mt-2 break-words text-sm leading-relaxed text-slate-600">{act.descripcion}</p>
          </div>

          {/* responsable */}
          <div className="flex flex-col items-start gap-3 rounded-lg bg-slate-50 p-3 ring-1 ring-foreground/5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar funcionario={fun} useAvatars={useAvatars} size={36} />
              <div className="min-w-0">
                <div className="break-words text-sm font-medium text-slate-900">{fun?.nombre}</div>
                <div className="break-words text-xs text-slate-500">
                  {fun?.cargo} · {gestionNombre(fun?.gestionId, gestiones)}
                </div>
              </div>
            </div>
            <Badge variant={gestionTone(fun?.gestionId, gestiones)}>{gestionNombre(fun?.gestionId, gestiones)}</Badge>
          </div>

          {esReunion && (
            <div>
              <Label className="mb-1.5 block uppercase tracking-wide text-slate-500">Participantes</Label>
              <div className="rounded-lg border border-slate-200 p-3">
                {participantes.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {participantes.map((f) => (
                      <div
                        key={f.id}
                        className="inline-flex max-w-full items-center gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 ring-1 ring-foreground/5"
                      >
                        <Avatar funcionario={f} useAvatars={useAvatars} size={22} />
                        <span className="truncate text-sm font-medium text-slate-800">{f.nombre}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-400">Sin participantes adicionales</div>
                )}
              </div>
            </div>
          )}

          {/* fechas */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MetaCell label="Creada" value={fmtFecha(act.fechaCreacion)} />
            {esReunion ? (
              <>
                <MetaCell label="Fecha" value={fmtFecha(act.fechaInicio)} />
                <MetaCell label="Hora" value={hora || "—"} />
              </>
            ) : (
              <>
                <MetaCell label="Inicio" value={fmtFecha(act.fechaInicio)} />
                <MetaCell label="Fin" value={fmtFecha(act.fechaFin)} />
              </>
            )}
          </div>

          <FechaBanner act={act} info={fechaInfo} />

          {/* competencia */}
          <div>
            <Label className="mb-1.5 block uppercase tracking-wide text-slate-500">Competencia</Label>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="break-words text-sm font-medium text-slate-900">{comp?.nombre}</div>
                  <div className="text-xs text-slate-500">Estatuto del Régimen Especial</div>
                  {entregable && (
                    <div className="mt-1 text-xs text-slate-500">
                      Entregable: <span className="font-medium text-slate-700">{entregable.nombre}</span>
                    </div>
                  )}
                </div>
                <Badge variant={gestionTone(comp?.gestionId, gestiones)}>{gestionNombre(comp?.gestionId, gestiones)}</Badge>
              </div>
            </div>
          </div>

          {/* Historial */}
          <div>
            <Label className="mb-2 block uppercase tracking-wide text-slate-500">Historial</Label>
            <ol className="space-y-2.5 text-sm">
              <HistoryItem
                icon="plus"
                tone="slate"
                text={
                  <>
                    Actividad creada por <b>{fun?.nombre.split(" ")[0]}</b>
                  </>
                }
                when={fmtFecha(act.fechaCreacion)}
              />
              {act.estado !== "pendiente" && (
                <HistoryItem
                  icon="arrow"
                  tone="blue"
                  text="Movida a En progreso"
                  when={fmtFecha(act.fechaInicio)}
                />
              )}
              {(act.estado === "en_revision" || act.estado === "cumplida") && (
                <HistoryItem
                  icon="arrow"
                  tone="amber"
                  text="Enviada a revisión"
                  when={fmtFecha(act.fechaFin)}
                />
              )}
              {act.estado === "cumplida" && (
                <HistoryItem
                  icon="check"
                  tone="green"
                  text="Marcada como cumplida"
                  when={fmtFecha(act.fechaCumplimiento)}
                />
              )}
            </ol>
          </div>

          {/* observaciones / seguimiento (solo lectura — editar desde el botón Editar) */}
          <ReadOnlyField label="Observaciones" value={act.observaciones} />
          <ReadOnlyField
            label="Acciones pendientes y actividades programadas"
            value={act.accionesPendientes}
          />
          <ReadOnlyField label="Resultados alcanzados" value={act.resultadosAlcanzados} />
          </>
          )}
        </div>

        {/* footer actions */}
        <div className="sticky bottom-0 flex flex-col gap-2 border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between">
          {editing ? (
            <>
              <Button variant="ghost" className="w-full sm:w-auto" onClick={cancelEdit}>
                Cancelar
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={saveEdit}
                disabled={
                  !draft?.titulo.trim() ||
                  !dateOnly(draft.fechaInicio) ||
                  (draft.tipo === "asignacion" &&
                    (!dateOnly(draft.fechaFin) || dateOnly(draft.fechaInicio) > dateOnly(draft.fechaFin)))
                }
              >
                <Icon name="check" size={14} /> Guardar cambios
              </Button>
            </>
          ) : (
            <>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <Button variant="ghost" className="flex-1 sm:flex-none" onClick={onClose}>
                  Cerrar
                </Button>
                {canDelete && (
                  <Button
                    variant="ghost"
                    className="flex-1 text-red-600 hover:bg-red-50 sm:flex-none"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Icon name="trash" size={14} /> Eliminar
                  </Button>
                )}
              </div>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                {canEdit && (
                  <Button variant="outline" className="flex-1 sm:flex-none" onClick={startEdit}>
                    <Icon name="edit" size={14} /> Editar
                  </Button>
                )}
                {canEdit && (
                  act.estado !== "cumplida" ? (
                    <Button className="flex-1 sm:flex-none" onClick={marcarCumplida} aria-label="Marcar actividad como cumplida">
                      <Icon name="check" size={14} />
                      <span className="sm:hidden">Cumplir</span>
                      <span className="hidden sm:inline">Marcar cumplida</span>
                    </Button>
                  ) : (
                    <Button className="flex-1 sm:flex-none" variant="outline" onClick={() => update({ estado: "en_revision", fechaCumplimiento: null })}>
                      Reabrir
                    </Button>
                  )
                )}
              </div>
            </>
          )}
        </div>
      </aside>

      {confirmDelete && canDelete && (
        <ConfirmDeleteDialog
          titulo={act.titulo}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={eliminar}
        />
      )}
    </div>
  );
}

/* ── Formulario de edición (todos los campos) ───────────────────────── */

function EditForm({
  draft,
  setDraft,
  gestiones,
  funcionarios,
  competencias,
  entregables,
  isAdmin,
  canManageParticipants,
}: {
  draft: Actividad;
  setDraft: React.Dispatch<React.SetStateAction<Actividad | null>>;
  gestiones: Gestion[];
  funcionarios: Funcionario[];
  competencias: Competencia[];
  entregables: Entregable[];
  isAdmin: boolean;
  canManageParticipants: boolean;
}) {
  function set<K extends keyof Actividad>(key: K, value: Actividad[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }
  function setReunionDateTime(day: string, time: string) {
    const nextDateTime = withHora(day, time);
    setDraft((d) => (d ? { ...d, fechaInicio: nextDateTime, fechaFin: nextDateTime } : d));
  }
  const esReunion = draft.tipo === "reunion";
  const inicioDia = dateOnly(draft.fechaInicio);
  const finDia = dateOnly(draft.fechaFin);
  const fechasInvalidas = !esReunion && Boolean(inicioDia && finDia && inicioDia > finDia);
  const responsable = funcionarios.find((f) => f.id === draft.funcionarioId);

  // gestionId es solo un filtro de UI para competencia/entregable; se deriva
  // una vez de la competencia actual (cada edición monta un EditForm nuevo,
  // ver startEdit()/cancelEdit() en DetailPanel).
  const [gestionId, setGestionId] = useState(
    () => competencias.find((c) => c.id === draft.competenciaId)?.gestionId || gestiones[0]?.id || "",
  );
  const competenciasDisponibles = competencias.filter((c) => c.gestionId === gestionId);
  const entregablesDisponibles = entregables.filter((e) => e.gestionId === gestionId);

  useEffect(() => {
    const compForGestion = competencias.filter((c) => c.gestionId === gestionId);
    if (!compForGestion.some((c) => c.id === draft.competenciaId)) {
      set("competenciaId", compForGestion[0]?.id || "");
    }
    const entForGestion = entregables.filter((e) => e.gestionId === gestionId);
    if (!entForGestion.some((e) => e.id === draft.entregableId)) {
      set("entregableId", entForGestion[0]?.id || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gestionId, competencias, entregables]);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="edit-titulo">Título</Label>
        <Input
          id="edit-titulo"
          value={draft.titulo}
          onChange={(e) => set("titulo", e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-desc">Descripción</Label>
        <Textarea
          id="edit-desc"
          rows={3}
          value={draft.descripcion}
          onChange={(e) => set("descripcion", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-gestion">Gestión</Label>
          <Select id="edit-gestion" value={gestionId} onChange={(e) => setGestionId(e.target.value)}>
            {gestiones.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre}
              </option>
            ))}
          </Select>
        </div>
        {isAdmin ? (
          <div className="space-y-1.5">
            <Label htmlFor="edit-resp">Funcionario responsable</Label>
            <Select
              id="edit-resp"
              value={draft.funcionarioId}
              onChange={(e) => {
                const responsableId = e.target.value;
                setDraft((d) =>
                  d
                    ? {
                        ...d,
                        funcionarioId: responsableId,
                        participantesIds: (d.participantesIds ?? []).filter((id) => id !== responsableId),
                      }
                    : d,
                );
              }}
            >
              {funcionarios.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre} — {gestionNombre(f.gestionId, gestiones)}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Funcionario responsable</Label>
            <div className="flex min-h-11 min-w-0 items-center break-words rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-foreground/5 sm:min-h-9">
              {responsable?.nombre || draft.funcionarioId}
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="edit-comp">Competencia</Label>
          <Select
            id="edit-comp"
            value={draft.competenciaId}
            onChange={(e) => set("competenciaId", e.target.value)}
          >
            {competenciasDisponibles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-entregable">Entregable (opcional)</Label>
          {entregablesDisponibles.length > 0 ? (
            <Select
              id="edit-entregable"
              value={draft.entregableId ?? ""}
              onChange={(e) => set("entregableId", e.target.value || null)}
            >
              {entregablesDisponibles.map((en) => (
                <option key={en.id} value={en.id}>
                  {en.nombre}
                </option>
              ))}
            </Select>
          ) : (
            <div className="flex min-h-11 items-center rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400 ring-1 ring-foreground/5 sm:min-h-9">
              Esta gestión no tiene entregables.
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-estado">Estado</Label>
          <Select
            id="edit-estado"
            value={draft.estado}
            onChange={(e) => set("estado", e.target.value as EstadoActividad)}
          >
            {ESTADOS.map((est) => (
              <option key={est.id} value={est.id}>
                {est.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Fecha de creación</Label>
          <div className="flex min-h-11 items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-500 ring-1 ring-foreground/5 sm:min-h-9">
            <Icon name="calendar" size={14} className="text-slate-400" />
            {fmtFechaLarga(draft.fechaCreacion)}
          </div>
        </div>
        {esReunion ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="edit-fecha-reunion">Fecha de la reunión</Label>
              <Input
                id="edit-fecha-reunion"
                type="date"
                required
                value={inicioDia}
                onChange={(e) => setReunionDateTime(e.target.value, fmtHora(draft.fechaInicio) || "09:00")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-hora-reunion">Hora</Label>
              <Input
                id="edit-hora-reunion"
                type="time"
                required
                value={fmtHora(draft.fechaInicio) || "09:00"}
                onChange={(e) => setReunionDateTime(inicioDia, e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="edit-fecha-inicio">Fecha de inicio</Label>
              <Input
                id="edit-fecha-inicio"
                type="date"
                required
                max={finDia || undefined}
                value={inicioDia}
                onChange={(e) => set("fechaInicio", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-fecha-fin">Fecha de fin</Label>
              <Input
                id="edit-fecha-fin"
                type="date"
                required
                min={inicioDia || undefined}
                value={finDia}
                aria-invalid={fechasInvalidas}
                aria-describedby={fechasInvalidas ? "edit-fecha-fin-error" : undefined}
                onChange={(e) => set("fechaFin", e.target.value)}
              />
              {fechasInvalidas && (
                <p id="edit-fecha-fin-error" className="text-xs text-red-600" role="alert">
                  La fecha de fin debe ser igual o posterior a la fecha de inicio.
                </p>
              )}
            </div>
          </>
        )}
      </div>
      {esReunion && (
        <div className="space-y-1.5">
          <Label>Participantes</Label>
          {!canManageParticipants && (
            <p className="text-xs text-slate-500">
              Solo el responsable o un administrador puede cambiar los participantes.
            </p>
          )}
          <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
            {funcionarios.filter((f) => f.id !== draft.funcionarioId).length > 0 ? (
              <div className="space-y-1">
                {funcionarios
                  .filter((f) => f.id !== draft.funcionarioId)
                  .map((f) => (
                    <label
                      key={f.id}
                      className={cn(
                        "flex min-h-11 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700",
                        canManageParticipants ? "cursor-pointer hover:bg-slate-50" : "cursor-default opacity-70",
                      )}
                    >
                      <input
                        type="checkbox"
                        disabled={!canManageParticipants}
                        className="h-5 w-5 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20 sm:h-4 sm:w-4"
                        checked={(draft.participantesIds ?? []).includes(f.id)}
                        onChange={() =>
                          setDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  participantesIds: cleanParticipantes(
                                    toggleId(d.participantesIds ?? [], f.id),
                                    d.funcionarioId,
                                  ),
                                }
                              : d,
                          )
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">{f.nombre}</span>
                      <span className="max-w-[35%] shrink-0 truncate text-xs text-slate-400">
                        {gestionNombre(f.gestionId, gestiones)}
                      </span>
                    </label>
                  ))}
              </div>
            ) : (
              <div className="px-2 py-3 text-sm text-slate-400">Sin participantes adicionales</div>
            )}
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="edit-obs">Observaciones</Label>
        <Textarea
          id="edit-obs"
          rows={3}
          value={draft.observaciones || ""}
          onChange={(e) => set("observaciones", e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-acciones">Acciones pendientes y actividades programadas</Label>
        <Textarea
          id="edit-acciones"
          rows={3}
          value={draft.accionesPendientes || ""}
          onChange={(e) => set("accionesPendientes", e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-resultados">Resultados alcanzados</Label>
        <Textarea
          id="edit-resultados"
          rows={3}
          value={draft.resultadosAlcanzados || ""}
          onChange={(e) => set("resultadosAlcanzados", e.target.value)}
        />
      </div>
    </div>
  );
}

/* ── Confirmación de borrado ─────────────────────────────────────────── */

function ConfirmDeleteDialog({
  titulo,
  onCancel,
  onConfirm,
}: {
  titulo: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onCancel} />
      <div className="relative z-10 max-h-[calc(100dvh-0.5rem)] w-full max-w-sm overflow-y-auto rounded-t-xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] ring-1 ring-foreground/10 shadow-xl sm:rounded-xl sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <Icon name="trash" size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">¿Eliminar esta actividad?</div>
            <p className="mt-1 break-words text-xs text-slate-500">
              Se eliminará <b>“{titulo}”</b> de forma permanente. Esta acción no se puede deshacer.
            </p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
          <Button className="w-full sm:w-auto" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button className="w-full sm:w-auto" variant="destructive" onClick={onConfirm}>
            <Icon name="trash" size={14} /> Eliminar
          </Button>
        </div>
      </div>
    </div>
  );
}
