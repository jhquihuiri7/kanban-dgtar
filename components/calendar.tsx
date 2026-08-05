"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { Avatar, Badge, Icon, avatarGradient } from "@/components/ui";
import { filterActivities, type Filters } from "@/components/kanban";
import { cn } from "@/lib/utils";
import {
  TODAY_ISO,
  ZONE_TZ,
  addDays,
  dateOnly,
  fechaFinInfo,
  fmtHora,
  gestionNombre,
  initials,
  iso,
  type Actividad,
  type Competencia,
  type FechaInfo,
  type FechaTone,
  type Funcionario,
  type Gestion,
} from "@/lib/data";

type CalendarMode = "week" | "month";

const DAY_NAMES = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const MAX_WEEK_ITEMS = 3;
const MAX_MONTH_ITEMS = 2;

const STRIPE: Record<FechaTone, string> = {
  red: "bg-estado-vencida",
  amber: "bg-estado-revision",
  slate: "bg-estado-pendiente",
  green: "bg-estado-cumplida",
};

/* Orden dentro del día: rojas → ámbar → slate → verdes. */
const TONE_RANK: Record<FechaTone, number> = { red: 0, amber: 1, slate: 2, green: 3 };

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
function daysInMonth(isoStr: string): number {
  const d = dateOf(isoStr);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).getUTCDate();
}
function monthName(isoStr: string): string {
  return dateOf(isoStr).toLocaleDateString("es-EC", { month: "long", timeZone: ZONE_TZ });
}
function year(isoStr: string): number {
  return dateOf(isoStr).getUTCFullYear();
}

