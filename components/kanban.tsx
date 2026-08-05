"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Avatar, Badge, Icon } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  ESTADOS,
  TODAY_ISO,
  ZONE_TZ,
  actividadIncludesFuncionario,
  dateOnly,
  fmtFecha,
  fmtHora,
  fechaFinInfo,
  gestionNombre,
  gestionTone,
  initials,
  type Actividad,
  type Competencia,
  type EstadoActividad,
  type EstadoDef,
  type FechaInfo,
  type FechaTone,
  type Funcionario,
  type Gestion,
} from "@/lib/data";

interface Filters {
  funcionario: string;
  competencia: string;
  q: string;
}

/* Catálogos necesarios para buscar por gestión / responsable. */
interface FilterContext {
  funcionarios: Funcionario[];
  competencias: Competencia[];
  gestiones: Gestion[];
}

/* Mes visible del Tablero: rango completo más su etiqueta ("Junio 2026"). */
interface BoardMonth {
  from: string;
  to: string;
  label: string;
}

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/* La búsqueda cubre título + gestión + responsable + iniciales, y exige que
   todas las palabras aparezcan (no la frase completa). */
function searchHaystack(act: Actividad, ctx: FilterContext): string {
  const fun = ctx.funcionarios.find((f) => f.id === act.funcionarioId);
  const comp = ctx.competencias.find((c) => c.id === act.competenciaId);
  const gestion = comp ? gestionNombre(comp.gestionId, ctx.gestiones) : "";
  const nombre = fun?.nombre ?? "";
  return normalizeText([act.titulo, gestion, nombre, nombre ? initials(nombre) : ""].join(" "));
}

/* Shared activity filter used by both the board and the calendar views. */
export function filterActivities(
  activities: Actividad[],
  filters: Filters,
  ctx: FilterContext,
): Actividad[] {
  const words = normalizeText(filters.q).split(/\s+/).filter(Boolean);
  return activities.filter((a) => {
    if (filters.funcionario !== "all" && !actividadIncludesFuncionario(a, filters.funcionario)) return false;
    if (filters.competencia !== "all" && a.competenciaId !== filters.competencia) return false;
    if (words.length > 0) {
      const haystack = searchHaystack(a, ctx);
      if (!words.every((word) => haystack.includes(word))) return false;
    }
    return true;
  });
}

/* Mes del Tablero desplazado `offset` meses respecto de hoy. */
export function boardMonth(offset: number): BoardMonth {
  const [year, month] = TODAY_ISO.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + offset, 1, 12));
  const last = new Date(Date.UTC(year, month + offset, 0, 12));
  const nombre = first.toLocaleDateString("es-EC", { month: "long", timeZone: ZONE_TZ });
  return {
    from: isoUtc(first),
    to: isoUtc(last),
    label: `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${first.getUTCFullYear()}`,
  };
}

function isoUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

function activityRange(act: Actividad): { from: string; to: string } {
  const inicio = dateOnly(act.fechaInicio);
  const fin = dateOnly(act.fechaFin);
  return inicio <= fin ? { from: inicio, to: fin } : { from: fin, to: inicio };
}

function overlapsMonth(act: Actividad, month: BoardMonth): boolean {
  const { from, to } = activityRange(act);
  return from <= month.to && to >= month.from;
}

/* Regla de período del Tablero:
   1. entra si su rango se solapa con el mes seleccionado;
   2. las vencidas siguen visibles aunque el mes no las contenga;
   3. Cumplida queda estrictamente acotada al mes para que no crezca sin límite. */
export function inBoardMonth(act: Actividad, month: BoardMonth, today = TODAY_ISO): boolean {
  if (overlapsMonth(act, month)) return true;
  return act.estado !== "cumplida" && activityRange(act).to < today;
}

/* Etiqueta morada «de may» de las vencidas que se arrastran de otro mes. */
function fueraDeMes(act: Actividad, month: BoardMonth): string | null {
  if (overlapsMonth(act, month)) return null;
  const fin = activityRange(act).to;
  if (!fin) return null;
  const [year, mes, dia] = fin.split("-").map(Number);
  const abreviado = new Date(Date.UTC(year, mes - 1, dia, 12)).toLocaleDateString("es-EC", {
    month: "short",
    timeZone: ZONE_TZ,
  });
  return `de ${abreviado}`;
}

const TONE_STRIPE: Record<FechaTone, string> = {
  red: "bg-estado-vencida",
  amber: "bg-estado-revision",
  slate: "bg-estado-pendiente",
  green: "bg-estado-cumplida",
};

const ACCENT_DOT: Record<EstadoDef["accent"], string> = {
  slate: "bg-estado-pendiente",
  blue: "bg-estado-progreso",
  amber: "bg-estado-revision",
  green: "bg-estado-cumplida",
};

function compareFallback(a: Actividad, b: Actividad): number {
  const byOrden = a.orden - b.orden;
  if (byOrden !== 0) return byOrden;
  return a.id.localeCompare(b.id);
}

