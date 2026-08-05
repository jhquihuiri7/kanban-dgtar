"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Avatar, Icon, type IconName } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  ESTADOS,
  TODAY_ISO,
  actividadIncludesFuncionario,
  addDays,
  competenciaCodigo,
  dateOnly,
  daysBetween,
  fechaFinInfo,
  fmtFecha,
  gestionNombre,
  iso,
  type Actividad,
  type Competencia,
  type Entregable,
  type EstadoActividad,
  type Funcionario,
  type Gestion,
} from "@/lib/data";

interface DateRange {
  from: string;
  to: string;
}

const ESTADO_HEX: Record<string, string> = {
  pendiente: "#A5A5B3",
  en_progreso: "#3B82F6",
  en_revision: "#F59E0B",
  cumplida: "#10B981",
};

const SIN_GESTION = "__sin_gestion__";
const SIN_ENTREGABLE = "__sin_entregable__";
const VACIO = "Sin actividades en el período seleccionado";

/* ── helpers ────────────────────────────────────────────────────────── */

function rangeDays(range: DateRange): string[] {
  const total = Math.max(1, daysBetween(range.from, range.to) + 1);
  return Array.from({ length: total }, (_, i) => iso(addDays(range.from, i)));
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function EmptyBox({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[13px] border border-dashed border-line-dashed bg-surface-subtle px-5 py-[30px] text-center">
      <Icon name={icon} size={20} className="text-ink-disabled" />
      <span className="text-[12.5px] font-semibold text-ink-ghost">{children}</span>
    </div>
  );
}

function Section({
  title,
  subtitle,
  right,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-section border border-line bg-white p-4 shadow-card sm:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3.5">
        <div className="min-w-0">
          <h2 className="text-[16px] font-[750] tracking-[-.02em]">{title}</h2>
          {subtitle && <div className="mt-[3px] text-[12px] font-medium text-ink-faint">{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/* ── KPIs ───────────────────────────────────────────────────────────── */

function Kpi({
  icon,
  iconColor,
  label,
  value,
  valueColor,
  sub,
}: {
  icon: IconName;
  iconColor: string;
  label: string;
  value: number;
  valueColor?: string;
  sub: string;
}) {
  return (
    <div className="rounded-kpi border border-line bg-white px-4 py-4 shadow-card sm:px-5 sm:py-[18px]">
      <div className="flex items-center gap-2.5">
        <Icon name={icon} size={17} className="shrink-0" style={{ color: iconColor }} />
        <span className="text-[13px] font-[650] text-[#2B2B36]">{label}</span>
      </div>
      <div
        className="mt-3 text-[26px] font-extrabold leading-none tracking-[-.035em] sm:text-[30px]"
        style={{ color: valueColor }}
      >
        {value}
      </div>
      <div className="mt-[5px] text-[11px] font-[550] text-ink-ghost">{sub}</div>
    </div>
  );
}

/* ── Gantt ──────────────────────────────────────────────────────────── */

interface GanttActivity {
  act: Actividad;
  startIndex: number;
  span: number;
}

interface GanttFuncionario {
  key: string;
  funcionario?: Funcionario;
  nombre: string;
  cargo: string;
  actividades: GanttActivity[];
}

interface GanttGestion {
  key: string;
  nombre: string;
  color: string;
  funcionarios: GanttFuncionario[];
  total: number;
}

function buildGantt(
  activities: Actividad[],
  funcionarios: Funcionario[],
  competencias: Competencia[],
  gestiones: Gestion[],
  range: DateRange,
  totalDays: number,
): GanttGestion[] {
  const porGestion = new Map<string, Map<string, Actividad[]>>();

  for (const act of activities) {
    const comp = competencias.find((c) => c.id === act.competenciaId);
    const gestionId = comp?.gestionId ?? SIN_GESTION;
    const funcionarioId = act.funcionarioId || "__sin_responsable__";
    let porFuncionario = porGestion.get(gestionId);
    if (!porFuncionario) {
      porFuncionario = new Map();
      porGestion.set(gestionId, porFuncionario);
    }
    const lista = porFuncionario.get(funcionarioId);
    if (lista) lista.push(act);
    else porFuncionario.set(funcionarioId, [act]);
  }

  const orden = [...gestiones.map((g) => g.id), SIN_GESTION];

  return orden
    .filter((gestionId) => porGestion.has(gestionId))
    .map((gestionId) => {
      const gestion = gestiones.find((g) => g.id === gestionId);
      const porFuncionario = porGestion.get(gestionId)!;
      const filas: GanttFuncionario[] = Array.from(porFuncionario.entries())
        .map(([funcionarioId, lista]) => {
          const funcionario = funcionarios.find((f) => f.id === funcionarioId);
          return {
            key: `${gestionId}:${funcionarioId}`,
            funcionario,
            nombre: funcionario?.nombre ?? "Sin responsable",
            cargo: funcionario?.cargo ?? "",
            // Las actividades de cada funcionario van por fecha de inicio ascendente.
            actividades: lista
              .slice()
              .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio) || a.orden - b.orden)
              .map((act) => {
                const inicio = dateOnly(act.fechaInicio);
                const fin = dateOnly(act.fechaFin);
                const desde = inicio <= fin ? inicio : fin;
                const hasta = inicio <= fin ? fin : inicio;
                // Barras recortadas al rango visible.
                const startIndex = Math.max(0, daysBetween(range.from, desde));
                const endIndex = Math.min(totalDays - 1, daysBetween(range.from, hasta));
                return { act, startIndex, span: Math.max(1, endIndex - startIndex + 1) };
              }),
          };
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre));

      return {
        key: gestionId,
        nombre: gestion?.nombre ?? "Sin gestión",
        color: gestion?.color ?? "#A5A5B3",
        funcionarios: filas,
        total: filas.reduce((n, f) => n + f.actividades.length, 0),
      };
    });
}

function GanttChart({
  activities,
  funcionarios,
  competencias,
  gestiones,
  range,
  onOpenActivity,
}: {
  activities: Actividad[];
  funcionarios: Funcionario[];
  competencias: Competencia[];
  gestiones: Gestion[];
  range: DateRange;
  onOpenActivity: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, true>>({});

  const days = useMemo(() => rangeDays(range), [range]);
  const totalDays = days.length;
  const grupos = useMemo(
    () => buildGantt(activities, funcionarios, competencias, gestiones, range, totalDays),
    [activities, funcionarios, competencias, gestiones, range, totalDays],
  );

  const vacio = grupos.length === 0;
  const todasPlegadas = grupos.length > 0 && grupos.every((g) => collapsed[g.key]);
  const todayIndex = days.indexOf(TODAY_ISO);

  // ≤ 31 días: una celda por día. Más: una celda por mes, con span proporcional.
  const cabecera = useMemo(() => {
    if (totalDays <= 31) {
      return days.map((d, i) => ({
        key: d,
        label: String(addDays(d, 0).getUTCDate()),
        span: 1,
        index: i,
      }));
    }
    const meses: { key: string; label: string; span: number; index: number }[] = [];
    days.forEach((d, i) => {
      const fecha = addDays(d, 0);
      const key = d.slice(0, 7);
      const previo = meses[meses.length - 1];
      if (previo && previo.key === key) previo.span += 1;
      else
        meses.push({
          key,
          label: fecha.toLocaleDateString("es-EC", { month: "short", timeZone: "UTC" }),
          span: 1,
          index: i,
        });
    });
    return meses;
  }, [days, totalDays]);

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  }

  function toggleAll() {
    if (todasPlegadas) setCollapsed({});
    else setCollapsed(Object.fromEntries(grupos.map((g) => [g.key, true as const])));
  }

  const trackStyle = { gridTemplateColumns: `repeat(${totalDays}, minmax(0, 1fr))` };

  return (
    <Section
      title="Diagrama de Gantt"
      subtitle={vacio ? undefined : "Pulsa una gestión o un funcionario para plegar sus filas"}
      right={
        vacio ? undefined : (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={toggleAll}
              className="flex h-8 items-center gap-[7px] whitespace-nowrap rounded-full border border-line bg-white px-[13px] text-[12px] font-[650] text-[#2B2B36] transition-colors hover:border-line-hover hover:bg-surface-subtle"
            >
              <Icon name={todasPlegadas ? "chevronDown" : "chevronRight"} size={13} className="text-ink-faint" />
              {todasPlegadas ? "Expandir todo" : "Contraer todo"}
            </button>
            <div className="flex flex-wrap items-center gap-x-[13px] gap-y-1.5 text-[11px] font-[650] text-ink-faint">
              {ESTADOS.map((e) => (
                <span key={e.id} className="inline-flex items-center gap-1.5">
                  <span
                    className="h-[7px] w-4 rounded-full"
                    style={{ background: ESTADO_HEX[e.id] }}
                  />
                  {e.label}
                </span>
              ))}
              {todayIndex >= 0 && (
                <span className="inline-flex items-center gap-1.5 text-accent">
                  <span className="h-[11px] w-[9px] rounded-[2px] border-x border-accent/40 bg-accent/[.07]" />
                  Hoy
                </span>
              )}
            </div>
          </div>
        )
      }
    >
      <div className="mt-4 overflow-x-auto rounded-kpi border border-line">
        <div className="min-w-[860px]">
          <div className="grid grid-cols-[280px_1fr] border-b border-line bg-surface-subtle">
            <div className="border-r border-line px-[18px] py-[11px] text-[12px] font-bold text-[#2B2B36]">
              Gestión / funcionario
            </div>
            <div className="grid" style={trackStyle}>
              {cabecera.map((c) => {
                const esHoy = c.key === TODAY_ISO;
                return (
                  <div
                    key={c.key}
                    style={{ gridColumn: `${c.index + 1} / span ${c.span}` }}
                    title={esHoy ? "Hoy" : undefined}
                    className={cn(
                      "border-l border-line-soft py-[11px] text-center text-[10.5px] font-bold first:border-l-0",
                      esHoy ? "bg-accent-soft text-accent" : "text-ink-faint",
                    )}
                  >
                    {c.label}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative">
            {/* Banda de «hoy». z-10 la deja por encima del fondo opaco de las
                filas y por debajo de las barras, que suben a z-20. */}
            {todayIndex >= 0 && (
              <div
                className="pointer-events-none absolute inset-y-0 left-[280px] right-0 z-10 grid"
                style={trackStyle}
                aria-hidden="true"
              >
                <div
                  style={{ gridColumn: `${todayIndex + 1} / span 1` }}
                  className="relative border-x border-accent/40 bg-accent/[.07]"
                >
                  <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-accent/60" />
                </div>
              </div>
            )}

            {vacio ? (
              <div className="p-4">
                <EmptyBox icon="list">{VACIO}</EmptyBox>
              </div>
            ) : (
              grupos.map((gestion) => {
                const gestionPlegada = Boolean(collapsed[gestion.key]);
                return (
                  <React.Fragment key={gestion.key}>
                    <button
                      type="button"
                      onClick={() => toggle(gestion.key)}
                      title={`${gestion.nombre} · ${gestion.total} actividades`}
                      className="grid w-full grid-cols-[280px_1fr] border-b border-line-soft bg-app text-left"
                    >
                      <div className="flex items-center gap-2 border-r border-line px-[18px] py-2.5">
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center text-ink-faint transition-transform duration-[180ms]",
                            gestionPlegada ? "" : "rotate-90",
                          )}
                        >
                          <Icon name="chevronRight" size={12} />
                        </span>
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: gestion.color }}
                        />
                        <span className="min-w-0 flex-1 text-[12.5px] font-[750] leading-[1.25] tracking-[-.015em]">
                          {gestion.nombre}
                        </span>
                        <span className="shrink-0 rounded-full bg-chip px-[7px] py-0.5 text-[10.5px] font-bold text-ink-soft">
                          {gestion.total}
                        </span>
                      </div>
                      <div />
                    </button>

                    {!gestionPlegada &&
                      gestion.funcionarios.map((fila) => {
                        const filaPlegada = Boolean(collapsed[fila.key]);
                        return (
                          <React.Fragment key={fila.key}>
                            <button
                              type="button"
                              onClick={() => toggle(fila.key)}
                              title={`${fila.nombre} · ${fila.actividades.length} actividades`}
                              className="grid w-full grid-cols-[280px_1fr] border-b border-line-soft bg-white text-left hover:bg-surface-subtle"
                            >
                              <div className="flex items-center gap-2 border-r border-line py-2 pl-[30px] pr-3">
                                <span
                                  className={cn(
                                    "flex h-4 w-4 shrink-0 items-center justify-center text-ink-faint transition-transform duration-[180ms]",
                                    filaPlegada ? "" : "rotate-90",
                                  )}
                                >
                                  <Icon name="chevronRight" size={11} />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[12px] font-[650]">{fila.nombre}</div>
                                  {fila.cargo && (
                                    <div className="truncate text-[10.5px] text-ink-ghost">{fila.cargo}</div>
                                  )}
                                </div>
                              </div>
                              <div className="relative grid items-center px-1 py-2" style={trackStyle}>
                                {filaPlegada &&
                                  fila.actividades.map((item) => (
                                    <span
                                      key={item.act.id}
                                      title={item.act.titulo}
                                      style={{
                                        gridColumn: `${item.startIndex + 1} / span ${item.span}`,
                                        gridRow: 1,
                                        background: ESTADO_HEX[item.act.estado] ?? ESTADO_HEX.pendiente,
                                        opacity: 0.55,
                                      }}
                                      className="relative z-20 h-[7px] rounded-full"
                                    />
                                  ))}
                              </div>
                            </button>

                            {!filaPlegada &&
                              fila.actividades.map((item) => (
                                <div
                                  key={item.act.id}
                                  className="grid grid-cols-[280px_1fr] border-b border-line-soft bg-white"
                                >
                                  <div className="border-r border-line" />
                                  <div className="grid items-center px-1 py-1" style={trackStyle}>
                                    <button
                                      type="button"
                                      onClick={() => onOpenActivity(item.act.id)}
                                      title={`${item.act.titulo} · ${fmtBarRange(item.act)}`}
                                      style={{
                                        gridColumn: `${item.startIndex + 1} / span ${item.span}`,
                                        background: ESTADO_HEX[item.act.estado] ?? ESTADO_HEX.pendiente,
                                      }}
                                      className="relative z-20 flex h-7 items-center overflow-hidden rounded-full px-3 text-left text-[12px] font-[650] text-white transition-opacity hover:opacity-90"
                                    >
                                      <span className="truncate">{item.act.titulo}</span>
                                    </button>
                                  </div>
                                </div>
                              ))}
                          </React.Fragment>
                        );
                      })}
                  </React.Fragment>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

function fmtBarRange(act: Actividad): string {
  return `${fmtFecha(act.fechaInicio)} – ${fmtFecha(act.fechaFin)}`;
}

/* ── Dona ───────────────────────────────────────────────────────────── */

const DONUT_C = 263.89;

function Donut({ activities }: { activities: Actividad[] }) {
  const datos = ESTADOS.map((e) => ({
    id: e.id,
    label: e.label,
    color: ESTADO_HEX[e.id],
    n: activities.filter((a) => a.estado === e.id).length,
  }));
  const total = datos.reduce((n, d) => n + d.n, 0);

  let acumulado = 0;
  const segmentos = datos
    .filter((d) => d.n > 0)
    .map((d) => {
      const largo = (d.n / total) * DONUT_C;
      const dash = Math.max(0, largo - 3);
      const seg = { ...d, dash, offset: -acumulado };
      acumulado += largo;
      return seg;
    });

  return (
    <Section title="Distribución por estado" subtitle={`${total} actividades en el período`}>
      {total === 0 ? (
        <div className="mt-4">
          <EmptyBox icon="chart">{VACIO}</EmptyBox>
        </div>
      ) : (
        <div className="mt-[18px] flex justify-center">
          <svg width="180" height="180" viewBox="0 0 120 120" role="img" aria-label="Distribución por estado">
            <circle cx="60" cy="60" r="42" fill="none" stroke="#F2F2F5" strokeWidth="15" />
            {segmentos.map((s) => (
              <circle
                key={s.id}
                cx="60"
                cy="60"
                r="42"
                fill="none"
                stroke={s.color}
                strokeWidth="15"
                strokeDasharray={`${s.dash} ${DONUT_C - s.dash}`}
                strokeDashoffset={s.offset}
                transform="rotate(-90 60 60)"
              />
            ))}
            <text x="60" y="57" textAnchor="middle" fontSize="22" fontWeight="800" fill="#12121A">
              {total}
            </text>
            <text x="60" y="71" textAnchor="middle" fontSize="8" fontWeight="600" fill="#9C9CAA">
              actividades
            </text>
          </svg>
        </div>
      )}
      <ul className="mt-[18px] flex flex-col gap-[9px]">
        {datos.map((d) => (
          <li key={d.id} className="flex items-center justify-between text-[12.5px]">
            <span className="inline-flex items-center gap-2 font-[550] text-ink-soft">
              <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
              {d.label}
            </span>
            <span className="font-[750]">{d.n}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ── Sankey ─────────────────────────────────────────────────────────── */

interface SankeyNode {
  id: string;
  label: string;
  y: number;
  h: number;
  color: string;
  n: number;
}

const SANKEY_H_MIN = 292;
const SANKEY_GAP = 12;
// Alto mínimo por nodo para que su etiqueta siga siendo legible.
const SANKEY_NODO_MIN = 20;
const SANKEY_W = 780;
const COL_X = { gestion: 190, competencia: 390, entregable: 560 };

/* El lienzo crece con la columna más poblada: con alto fijo, un período con
   muchos entregables comprimía los nodos hasta solaparse las etiquetas. */
function sankeyAlto(...columnas: number[]): number {
  const nodos = Math.max(1, ...columnas);
  return Math.max(SANKEY_H_MIN, nodos * SANKEY_NODO_MIN + (nodos - 1) * SANKEY_GAP);
}

function layoutColumn(
  entradas: { id: string; label: string; n: number; color: string }[],
  alto: number,
): SankeyNode[] {
  const total = entradas.reduce((n, e) => n + e.n, 0);
  if (total === 0 || entradas.length === 0) return [];
  const disponible = Math.max(20, alto - SANKEY_GAP * (entradas.length - 1));
  const unidad = disponible / total;
  let y = 0;
  return entradas.map((e) => {
    const h = Math.max(4, e.n * unidad);
    const node = { ...e, y, h };
    y += h + SANKEY_GAP;
    return node;
  });
}

function truncar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

function SankeyFlow({
  activities,
  competencias,
  entregables,
  gestiones,
}: {
  activities: Actividad[];
  competencias: Competencia[];
  entregables: Entregable[];
  gestiones: Gestion[];
}) {
  const modelo = useMemo(() => {
    const porGestion = new Map<string, number>();
    const porCompetencia = new Map<string, number>();
    const porEntregable = new Map<string, number>();
    // competencia → gestión y entregable → competencia (jerarquía de una sola vía)
    const compDeGestion = new Map<string, string>();
    const entDeCompetencia = new Map<string, string>();

    for (const act of activities) {
      const comp = competencias.find((c) => c.id === act.competenciaId);
      const gestionId = comp?.gestionId ?? SIN_GESTION;
      const compId = comp?.id ?? SIN_GESTION;
      const entId = act.entregableId ?? SIN_ENTREGABLE;
      porGestion.set(gestionId, (porGestion.get(gestionId) ?? 0) + 1);
      porCompetencia.set(compId, (porCompetencia.get(compId) ?? 0) + 1);
      porEntregable.set(entId, (porEntregable.get(entId) ?? 0) + 1);
      compDeGestion.set(compId, gestionId);
      entDeCompetencia.set(entId, compId);
    }

    const colorGestion = (id: string) => gestiones.find((g) => g.id === id)?.color ?? "#A5A5B3";

    // El orden por gestión evita que los flujos se crucen.
    const gestionIds = Array.from(porGestion.keys()).sort((a, b) => {
      const ia = gestiones.findIndex((g) => g.id === a);
      const ib = gestiones.findIndex((g) => g.id === b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

    const compIds = Array.from(porCompetencia.keys()).sort((a, b) => {
      const ga = gestionIds.indexOf(compDeGestion.get(a) ?? SIN_GESTION);
      const gb = gestionIds.indexOf(compDeGestion.get(b) ?? SIN_GESTION);
      return ga - gb || a.localeCompare(b);
    });

    const entIds = Array.from(porEntregable.keys()).sort((a, b) => {
      const ca = compIds.indexOf(entDeCompetencia.get(a) ?? "");
      const cb = compIds.indexOf(entDeCompetencia.get(b) ?? "");
      return ca - cb || a.localeCompare(b);
    });

    const alto = sankeyAlto(gestionIds.length, compIds.length, entIds.length);

    const nodosGestion = layoutColumn(
      gestionIds.map((id) => ({
        id,
        label: id === SIN_GESTION ? "Sin gestión" : gestionNombre(id, gestiones),
        n: porGestion.get(id) ?? 0,
        color: colorGestion(id),
      })),
      alto,
    );
    const nodosCompetencia = layoutColumn(
      compIds.map((id) => ({
        id,
        label:
          id === SIN_GESTION
            ? "Sin competencia"
            : competenciaCodigo(id, competencias),
        n: porCompetencia.get(id) ?? 0,
        color: "#6D28D9",
      })),
      alto,
    );
    const nodosEntregable = layoutColumn(
      entIds.map((id) => ({
        id,
        label:
          id === SIN_ENTREGABLE
            ? "Sin entregable"
            : entregables.find((e) => e.id === id)?.nombre ?? "Entregable",
        n: porEntregable.get(id) ?? 0,
        color: id === SIN_ENTREGABLE ? "#C4C4CE" : "#F59E0B",
      })),
      alto,
    );

    const buscar = (lista: SankeyNode[], id: string) => lista.find((n) => n.id === id);

    // Cada enlace nace en la porción del nodo origen que le corresponde.
    const usadoGestion = new Map<string, number>();
    const enlacesGC = compIds.map((compId) => {
      const gestionId = compDeGestion.get(compId) ?? SIN_GESTION;
      const origen = buscar(nodosGestion, gestionId);
      const destino = buscar(nodosCompetencia, compId);
      if (!origen || !destino) return null;
      const proporcion = (porCompetencia.get(compId) ?? 0) / (porGestion.get(gestionId) || 1);
      const alto = origen.h * proporcion;
      const usado = usadoGestion.get(gestionId) ?? 0;
      usadoGestion.set(gestionId, usado + alto);
      const y1 = origen.y + usado + alto / 2;
      const y2 = destino.y + destino.h / 2;
      return {
        id: `gc-${compId}`,
        d: `M${COL_X.gestion + 10},${y1} C290,${y1} 290,${y2} ${COL_X.competencia},${y2}`,
        color: origen.color,
        w: Math.max(1, destino.h),
      };
    });

    const usadoComp = new Map<string, number>();
    const enlacesCE = entIds.map((entId) => {
      const compId = entDeCompetencia.get(entId) ?? "";
      const origen = buscar(nodosCompetencia, compId);
      const destino = buscar(nodosEntregable, entId);
      if (!origen || !destino) return null;
      const proporcion = (porEntregable.get(entId) ?? 0) / (porCompetencia.get(compId) || 1);
      const alto = origen.h * proporcion;
      const usado = usadoComp.get(compId) ?? 0;
      usadoComp.set(compId, usado + alto);
      const y1 = origen.y + usado + alto / 2;
      const y2 = destino.y + destino.h / 2;
      return {
        id: `ce-${entId}`,
        d: `M${COL_X.competencia + 10},${y1} C480,${y1} 480,${y2} ${COL_X.entregable},${y2}`,
        color: "#6D28D9",
        w: Math.max(1, destino.h),
      };
    });

    return {
      total: activities.length,
      alto,
      nodosGestion,
      nodosCompetencia,
      nodosEntregable,
      enlaces: [...enlacesGC, ...enlacesCE].filter(Boolean) as {
        id: string;
        d: string;
        color: string;
        w: number;
      }[],
    };
  }, [activities, competencias, entregables, gestiones]);

  const rankingCompetencias = useMemo(() => {
    return competencias
      .map((c) => ({
        c,
        n: activities.filter((a) => a.competenciaId === c.id).length,
      }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
  }, [activities, competencias]);

  const vacio = modelo.total === 0;

  return (
    <Section
      title="Gestiones, competencias y entregables"
      subtitle="El grosor de cada flujo representa el número de actividades"
      right={
        !vacio && (
          <span className="inline-flex shrink-0 rounded-full bg-accent-soft px-[11px] py-1 text-[11.5px] font-bold text-accent">
            {modelo.total} actividades
          </span>
        )
      }
    >
      <div className="mt-3.5 flex justify-between text-[10px] font-[750] uppercase tracking-[.05em] text-ink-label">
        <span>Gestión responsable</span>
        <span>Competencia</span>
        <span>Entregable</span>
      </div>

      {vacio ? (
        <div className="mt-5">
          <EmptyBox icon="chart">{VACIO}</EmptyBox>
        </div>
      ) : (
        <div className="mt-1.5 overflow-x-auto">
          <svg
            viewBox={`0 0 ${SANKEY_W} ${modelo.alto}`}
            width="100%"
            height={modelo.alto}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Diagrama de gestiones, competencias y entregables"
            className="min-w-[620px]"
          >
            {modelo.enlaces.map((k) => (
              <path key={k.id} d={k.d} fill="none" stroke={k.color} strokeWidth={k.w} strokeOpacity=".26" />
            ))}
            {modelo.nodosGestion.map((n) => (
              <React.Fragment key={n.id}>
                <rect x={COL_X.gestion} y={n.y} width="10" height={n.h} rx="3" fill={n.color} />
                <text
                  x={COL_X.gestion - 10}
                  y={n.y + n.h / 2 + 3.5}
                  textAnchor="end"
                  fontSize="10.5"
                  fontWeight="650"
                  fill="#4B4B57"
                >
                  {truncar(n.label, 24)} · {n.n}
                </text>
              </React.Fragment>
            ))}
            {modelo.nodosCompetencia.map((n) => (
              <React.Fragment key={n.id}>
                <rect x={COL_X.competencia} y={n.y} width="10" height={n.h} rx="3" fill={n.color} />
                <text
                  x={COL_X.competencia + 5}
                  y={Math.max(8, n.y - 3)}
                  textAnchor="middle"
                  fontSize="9.5"
                  fontWeight="700"
                  fill="#6D28D9"
                >
                  {n.label}
                </text>
              </React.Fragment>
            ))}
            {modelo.nodosEntregable.map((n) => (
              <React.Fragment key={n.id}>
                <rect x={COL_X.entregable} y={n.y} width="10" height={n.h} rx="3" fill={n.color} />
                <text
                  x={COL_X.entregable + 18}
                  y={n.y + n.h / 2 + 3.5}
                  textAnchor="start"
                  fontSize="10.5"
                  fontWeight="650"
                  fill="#4B4B57"
                >
                  {truncar(n.label, 24)} · {n.n}
                </text>
              </React.Fragment>
            ))}
          </svg>
        </div>
      )}

      <div className="mt-3.5 border-t border-line-soft pt-3.5">
        <div className="text-[10px] font-[750] uppercase tracking-[.05em] text-ink-label">
          Competencias del Estatuto
        </div>
        {rankingCompetencias.length === 0 ? (
          <div className="mt-2.5 text-[11.5px] font-semibold text-ink-ghost">{VACIO}</div>
        ) : (
          <ol className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {rankingCompetencias.map(({ c, n }) => (
              <li
                key={c.id}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-[9px] rounded-btn bg-surface-subtle px-2.5 py-2"
              >
                <span className="rounded-md bg-accent-soft px-[7px] py-0.5 text-[10px] font-extrabold text-accent">
                  {competenciaCodigo(c.id, competencias)}
                </span>
                <span className="truncate text-[11.5px] font-[550] text-ink-soft" title={c.nombre}>
                  {c.nombre}
                </span>
                <span className="text-[12px] font-bold tabular-nums">{n}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Section>
  );
}

/* ── Ranking ────────────────────────────────────────────────────────── */

interface FuncionarioStat {
  f: Funcionario;
  total: number;
  cumplidas: number;
  vencidas: number;
  cumpl: number;
}

function barraColor(pctValue: number): string {
  if (pctValue >= 100) return "#10B981";
  if (pctValue >= 50) return "#F59E0B";
  return "#F43F5E";
}

function Ranking({
  filas,
  useAvatars,
}: {
  filas: FuncionarioStat[];
  useAvatars: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-section border border-line bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3.5 px-4 pb-3.5 pt-4 sm:px-5 sm:pt-5">
        <div>
          <h2 className="text-[16px] font-[750] tracking-[-.02em]">Cumplimiento por funcionario</h2>
          <div className="mt-[3px] text-[12px] font-medium text-ink-faint">
            Total asignadas, cumplidas y porcentaje de cumplimiento
          </div>
        </div>
        <span className="inline-flex rounded-full bg-estado-pendiente-bg px-[11px] py-1 text-[11.5px] font-bold text-ink-muted">
          {filas.length} {filas.length === 1 ? "funcionario" : "funcionarios"}
        </span>
      </div>

      {/* móvil */}
      <div className="space-y-2 px-4 pb-4 sm:hidden">
        {filas.length === 0 ? (
          <EmptyBox icon="users">Ningún funcionario tiene actividades en el período</EmptyBox>
        ) : (
          filas.map((row) => (
            <article key={row.f.id} className="rounded-card border border-line bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar funcionario={row.f} useAvatars={useAvatars} size={32} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-[650] leading-tight">{row.f.nombre}</div>
                    <div className="mt-0.5 text-[11px] text-ink-ghost">{row.f.cargo}</div>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-chip px-2 py-0.5 text-[11px] font-bold text-ink-soft">
                  {row.total}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2.5">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-estado-pendiente-bg">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, row.cumpl)}%`, background: barraColor(row.cumpl) }}
                  />
                </div>
                <span className="w-[34px] text-right text-[12px] font-bold tabular-nums">{row.cumpl}%</span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-[11.5px]">
                <div>
                  <dt className="text-ink-ghost">Cumplidas</dt>
                  <dd className="mt-0.5 font-bold tabular-nums text-ink-soft">{row.cumplidas}</dd>
                </div>
                <div>
                  <dt className="text-ink-ghost">Fin superado</dt>
                  <dd
                    className={cn(
                      "mt-0.5 font-bold tabular-nums",
                      row.vencidas > 0 ? "text-estado-vencida-fg" : "text-ink-disabled",
                    )}
                  >
                    {row.vencidas > 0 ? row.vencidas : "—"}
                  </dd>
                </div>
              </dl>
            </article>
          ))
        )}
      </div>

      {/* escritorio */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-y border-line-soft bg-surface-subtle">
              <th className="px-5 py-2.5 text-left text-[11px] font-bold tracking-[.02em] text-ink-faint">
                Funcionario
              </th>
              <th className="px-2.5 py-2.5 text-right text-[11px] font-bold text-ink-faint">Total</th>
              <th className="px-2.5 py-2.5 text-right text-[11px] font-bold text-ink-faint">Cumplidas</th>
              <th className="px-2.5 py-2.5 text-right text-[11px] font-bold text-ink-faint">Fin superado</th>
              <th className="w-[230px] px-5 py-2.5 text-left text-[11px] font-bold text-ink-faint">
                % Cumplimiento
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-[34px]">
                  <EmptyBox icon="users">Ningún funcionario tiene actividades en el período</EmptyBox>
                </td>
              </tr>
            ) : (
              filas.map((row) => (
                <tr key={row.f.id} className="border-b border-line-soft last:border-0 hover:bg-surface-subtle">
                  <td className="px-5 py-[11px]">
                    <div className="flex items-center gap-[11px]">
                      <Avatar funcionario={row.f} useAvatars={useAvatars} size={32} />
                      <div className="min-w-0">
                        <div className="truncate font-[650]">{row.f.nombre}</div>
                        <div className="truncate text-[11px] text-ink-ghost">{row.f.cargo}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2.5 py-[11px] text-right font-bold tabular-nums">{row.total}</td>
                  <td className="px-2.5 py-[11px] text-right tabular-nums text-ink-soft">{row.cumplidas}</td>
                  <td
                    className={cn(
                      "px-2.5 py-[11px] text-right font-bold tabular-nums",
                      row.vencidas > 0 ? "text-estado-vencida-fg" : "text-ink-disabled",
                    )}
                  >
                    {row.vencidas > 0 ? row.vencidas : "—"}
                  </td>
                  <td className="px-5 py-[11px]">
                    <div className="flex items-center gap-2.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-estado-pendiente-bg">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, row.cumpl)}%`,
                            background: barraColor(row.cumpl),
                          }}
                        />
                      </div>
                      <span className="w-[34px] text-right text-[12px] font-bold tabular-nums">
                        {row.cumpl}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── Vista ──────────────────────────────────────────────────────────── */

export function StatsView({
  activities,
  gestiones,
  funcionarios,
  responsables,
  competencias,
  entregables,
  useAvatars,
  dateRange,
  onOpenActivity,
}: {
  /* Ya acotadas al rango por la pantalla de Estadísticas. */
  activities: Actividad[];
  gestiones: Gestion[];
  funcionarios: Funcionario[];
  responsables: Funcionario[];
  competencias: Competencia[];
  entregables: Entregable[];
  useAvatars: boolean;
  dateRange: DateRange;
  onOpenActivity: (activityId: string) => void;
}) {
  const kpis = useMemo(() => {
    const cuenta = (estado: EstadoActividad) => activities.filter((a) => a.estado === estado).length;
    let vencidas = 0;
    let pronto = 0;
    for (const a of activities) {
      const fecha = fechaFinInfo(a, TODAY_ISO);
      if (fecha.kind === "ended") vencidas++;
      if (fecha.kind === "soon" || fecha.kind === "today") pronto++;
    }
    const total = activities.length;
    return {
      total,
      asignaciones: activities.filter((a) => a.tipo === "asignacion").length,
      reuniones: activities.filter((a) => a.tipo === "reunion").length,
      progreso: cuenta("en_progreso"),
      revision: cuenta("en_revision"),
      cumplidas: cuenta("cumplida"),
      vencidas,
      pronto,
    };
  }, [activities]);

  const ranking = useMemo<FuncionarioStat[]>(
    () =>
      funcionarios
        .map((f) => {
          const mias = activities.filter((a) => actividadIncludesFuncionario(a, f.id));
          const cumplidas = mias.filter((a) => a.estado === "cumplida").length;
          const vencidas = mias.filter(
            (a) => a.estado !== "cumplida" && daysBetween(TODAY_ISO, a.fechaFin) < 0,
          ).length;
          return { f, total: mias.length, cumplidas, vencidas, cumpl: pct(cumplidas, mias.length) };
        })
        // Oculta a quien no tiene actividades en el período.
        .filter((row) => row.total > 0)
        .sort((a, b) => b.total - a.total || a.f.nombre.localeCompare(b.f.nombre)),
    [activities, funcionarios],
  );

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 xl:gap-[14px]">
        <Kpi
          icon="inbox"
          iconColor="#8A8A99"
          label="Totales"
          value={kpis.total}
          sub={`${kpis.asignaciones} asignaciones · ${kpis.reuniones} reuniones`}
        />
        <Kpi
          icon="zap"
          iconColor="#3B82F6"
          label="En progreso"
          value={kpis.progreso}
          valueColor="#1D4ED8"
          sub={`${kpis.revision} en revisión`}
        />
        <Kpi
          icon="checkCircle"
          iconColor="#10B981"
          label="Cumplidas"
          value={kpis.cumplidas}
          valueColor="#0B7A5A"
          sub={`${pct(kpis.cumplidas, kpis.total)}% del total`}
        />
        <Kpi
          icon="alert"
          iconColor="#F43F5E"
          label="Fin superado"
          value={kpis.vencidas}
          valueColor="#C81E45"
          sub={`${pct(kpis.vencidas, kpis.total)}% del total`}
        />
        <Kpi
          icon="flame"
          iconColor="#F59E0B"
          label="Finalizan pronto"
          value={kpis.pronto}
          valueColor="#B45309"
          sub="≤ 3 días"
        />
      </div>

      <GanttChart
        activities={activities}
        funcionarios={responsables}
        competencias={competencias}
        gestiones={gestiones}
        range={dateRange}
        onOpenActivity={onOpenActivity}
      />

      <div className="grid grid-cols-1 items-start gap-[14px] xl:grid-cols-[1fr_2fr]">
        <Donut activities={activities} />
        <SankeyFlow
          activities={activities}
          competencias={competencias}
          entregables={entregables}
          gestiones={gestiones}
        />
      </div>

      <Ranking filas={ranking} useAvatars={useAvatars} />
    </div>
  );
}