function agendaDayLabel(isoStr: string): string {
  const label = dateOf(isoStr).toLocaleDateString("es-EC", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: ZONE_TZ,
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/* Rango de la semana: "15 – 21 junio", o "29 junio – 5 julio" si la cruza. */
function weekRangeLabel(start: string, end: string): string {
  if (monthIndex(start) === monthIndex(end)) {
    return `${dayNum(start)} – ${dayNum(end)} ${monthName(end)}`;
  }
  return `${dayNum(start)} ${monthName(start)} – ${dayNum(end)} ${monthName(end)}`;
}

/* Distancia al período actual: "en 1 semana", "hace 2 meses". */
function distanceHint(offset: number, mode: CalendarMode): string | null {
  if (offset === 0) return null;
  const n = Math.abs(offset);
  const unidad =
    mode === "week" ? (n === 1 ? "semana" : "semanas") : n === 1 ? "mes" : "meses";
  return offset > 0 ? `en ${n} ${unidad}` : `hace ${n} ${unidad}`;
}

/* ── item ordering ──────────────────────────────────────────────────── */

function compareInDay(day: string) {
  return (a: Actividad, b: Actividad): number => {
    const toneA = TONE_RANK[fechaFinInfo(a, TODAY_ISO).tone];
    const toneB = TONE_RANK[fechaFinInfo(b, TODAY_ISO).tone];
    if (toneA !== toneB) return toneA - toneB;
    // A igualdad, primero la que vence ese mismo día…
    const venceA = dateOnly(a.fechaFin) === day ? 0 : 1;
    const venceB = dateOnly(b.fechaFin) === day ? 0 : 1;
    if (venceA !== venceB) return venceA - venceB;
    // …y luego la de fin más próximo.
    const byFin = a.fechaFin.localeCompare(b.fechaFin);
    if (byFin !== 0) return byFin;
    return a.orden - b.orden || a.id.localeCompare(b.id);
  };
}

/* ── week cards ─────────────────────────────────────────────────────── */

function TaskCard({
  act,
  fun,
  useAvatars,
  onOpen,
}: {
  act: Actividad;
  fun?: Funcionario;
  useAvatars: boolean;
  onOpen: () => void;
}) {
  const fecha: FechaInfo = fechaFinInfo(act, TODAY_ISO);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={act.titulo}
      className="relative w-full overflow-hidden rounded-input border border-line bg-white py-[9px] pl-[11px] pr-[9px] text-left shadow-card transition hover:border-line-hover"
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", STRIPE[fecha.tone])} />
      <div className="text-[11.5px] font-[650] leading-[1.3] text-ink">{act.titulo}</div>
      <div className="mt-[7px] flex items-center justify-between gap-1.5">
        <Badge variant={fecha.tone} className="!px-[7px] !text-[9.5px]">
          {fecha.text}
        </Badge>
        <Avatar funcionario={fun} useAvatars={useAvatars} size={19} className="!text-[8px]" />
      </div>
    </button>
  );
}

/* Reunión: tarjeta morada con la tarjeta blanca dentro y avatares apilados. */
function MeetingCard({
  act,
  participantes,
  onOpen,
}: {
  act: Actividad;
  participantes: Funcionario[];
  onOpen: () => void;
}) {
  const hora = fmtHora(act.fechaInicio);
  const visibles = participantes.slice(0, 3);
  const extra = participantes.length - visibles.length;

  return (
    <button
      type="button"
      onClick={onOpen}
      title={act.titulo}
      className="w-full rounded-[13px] bg-[linear-gradient(135deg,#8B5CF6,#6D28D9)] px-2 pb-2 pt-[11px] text-left shadow-[0_4px_14px_rgba(109,40,217,.22)]"
    >
      <div className="px-1 pb-2 text-[9.5px] font-[750] uppercase tracking-[.05em] text-white/[.86]">
        Reunión
      </div>
      <div className="rounded-btn bg-white p-[9px] shadow-[0_2px_8px_rgba(18,18,26,.10)]">
        <div className="text-[11.5px] font-[650] leading-[1.3] text-ink">{act.titulo}</div>
        {hora && (
          <div className="mt-1.5 inline-flex rounded-full bg-estado-pendiente-bg px-[7px] py-0.5 text-[9.5px] font-bold text-ink-muted">
            {hora}
          </div>
        )}
        {visibles.length > 0 && (
          <div className="mt-2 flex items-center gap-[5px]">
            {visibles.map((f, i) => (
              <span
                key={f.id}
                title={f.nombre}
                className="flex h-[19px] w-[19px] items-center justify-center rounded-full text-[8px] font-bold text-white shadow-[0_0_0_1.5px_#fff]"
                style={{ background: avatarGradient(f.color), marginLeft: i === 0 ? 0 : -9 }}
              >
                {initials(f.nombre)}
              </span>
            ))}
            {extra > 0 && (
              <span className="ml-0.5 text-[9.5px] font-bold text-ink-faint">+{extra}</span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

/* ── mobile agenda ──────────────────────────────────────────────────── */

/* Phone agenda used instead of forcing the 7-column calendar through a
   320–430 px viewport. The full calendar remains available from sm upward. */
function MobileAgenda({
  days,
  byDay,
  funcionarios,
  useAvatars,
  onOpen,
  showEmptyDays,
  emptyMessage,
}: {
  days: string[];
  byDay: Map<string, Actividad[]>;
  funcionarios: Funcionario[];
  useAvatars: boolean;
  onOpen: (id: string) => void;
  showEmptyDays: boolean;
  emptyMessage: string;
}) {
  const visibleDays = showEmptyDays ? days : days.filter((day) => (byDay.get(day) ?? []).length > 0);

  if (visibleDays.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line-dashed bg-surface-subtle px-4 py-8 text-center text-[12px] font-semibold text-ink-disabled sm:hidden">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:hidden">
      {visibleDays.map((day) => {
        const items = byDay.get(day) ?? [];
        const isToday = day === TODAY_ISO;
        return (
          <section
            key={day}
            className={cn(
              "rounded-card border p-3",
              isToday ? "border-accent-border bg-accent-softer" : "border-line bg-white",
            )}
          >
            <div className="mb-2 flex min-h-8 items-center justify-between gap-3">
              <div className="text-[13px] font-bold tracking-[-.01em] text-ink">
                {agendaDayLabel(day)}
                {isToday && <span className="ml-1.5 text-[11px] font-bold text-accent">· Hoy</span>}
              </div>
              <span className="shrink-0 rounded-full bg-chip px-2 py-0.5 text-[11px] font-bold text-ink-soft">
                {items.length}
              </span>
            </div>
            {items.length > 0 ? (
              <div className="space-y-2">
                {items.map((activity) => (
                  <TaskCard
                    key={activity.id}
                    act={activity}
                    fun={funcionarios.find((f) => f.id === activity.funcionarioId)}
                    useAvatars={useAvatars}
                    onOpen={() => onOpen(activity.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-btn border border-dashed border-line-dashed bg-surface-subtle px-3 py-3 text-[11.5px] font-semibold text-ink-disabled">
                Sin actividades
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ── Week view ──────────────────────────────────────────────────────── */

function WeekView({
  days,
  byDay,
  funcionarios,
  useAvatars,
  onOpen,
}: {
  days: string[];
  byDay: Map<string, Actividad[]>;
  funcionarios: Funcionario[];
  useAvatars: boolean;
  onOpen: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, true>>({});

  return (
    <>
      <MobileAgenda
        days={days}
        byDay={byDay}
        funcionarios={funcionarios}
        useAvatars={useAvatars}
        onOpen={onOpen}
        showEmptyDays
        emptyMessage="Sin actividades esta semana"
      />
      <div className="-mx-1 mt-[18px] hidden overflow-x-auto px-1 sm:block">
        <div className="grid min-w-[840px] grid-cols-7 gap-2.5">
          {days.map((d) => {
            const items = byDay.get(d) ?? [];
            const isToday = d === TODAY_ISO;
            const abierto = Boolean(expanded[d]);
            const mostrados = abierto ? items : items.slice(0, MAX_WEEK_ITEMS);
            const ocultos = items.length - mostrados.length;
            return (
              <div key={d} className="flex min-w-0 flex-col gap-2.5">
                <div
                  className={cn(
                    "flex items-baseline justify-between rounded-input px-2.5 py-1.5",
                    isToday ? "bg-ink" : "bg-app",
                  )}
                >
                  <span
                    className={cn(
                      "text-[10.5px] font-[750] uppercase tracking-[.05em]",
                      isToday ? "text-white/70" : "text-ink-faint",
                    )}
                  >
                    {DAY_NAMES[(dateOf(d).getUTCDay() + 6) % 7]}
                  </span>
                  <span className={cn("text-[13px] font-extrabold", isToday ? "text-white" : "text-ink")}>
                    {dayNum(d)}
                  </span>
                </div>
                <div
                  className={cn(
                    "flex min-h-[190px] flex-1 flex-col gap-2 rounded-card p-2",
                    isToday ? "bg-accent-soft" : "bg-surface-muted",
                  )}
                >
                  {mostrados.map((a) =>
                    a.tipo === "reunion" ? (
                      <MeetingCard
                        key={a.id}
                        act={a}
                        participantes={participantesDe(a, funcionarios)}
                        onOpen={() => onOpen(a.id)}
                      />
                    ) : (
                      <TaskCard
                        key={a.id}
                        act={a}
                        fun={funcionarios.find((f) => f.id === a.funcionarioId)}
                        useAvatars={useAvatars}
                        onOpen={() => onOpen(a.id)}
                      />
                    ),
                  )}
                  {ocultos > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpanded((e) => ({ ...e, [d]: true }))}
                      className="pl-0.5 text-left text-[10.5px] font-[650] text-accent hover:underline"
                    >
                      +{ocultos} más
                    </button>
                  )}
                  {abierto && items.length > MAX_WEEK_ITEMS && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((e) => {
                          const next = { ...e };
                          delete next[d];
                          return next;
                        })
                      }
                      className="pl-0.5 text-left text-[10.5px] font-[650] text-ink-faint hover:underline"
                    >
                      Ver menos
                    </button>
                  )}
                  {items.length === 0 && (
                    <div className="flex flex-1 items-center justify-center text-[10.5px] font-semibold text-ink-disabled">
                      Sin actividades
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function participantesDe(act: Actividad, funcionarios: Funcionario[]): Funcionario[] {
  const ids = [act.funcionarioId, ...(act.participantesIds ?? [])];
  const vistos = new Set<string>();
  const out: Funcionario[] = [];
  for (const id of ids) {
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    const f = funcionarios.find((x) => x.id === id);
    if (f) out.push(f);
  }
  return out;
}

/* ── Month view ─────────────────────────────────────────────────────── */

function MonthView({
  refDate,
  byDay,
  competencias,
  funcionarios,
  gestiones,
  useAvatars,
  onOpen,
}: {
  refDate: string;
  byDay: Map<string, Actividad[]>;
  competencias: Competencia[];
  funcionarios: Funcionario[];
  gestiones: Gestion[];
  useAvatars: boolean;
  onOpen: (id: string) => void;
}) {
  const primero = firstOfMonth(refDate);
  const gridStart = mondayOf(primero);
  // 28, 35 o 42 celdas según dónde caiga el mes: las filas se calculan.
  const leading = (dateOf(primero).getUTCDay() + 6) % 7;
  const filas = Math.ceil((leading + daysInMonth(refDate)) / 7);
  const days = Array.from({ length: filas * 7 }, (_, i) => iso(addDays(gridStart, i)));
  const curMonth = monthIndex(refDate);
  const monthDays = days.filter((day) => monthIndex(day) === curMonth);

  return (
    <>
      <MobileAgenda
        days={monthDays}
        byDay={byDay}
        funcionarios={funcionarios}
        useAvatars={useAvatars}
        onOpen={onOpen}
        showEmptyDays={false}
        emptyMessage="Sin actividades este mes"
      />
      <div className="-mx-1 mt-[18px] hidden overflow-x-auto px-1 sm:block">
        <div className="min-w-[840px]">
          <div className="grid grid-cols-7 gap-2">
            {DAY_NAMES.map((n, i) => (
              <div
                key={n}
                className={cn(
                  "px-1 pb-1.5 text-[10.5px] font-[750] uppercase tracking-[.05em]",
                  i >= 5 ? "text-estado-pendiente" : "text-ink-faint",
                )}
              >
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
                    "flex min-h-[104px] flex-col rounded-[13px] border p-2",
                    isToday
                      ? "border-accent-border bg-accent-softer"
                      : inMonth
                        ? "border-line bg-white"
                        : "border-line-soft bg-surface-subtle",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "text-[11.5px] font-bold",
                        isToday
                          ? "flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ink text-white"
                          : inMonth
                            ? "text-ink"
                            : "text-ink-disabled",
                      )}
                    >
                      {dayNum(d)}
                    </span>
                    {items.length > 0 && (
                      <span className="text-[9.5px] font-bold text-ink-label">{items.length}</span>
                    )}
                  </div>
                  <div className="mt-[5px] flex flex-col gap-[3px]">
                    {items.slice(0, MAX_MONTH_ITEMS).map((a) => (
                      <MonthItem
                        key={a.id}
                        act={a}
                        comp={competencias.find((c) => c.id === a.competenciaId)}
                        gestiones={gestiones}
                        onOpen={() => onOpen(a.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function MonthItem({
  act,
  comp,
  gestiones,
  onOpen,
}: {
  act: Actividad;
  comp?: Competencia;
  gestiones: Gestion[];
  onOpen: () => void;
}) {
  const fecha = fechaFinInfo(act, TODAY_ISO);
  const hora = fmtHora(act.fechaInicio);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${act.tipo === "reunion" && hora ? `${hora} · ` : ""}${act.titulo}${
        comp ? ` · ${gestionNombre(comp.gestionId, gestiones)}` : ""
      }`}
      className="flex w-full items-center gap-[5px] rounded text-left transition-colors hover:bg-estado-pendiente-bg"
    >
      <span className={cn("h-[5px] w-[5px] shrink-0 rounded-full", STRIPE[fecha.tone])} />
      <span className="truncate text-[10px] font-[550] text-ink-muted">
        {act.tipo === "reunion" && hora && <span className="font-bold">{hora} </span>}
        {act.titulo}
      </span>
    </button>
  );
}

/* ── Calendar container ─────────────────────────────────────────────── */

export function CalendarView({
  mode,
  activities,
  funcionarios,
  competencias,
  gestiones,
  useAvatars,
  filters,
  onOpen,
}: {
  mode: CalendarMode;
  activities: Actividad[];
  funcionarios: Funcionario[];
  competencias: Competencia[];
  gestiones: Gestion[];
  useAvatars: boolean;
  filters: Filters;
  onOpen: (id: string) => void;
}) {
  const [periodOffset, setPeriodOffset] = useState(0);

  // El desplazamiento se reinicia al cambiar de vista (semana ↔ mes).
  useEffect(() => {
    setPeriodOffset(0);
  }, [mode]);

  const refDate = useMemo(
    () =>
      mode === "week"
        ? iso(addDays(mondayOf(TODAY_ISO), periodOffset * 7))
        : shiftMonth(TODAY_ISO, periodOffset),
    [mode, periodOffset],
  );

  const days = useMemo(() => {
    const start = mode === "week" ? mondayOf(refDate) : mondayOf(firstOfMonth(refDate));
    const total = mode === "week" ? 7 : 42;
    return Array.from({ length: total }, (_, i) => iso(addDays(start, i)));
  }, [mode, refDate]);

  const visibleRange = useMemo(
    () => ({ from: days[0], to: days[days.length - 1] }),
    [days],
  );

  const byDay = useMemo(() => {
    const m = new Map<string, Actividad[]>();
    for (const a of filterActivities(activities, filters, { funcionarios, competencias, gestiones })) {
      const inicio = dateOnly(a.fechaInicio);
      const fin = dateOnly(a.fechaFin);
      if (!inicio || !fin) continue;
      const activityFrom = inicio <= fin ? inicio : fin;
      const activityTo = inicio <= fin ? fin : inicio;
      const from = activityFrom > visibleRange.from ? activityFrom : visibleRange.from;
      const to = activityTo < visibleRange.to ? activityTo : visibleRange.to;
      if (from > to) continue;
      for (let key = from; key <= to; key = iso(addDays(key, 1))) {
        const list = m.get(key);
        if (list) list.push(a);
        else m.set(key, [a]);
        if (key === to) break;
      }
    }
    m.forEach((list, day) => list.sort(compareInDay(day)));
    return m;
  }, [activities, filters, funcionarios, competencias, gestiones, visibleRange]);

  const titulo = useMemo(() => {
    if (mode === "month") {
      const nombre = monthName(refDate);
      return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)}`;
    }
    const start = mondayOf(refDate);
    return weekRangeLabel(start, iso(addDays(start, 6)));
  }, [mode, refDate]);

  const anio = mode === "month" ? year(refDate) : year(iso(addDays(mondayOf(refDate), 6)));
  const hint = distanceHint(periodOffset, mode);
  const flecha =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink-muted transition-colors hover:border-line-hover hover:bg-surface-subtle sm:h-8 sm:w-8";

  return (
    <div className="min-w-0 rounded-section border border-line bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-[17px] font-extrabold tracking-[-.03em] sm:text-[19px]">{titulo}</span>
          <span className="text-[17px] font-medium tracking-[-.03em] text-estado-pendiente sm:text-[19px]">
            {anio}
          </span>
          {hint && (
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent">
              {hint}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPeriodOffset((o) => o - 1)}
            aria-label={mode === "week" ? "Semana anterior" : "Mes anterior"}
            className={flecha}
          >
            <Icon name="chevronLeft" size={14} />
          </button>
          <button
            type="button"
            onClick={() => setPeriodOffset((o) => o + 1)}
            aria-label={mode === "week" ? "Semana siguiente" : "Mes siguiente"}
            className={flecha}
          >
            <Icon name="chevronRight" size={14} />
          </button>
          <button
            type="button"
            onClick={() => setPeriodOffset(0)}
            disabled={periodOffset === 0}
            title={
              periodOffset === 0
                ? mode === "week"
                  ? "Ya estás en la semana actual"
                  : "Ya estás en el mes actual"
                : "Volver al período actual"
            }
            className={cn(
              "h-11 shrink-0 rounded-full px-3.5 text-[12px] font-bold transition-colors sm:h-8",
              periodOffset === 0
                ? "cursor-default text-ink-disabled"
                : "bg-accent-soft text-accent hover:bg-accent-border/60",
            )}
          >
            Hoy
          </button>
        </div>
      </div>

      {mode === "week" ? (
        <WeekView
          days={days}
          byDay={byDay}
          funcionarios={funcionarios}
          useAvatars={useAvatars}
          onOpen={onOpen}
        />
      ) : (
        <MonthView
          refDate={refDate}
          byDay={byDay}
          funcionarios={funcionarios}
          competencias={competencias}
          gestiones={gestiones}
          useAvatars={useAvatars}
          onOpen={onOpen}
        />
      )}
    </div>
  );
}
