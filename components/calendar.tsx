"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Avatar, Badge, Button, Icon } from "@/components/ui";
import { filterActivities, type Filters } from "@/components/kanban";
import { cn } from "@/lib/utils";
import {
  TODAY_ISO,
  ZONE_TZ,
  addDays,
  dateOnly,
  fmtFecha,
  fmtHora,
  iso,
  plazoInfo,
  unidadTone,
  type Actividad,
  type Competencia,
  type Funcionario,
  type PlazoTone,
} from "@/lib/data";

type CalendarMode = "week" | "month";

const DAY_NAMES = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

const STRIPE: Record<PlazoTone, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  slate: "bg-slate-300",
};

const DOT: Record<PlazoTone, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  slate: "bg-slate-400",
};

/* ── date helpers (all dates are ISO "YYYY-MM-DD", anchored at UTC noon) ── */

function dateOf(isoStr: string): Date {
  return addDays(isoStr, 0);
}
function mondayOf(isoStr: string): string {
  const dow = dateOf(isoStr).getUTCDay(); // 0=Sun … 6=Sat
  const diff = (dow + 6) % 7; // days since Monday
  return iso(addDays(isoStr, -diff));
}
function firstOfMonth(isoStr: string): string {
  const d = dateOf(isoStr);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12)));
}
function shiftMonth(isoStr: string, delta: number): string {
  const d = dateOf(isoStr);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1, 12)));
}
function dayNum(isoStr: string): number {
  return dateOf(isoStr).getUTCDate();
}
function monthIndex(isoStr: string): number {
  return dateOf(isoStr).getUTCMonth();
}
function monthLabel(isoStr: string): string {
  const s = dateOf(isoStr).toLocaleDateString("es-EC", {
    month: "long",
    year: "numeric",
    timeZone: ZONE_TZ,
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ── shared item used by both views ─────────────────────────────────── */

function CalendarItem({
  act,
  fun,
  comp,
  useAvatars,
  onOpen,
  variant,
}: {
  act: Actividad;
  fun?: Funcionario;
  comp?: Competencia;
  useAvatars: boolean;
  onOpen: () => void;
  variant: "week" | "month";
}) {
  const p = plazoInfo(act, TODAY_ISO);
  const esReunion = act.tipo === "reunion";
  const hora = fmtHora(act.fechaVencimiento);

  if (variant === "month") {
    return (
      <button
        onClick={onOpen}
        title={`${esReunion && hora ? hora + " · " : ""}${act.titulo}${comp ? " · " + comp.unidad : ""}`}
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10.5px] leading-tight text-slate-700 transition hover:bg-slate-100"
      >
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[p.tone])} />
        <span className="truncate">
          {esReunion && hora && <span className="font-semibold text-slate-500">{hora} </span>}
          {act.titulo}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={onOpen}
      title={act.titulo}
      className="group relative w-full overflow-hidden rounded-md bg-white text-left ring-1 ring-foreground/10 transition hover:ring-foreground/20 hover:shadow-[0_1px_4px_rgba(15,23,42,0.06)]"
    >
      <span className={cn("absolute left-0 top-0 h-full w-1", STRIPE[p.tone])} />
      <div className="py-1.5 pl-2.5 pr-1.5">
        <div className="flex flex-wrap items-center gap-1">
          {esReunion && (
            <Badge variant="violet" className="!px-1 !py-0 !text-[9.5px]">
              <Icon name="users" size={9} /> Reunión
            </Badge>
          )}
          <Badge variant={comp ? unidadTone(comp.unidad) : "slate"} className="!px-1 !py-0 !text-[9.5px]">
            {comp ? comp.unidad : "—"}
          </Badge>
        </div>
        <div className="mt-1 line-clamp-2 text-[11.5px] font-medium leading-snug text-slate-900">
          {act.titulo}
        </div>
        <div className="mt-1 flex items-center justify-between gap-1">
          <div className="flex min-w-0 items-center gap-1">
            {esReunion && hora && (
              <span className="shrink-0 text-[10px] font-semibold text-slate-600">{hora}</span>
            )}
            <Badge variant={p.tone} className="!px-1 !py-0 !text-[9.5px]">
              {p.text}
            </Badge>
          </div>
          <Avatar funcionario={fun} useAvatars={useAvatars} size={18} />
        </div>
      </div>
    </button>
  );
}

/* ── Week view ──────────────────────────────────────────────────────── */

function WeekView({
  refDate,
  byDay,
  funcionarios,
  competencias,
  useAvatars,
  onOpen,
}: {
  refDate: string;
  byDay: Map<string, Actividad[]>;
  funcionarios: Funcionario[];
  competencias: Competencia[];
  useAvatars: boolean;
  onOpen: (id: string) => void;
}) {
  const start = mondayOf(refDate);
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(start, i)));

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div className="grid min-w-[840px] grid-cols-7 gap-2">
        {days.map((d) => {
          const items = byDay.get(d) ?? [];
          const isToday = d === TODAY_ISO;
          return (
            <div key={d} className="flex min-w-0 flex-col">
              <div
                className={cn(
                  "mb-2 flex items-baseline justify-between rounded-lg px-2 py-1.5",
                  isToday ? "bg-slate-900 text-white" : "bg-slate-100/70 text-slate-600",
                )}
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide">
                  {DAY_NAMES[(dateOf(d).getUTCDay() + 6) % 7]}
                </span>
                <span className={cn("text-sm font-bold", !isToday && "text-slate-800")}>{dayNum(d)}</span>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 rounded-xl border border-dashed border-slate-200/80 bg-slate-100/30 p-1.5">
                {items.map((a) => (
                  <CalendarItem
                    key={a.id}
                    act={a}
                    fun={funcionarios.find((f) => f.id === a.funcionarioId)}
                    comp={competencias.find((c) => c.id === a.competenciaId)}
                    useAvatars={useAvatars}
                    onOpen={() => onOpen(a.id)}
                    variant="week"
                  />
                ))}
                {items.length === 0 && (
                  <div className="flex flex-1 items-center justify-center py-6 text-[11px] text-slate-300">
                    —
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Month view ─────────────────────────────────────────────────────── */

function MonthView({
  refDate,
  byDay,
  competencias,
  funcionarios,
  useAvatars,
  onOpen,
}: {
  refDate: string;
  byDay: Map<string, Actividad[]>;
  competencias: Competencia[];
  funcionarios: Funcionario[];
  useAvatars: boolean;
  onOpen: (id: string) => void;
}) {
  const gridStart = mondayOf(firstOfMonth(refDate));
  const days = Array.from({ length: 42 }, (_, i) => iso(addDays(gridStart, i)));
  const curMonth = monthIndex(refDate);

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div className="min-w-[840px]">
        <div className="grid grid-cols-7 gap-px">
          {DAY_NAMES.map((n) => (
            <div key={n} className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {n}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {days.map((d) => {
            const items = byDay.get(d) ?? [];
            const inMonth = monthIndex(d) === curMonth;
            const isToday = d === TODAY_ISO;
            return (
              <div
                key={d}
                className={cn(
                  "flex h-28 flex-col rounded-lg border p-1",
                  inMonth ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50/50",
                )}
              >
                <div className="flex items-center justify-between px-1">
                  <span
                    className={cn(
                      "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold",
                      isToday
                        ? "bg-slate-900 text-white"
                        : inMonth
                          ? "text-slate-700"
                          : "text-slate-400",
                    )}
                  >
                    {dayNum(d)}
                  </span>
                  {items.length > 0 && (
                    <span className="text-[10px] font-medium text-slate-400">{items.length}</span>
                  )}
                </div>
                <div className="mt-0.5 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
                  {items.map((a) => (
                    <CalendarItem
                      key={a.id}
                      act={a}
                      fun={funcionarios.find((f) => f.id === a.funcionarioId)}
                      comp={competencias.find((c) => c.id === a.competenciaId)}
                      useAvatars={useAvatars}
                      onOpen={() => onOpen(a.id)}
                      variant="month"
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Legend ─────────────────────────────────────────────────────────── */

function Legend() {
  const items: { tone: PlazoTone; label: string }[] = [
    { tone: "red", label: "Vencida / atrasada" },
    { tone: "amber", label: "Vence pronto" },
    { tone: "slate", label: "En plazo" },
    { tone: "green", label: "Cumplida en plazo" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
      {items.map((i) => (
        <span key={i.tone} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", DOT[i.tone])} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/* ── Calendar container ─────────────────────────────────────────────── */

export function CalendarView({
  mode,
  activities,
  funcionarios,
  competencias,
  useAvatars,
  filters,
  onOpen,
}: {
  mode: CalendarMode;
  activities: Actividad[];
  funcionarios: Funcionario[];
  competencias: Competencia[];
  useAvatars: boolean;
  filters: Filters;
  onOpen: (id: string) => void;
}) {
  const [refDate, setRefDate] = useState<string>(TODAY_ISO);

  const byDay = useMemo(() => {
    const m = new Map<string, Actividad[]>();
    for (const a of filterActivities(activities, filters)) {
      if (!a.fechaVencimiento) continue;
      const key = dateOnly(a.fechaVencimiento); // ignora la hora de las reuniones
      const list = m.get(key);
      if (list) list.push(a);
      else m.set(key, [a]);
    }
    m.forEach((list) => list.sort((x, y) => x.orden - y.orden));
    return m;
  }, [activities, filters]);

  const label = useMemo(() => {
    if (mode === "month") return monthLabel(refDate);
    const start = mondayOf(refDate);
    const end = iso(addDays(start, 6));
    return `${fmtFecha(start)} – ${fmtFecha(end)} ${dateOf(end).getUTCFullYear()}`;
  }, [mode, refDate]);

  const step = (delta: number) =>
    setRefDate((r) => (mode === "month" ? shiftMonth(r, delta) : iso(addDays(r, delta * 7))));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => step(-1)} title="Anterior">
            <Icon name="arrow" size={14} className="rotate-180" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRefDate(TODAY_ISO)}>
            Hoy
          </Button>
          <Button variant="outline" size="icon" onClick={() => step(1)} title="Siguiente">
            <Icon name="arrow" size={14} />
          </Button>
          <div className="ml-1 text-sm font-semibold text-slate-800">{label}</div>
        </div>
        <Legend />
      </div>

      {mode === "week" ? (
        <WeekView
          refDate={refDate}
          byDay={byDay}
          funcionarios={funcionarios}
          competencias={competencias}
          useAvatars={useAvatars}
          onOpen={onOpen}
        />
      ) : (
        <MonthView
          refDate={refDate}
          byDay={byDay}
          funcionarios={funcionarios}
          competencias={competencias}
          useAvatars={useAvatars}
          onOpen={onOpen}
        />
      )}
    </div>
  );
}