function compareUrgentFirst(a: Actividad, b: Actividad): number {
  const byFechaFin = a.fechaFin.localeCompare(b.fechaFin);
  if (byFechaFin !== 0) return byFechaFin;
  return compareFallback(a, b);
}

function compareCompletedFirst(a: Actividad, b: Actividad): number {
  const byCumplimiento = (b.fechaCumplimiento ?? "").localeCompare(a.fechaCumplimiento ?? "");
  if (byCumplimiento !== 0) return byCumplimiento;

  const byFechaFin = b.fechaFin.localeCompare(a.fechaFin);
  if (byFechaFin !== 0) return byFechaFin;

  return compareFallback(a, b);
}

function compareColumnActivities(estado: EstadoActividad) {
  return estado === "cumplida" ? compareCompletedFirst : compareUrgentFirst;
}

interface DragState {
  id: string | null;
  over: string | null;
}

function KanbanCard({
  act,
  fun,
  comp,
  gestiones,
  month,
  useAvatars,
  onOpen,
  onDragStart,
  onDragEnd,
  isDragging,
  canMove,
}: {
  act: Actividad;
  fun?: Funcionario;
  comp?: Competencia;
  gestiones: Gestion[];
  month: BoardMonth;
  useAvatars: boolean;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  canMove: boolean;
}) {
  const fecha: FechaInfo = fechaFinInfo(act, TODAY_ISO);
  const participantesCount = (act.participantesIds ?? []).length;
  const arrastrada = fueraDeMes(act, month);

  return (
    <article
      draggable={canMove}
      onDragStart={(e) => {
        if (!canMove) return;
        onDragStart(e);
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        "relative cursor-pointer overflow-hidden rounded-card border border-line bg-white py-[13px] pl-4 pr-[14px] shadow-card transition hover:border-line-hover hover:shadow-card-hover",
        isDragging && "rotate-[0.5deg] opacity-40",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", TONE_STRIPE[fecha.tone])} />
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-[5px]">
            {act.tipo === "reunion" && (
              <Badge variant="violet">
                <Icon name="users" size={10} /> Reunión
              </Badge>
            )}
            <Badge variant={comp ? gestionTone(comp.gestionId, gestiones) : "slate"}>
              {comp ? gestionNombre(comp.gestionId, gestiones) : "—"}
            </Badge>
          </div>
          <h3 className="mt-2 break-words text-[13.5px] font-[650] leading-[1.35] tracking-[-.01em] text-ink">
            {act.titulo}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-[5px]">
          <Avatar funcionario={fun} useAvatars={useAvatars} size={27} />
          {participantesCount > 0 && (
            <span className="rounded-full bg-estado-pendiente-bg px-[7px] py-[3px] text-[10px] font-bold text-ink-muted">
              +{participantesCount}
            </span>
          )}
        </div>
      </div>

      <div className="mt-[11px] flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-[5px] whitespace-nowrap text-[11px] font-[550] text-ink-faint">
          <Icon name={act.tipo === "reunion" ? "clock" : "calendar"} size={12} />
          {act.tipo === "reunion"
            ? `${fmtFecha(act.fechaInicio)}${fmtHora(act.fechaInicio) ? ` · ${fmtHora(act.fechaInicio)}` : ""}`
            : `${fmtFecha(act.fechaInicio)} – ${fmtFecha(act.fechaFin)}`}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {arrastrada && (
            <span className="whitespace-nowrap rounded-full bg-accent-softer px-[7px] py-[3px] text-[10px] font-[750] text-accent">
              {arrastrada}
            </span>
          )}
          <Badge variant={fecha.tone}>
            {(fecha.kind === "ended" || fecha.kind === "today") && <Icon name="alert" size={10} />}
            {fecha.kind === "ok" && <Icon name="check" size={10} />}
            {fecha.text}
          </Badge>
        </div>
      </div>
    </article>
  );
}

function KanbanColumn({
  estado,
  actividades,
  funcionarios,
  competencias,
  gestiones,
  month,
  searching,
  useAvatars,
  onOpen,
  dragState,
  onCardDragStart,
  onCardDragEnd,
  onColumnDragOver,
  onColumnDrop,
  onAdd,
  canCreate,
  canManageActivity,
}: {
  estado: EstadoDef;
  actividades: Actividad[];
  funcionarios: Funcionario[];
  competencias: Competencia[];
  gestiones: Gestion[];
  month: BoardMonth;
  searching: boolean;
  useAvatars: boolean;
  onOpen: (id: string) => void;
  dragState: DragState;
  onCardDragStart: (id: string) => void;
  onCardDragEnd: () => void;
  onColumnDragOver: (over: string) => void;
  onColumnDrop: (estado: EstadoActividad) => void;
  onAdd: (estado: EstadoActividad) => void;
  canCreate: boolean;
  canManageActivity: (activity: Actividad) => boolean;
}) {
  const items = actividades
    .filter((a) => a.estado === estado.id)
    .sort(compareColumnActivities(estado.id));
  const isOver = dragState.over === estado.id;

  return (
    <section
      className="group/col flex w-full min-w-0 flex-col gap-2.5"
      onDragOver={(e) => {
        e.preventDefault();
        onColumnDragOver(estado.id);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onColumnDrop(estado.id);
      }}
    >
      <div className="flex items-center gap-2 px-1">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", ACCENT_DOT[estado.accent])} />
        <span className="text-[13.5px] font-bold tracking-[-.01em]">{estado.label}</span>
        <span className="min-w-[20px] rounded-full bg-chip px-[7px] py-0.5 text-center text-[11px] font-bold text-ink-soft">
          {items.length}
        </span>
        {canCreate && (
          <button
            type="button"
            onClick={() => onAdd(estado.id)}
            className="ml-auto inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-full text-ink-disabled transition-colors hover:bg-estado-pendiente-bg hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 sm:h-6 sm:w-6 sm:opacity-0 sm:group-hover/col:opacity-100 sm:focus-visible:opacity-100"
            title="Nueva actividad"
            aria-label={`Nueva actividad en ${estado.label}`}
          >
            <Icon name="plus" size={14} />
          </button>
        )}
      </div>
      <div
        className={cn(
          "flex min-h-[220px] flex-1 flex-col gap-2.5 rounded-kpi p-2.5 transition-colors",
          isOver ? "bg-chip" : "bg-column",
        )}
      >
        {items.map((act) => (
          <KanbanCard
            key={act.id}
            act={act}
            fun={funcionarios.find((f) => f.id === act.funcionarioId)}
            comp={competencias.find((c) => c.id === act.competenciaId)}
            gestiones={gestiones}
            month={month}
            useAvatars={useAvatars}
            onOpen={() => onOpen(act.id)}
            isDragging={dragState.id === act.id}
            canMove={canManageActivity(act)}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", act.id);
              onCardDragStart(act.id);
            }}
            onDragEnd={onCardDragEnd}
          />
        ))}
        {items.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-3 py-6 text-center">
            <Icon name="search" size={18} className="text-ink-disabled" />
            <span className="text-[11.5px] font-semibold text-estado-pendiente">
              {searching ? "Sin coincidencias" : "Sin actividades este mes"}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

export function KanbanBoard({
  activities,
  setActivities,
  funcionarios,
  competencias,
  gestiones,
  month,
  searching,
  useAvatars,
  onOpen,
  onAdd,
  canCreate,
  canManageActivity,
}: {
  /* Ya filtradas y acotadas al mes por la pantalla del Tablero. */
  activities: Actividad[];
  setActivities: React.Dispatch<React.SetStateAction<Actividad[]>>;
  funcionarios: Funcionario[];
  competencias: Competencia[];
  gestiones: Gestion[];
  month: BoardMonth;
  searching: boolean;
  useAvatars: boolean;
  onOpen: (id: string) => void;
  onAdd: (estado: EstadoActividad) => void;
  canCreate: boolean;
  canManageActivity: (activity: Actividad) => boolean;
}) {
  const [dragState, setDragState] = useState<DragState>({ id: null, over: null });

  const porId = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);

  function handleDrop(targetEstado: EstadoActividad) {
    if (!dragState.id) return;
    const current = porId.get(dragState.id);
    if (!current || !canManageActivity(current)) return;
    setActivities((prev) =>
      prev.map((a) => {
        if (a.id !== dragState.id) return a;
        if (a.estado === targetEstado) return a;
        const upd: Actividad = { ...a, estado: targetEstado };
        if (targetEstado === "cumplida" && !a.fechaCumplimiento) upd.fechaCumplimiento = TODAY_ISO;
        if (targetEstado !== "cumplida") upd.fechaCumplimiento = null;
        return upd;
      }),
    );
    setDragState({ id: null, over: null });
  }

  return (
    <div className="grid grid-cols-1 items-start gap-[14px] md:grid-cols-2 lg:grid-cols-4">
      {ESTADOS.map((estado) => (
        <KanbanColumn
          key={estado.id}
          estado={estado}
          actividades={activities}
          funcionarios={funcionarios}
          competencias={competencias}
          gestiones={gestiones}
          month={month}
          searching={searching}
          useAvatars={useAvatars}
          onOpen={onOpen}
          onAdd={onAdd}
          dragState={dragState}
          onCardDragStart={(id) => setDragState({ id, over: null })}
          onCardDragEnd={() => setDragState({ id: null, over: null })}
          onColumnDragOver={(over) => setDragState((s) => (s.id ? { ...s, over } : s))}
          onColumnDrop={handleDrop}
          canCreate={canCreate}
          canManageActivity={canManageActivity}
        />
      ))}
    </div>
  );
}

export type { BoardMonth, FilterContext, Filters };
