"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Avatar, Badge, Icon } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  ESTADOS,
  TODAY_ISO,
  actividadIncludesFuncionario,
  fmtFecha,
  fmtHora,
  fechaFinInfo,
  gestionNombre,
  gestionTone,
  type Actividad,
  type Competencia,
  type EstadoActividad,
  type EstadoDef,
  type FechaInfo,
  type Funcionario,
  type Gestion,
} from "@/lib/data";

interface Filters {
  funcionario: string;
  competencia: string;
  q: string;
}

/* Shared activity filter used by both the board and the calendar views. */
export function filterActivities(activities: Actividad[], filters: Filters): Actividad[] {
  return activities.filter((a) => {
    if (filters.funcionario !== "all" && !actividadIncludesFuncionario(a, filters.funcionario)) return false;
    if (filters.competencia !== "all" && a.competenciaId !== filters.competencia) return false;
    if (filters.q && !a.titulo.toLowerCase().includes(filters.q.toLowerCase())) return false;
    return true;
  });
}

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
  useAvatars,
  density,
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
  useAvatars: boolean;
  density: string;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  canMove: boolean;
}) {
  const fecha: FechaInfo = fechaFinInfo(act, TODAY_ISO);
  const compact = density === "compact";
  const participantesCount = act.tipo === "reunion" ? (act.participantesIds ?? []).length : 0;

  const stripe = {
    green: "bg-green-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    slate: "bg-slate-200",
  }[fecha.tone];

  return (
    <div
      draggable={canMove}
      onDragStart={(e) => {
        if (!canMove) return;
        onDragStart(e);
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-lg bg-white ring-1 ring-foreground/10 shadow-[0_1px_0_rgba(15,23,42,0.04)] transition hover:ring-foreground/20 hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]",
        isDragging && "opacity-40 rotate-[0.5deg]",
      )}
    >
      <div className={cn("absolute left-0 top-0 h-full w-1", stripe)} />
      <div className={cn("pl-3", compact ? "pr-2.5 py-2" : "pr-3 py-2.5")}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {act.tipo === "reunion" && (
                <Badge variant="violet" className="!px-1.5 !py-0">
                  <Icon name="users" size={10} /> Reunión
                </Badge>
              )}
              <Badge variant={comp ? gestionTone(comp.gestionId, gestiones) : "slate"} className="!px-1.5 !py-0">
                {comp ? gestionNombre(comp.gestionId, gestiones) : "—"}
              </Badge>
            </div>
            <div
              className={cn(
                "mt-1 font-medium text-slate-900 leading-snug line-clamp-2",
                compact ? "text-[13px]" : "text-sm",
              )}
            >
              {act.titulo}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Avatar funcionario={fun} useAvatars={useAvatars} size={compact ? 22 : 26} />
            {participantesCount > 0 && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-foreground/10">
                +{participantesCount}
              </span>
            )}
          </div>
        </div>

        {!compact && (
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-1">
              <Icon name={act.tipo === "reunion" ? "clock" : "calendar"} size={12} />
              <span>
                {act.tipo === "reunion"
                  ? `${fmtFecha(act.fechaInicio)}${fmtHora(act.fechaInicio) ? ` · ${fmtHora(act.fechaInicio)}` : ""}`
                  : `${fmtFecha(act.fechaInicio)} – ${fmtFecha(act.fechaFin)}`}
              </span>
            </div>
            <Badge variant={fecha.tone}>
              {fecha.kind === "ended" || fecha.kind === "today" ? (
                <Icon name="alert" size={10} />
              ) : fecha.kind === "ok" ? (
                <Icon name="check" size={10} />
              ) : (
                <Icon name="clock" size={10} />
              )}
              {fecha.text}
            </Badge>
          </div>
        )}
        {compact && (
          <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-slate-500">
            <span className="font-medium text-slate-600">{fun?.nombre.split(" ")[0]}</span>
            <Badge variant={fecha.tone} className="!text-[10px] !px-1 !py-0">
              {fecha.text}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanColumn({
  estado,
  actividades,
  funcionarios,
  competencias,
  gestiones,
  useAvatars,
  density,
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
  useAvatars: boolean;
  density: string;
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
  const accentDot = {
    slate: "bg-slate-400",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    green: "bg-green-500",
  }[estado.accent];

  return (
    <div
      className="flex w-full min-w-0 flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        onColumnDragOver(estado.id);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onColumnDrop(estado.id);
      }}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", accentDot)} />
          <span className="text-sm font-semibold text-slate-800">{estado.label}</span>
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
            {items.length}
          </span>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => onAdd(estado.id)}
            className="inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 sm:h-6 sm:w-6"
            title="Nueva actividad"
            aria-label={`Nueva actividad en ${estado.label}`}
          >
            <Icon name="plus" size={14} />
          </button>
        )}
      </div>
      <div
        className={cn(
          "flex flex-1 flex-col gap-2 rounded-xl border border-dashed p-2 transition",
          isOver ? "border-slate-400 bg-slate-100/60" : "border-slate-200/80 bg-slate-100/30",
        )}
      >
        {items.map((act) => (
          <KanbanCard
            key={act.id}
            act={act}
            fun={funcionarios.find((f) => f.id === act.funcionarioId)}
            comp={competencias.find((c) => c.id === act.competenciaId)}
            gestiones={gestiones}
            useAvatars={useAvatars}
            density={density}
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
          <div className="flex flex-1 items-center justify-center py-6 text-xs text-slate-400">
            Sin actividades
          </div>
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({
  activities,
  setActivities,
  funcionarios,
  competencias,
  gestiones,
  useAvatars,
  density,
  onOpen,
  onAdd,
  filters,
  canCreate,
  canManageActivity,
}: {
  activities: Actividad[];
  setActivities: React.Dispatch<React.SetStateAction<Actividad[]>>;
  funcionarios: Funcionario[];
  competencias: Competencia[];
  gestiones: Gestion[];
  useAvatars: boolean;
  density: string;
  onOpen: (id: string) => void;
  onAdd: (estado: EstadoActividad) => void;
  filters: Filters;
  canCreate: boolean;
  canManageActivity: (activity: Actividad) => boolean;
}) {
  const [dragState, setDragState] = useState<DragState>({ id: null, over: null });

  const filtered = useMemo(() => filterActivities(activities, filters), [activities, filters]);

  function handleDrop(targetEstado: EstadoActividad) {
    if (!dragState.id) return;
    const current = activities.find((a) => a.id === dragState.id);
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
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
      {ESTADOS.map((estado) => (
        <KanbanColumn
          key={estado.id}
          estado={estado}
          actividades={filtered}
          funcionarios={funcionarios}
          competencias={competencias}
          gestiones={gestiones}
          useAvatars={useAvatars}
          density={density}
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

export type { Filters };
