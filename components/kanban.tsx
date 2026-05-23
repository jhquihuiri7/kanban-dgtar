"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Avatar, Badge, Icon } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  ESTADOS,
  TODAY_ISO,
  daysBetween,
  fmtFecha,
  plazoInfo,
  unidadTone,
  type Actividad,
  type Competencia,
  type EstadoActividad,
  type EstadoDef,
  type Funcionario,
} from "@/lib/data";

interface Filters {
  funcionario: string;
  competencia: string;
  q: string;
}

interface DragState {
  id: string | null;
  over: string | null;
}

function KanbanCard({
  act,
  fun,
  comp,
  useAvatars,
  density,
  onOpen,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  act: Actividad;
  fun?: Funcionario;
  comp?: Competencia;
  useAvatars: boolean;
  density: string;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  const p = plazoInfo(act, TODAY_ISO);
  const compact = density === "compact";

  const stripe = {
    green: "bg-green-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    slate: "bg-slate-200",
  }[p.tone];

  return (
    <div
      draggable
      onDragStart={onDragStart}
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
            <div className="flex items-center gap-1.5">
              <Badge variant={comp ? unidadTone(comp.unidad) : "slate"} className="!px-1.5 !py-0">
                {comp ? comp.unidad : "—"}
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
          <Avatar funcionario={fun} useAvatars={useAvatars} size={compact ? 22 : 26} />
        </div>

        {!compact && (
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-1">
              <Icon name="calendar" size={12} />
              <span>{fmtFecha(act.fechaVencimiento)}</span>
            </div>
            <Badge variant={p.tone}>
              {p.kind === "overdue" || p.kind === "today" ? (
                <Icon name="alert" size={10} />
              ) : p.kind === "ok" ? (
                <Icon name="check" size={10} />
              ) : (
                <Icon name="clock" size={10} />
              )}
              {p.text}
            </Badge>
          </div>
        )}
        {compact && (
          <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-slate-500">
            <span className="font-medium text-slate-600">{fun?.nombre.split(" ")[0]}</span>
            <Badge variant={p.tone} className="!text-[10px] !px-1 !py-0">
              {p.text}
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
  useAvatars,
  density,
  onOpen,
  dragState,
  onCardDragStart,
  onCardDragEnd,
  onColumnDragOver,
  onColumnDrop,
  onAdd,
}: {
  estado: EstadoDef;
  actividades: Actividad[];
  funcionarios: Funcionario[];
  competencias: Competencia[];
  useAvatars: boolean;
  density: string;
  onOpen: (id: string) => void;
  dragState: DragState;
  onCardDragStart: (id: string) => void;
  onCardDragEnd: () => void;
  onColumnDragOver: (over: string) => void;
  onColumnDrop: (estado: EstadoActividad) => void;
  onAdd: (estado: EstadoActividad) => void;
}) {
  const items = actividades
    .filter((a) => a.estado === estado.id)
    .sort((a, b) => a.orden - b.orden);
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
        <button
          onClick={() => onAdd(estado.id)}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="Nueva actividad"
        >
          <Icon name="plus" size={14} />
        </button>
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
            useAvatars={useAvatars}
            density={density}
            onOpen={() => onOpen(act.id)}
            isDragging={dragState.id === act.id}
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
  useAvatars,
  density,
  onOpen,
  onAdd,
  filters,
}: {
  activities: Actividad[];
  setActivities: React.Dispatch<React.SetStateAction<Actividad[]>>;
  funcionarios: Funcionario[];
  competencias: Competencia[];
  useAvatars: boolean;
  density: string;
  onOpen: (id: string) => void;
  onAdd: (estado: EstadoActividad) => void;
  filters: Filters;
}) {
  const [dragState, setDragState] = useState<DragState>({ id: null, over: null });

  const filtered = useMemo(() => {
    return activities.filter((a) => {
      if (filters.funcionario !== "all" && a.funcionarioId !== filters.funcionario) return false;
      if (filters.competencia !== "all" && a.competenciaId !== filters.competencia) return false;
      if (filters.q && !a.titulo.toLowerCase().includes(filters.q.toLowerCase())) return false;
      return true;
    });
  }, [activities, filters]);

  function handleDrop(targetEstado: EstadoActividad) {
    if (!dragState.id) return;
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
          useAvatars={useAvatars}
          density={density}
          onOpen={onOpen}
          onAdd={onAdd}
          dragState={dragState}
          onCardDragStart={(id) => setDragState({ id, over: null })}
          onCardDragEnd={() => setDragState({ id: null, over: null })}
          onColumnDragOver={(over) => setDragState((s) => (s.id ? { ...s, over } : s))}
          onColumnDrop={handleDrop}
        />
      ))}
    </div>
  );
}

export type { Filters };
