"use client";

import * as React from "react";
import { useMemo } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { Avatar, Badge, Card, CardContent, CardHeader, CardTitle, Icon, type IconName } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  ESTADOS,
  TODAY_ISO,
  actividadIncludesFuncionario,
  daysBetween,
  plazoInfo,
  type Actividad,
  type Competencia,
  type Funcionario,
} from "@/lib/data";

interface FuncionarioStat {
  f: Funcionario;
  total: number;
  cumplidas: number;
  enPlazo: number;
  fueraPlazo: number;
  vencidas: number;
  vigentes: number;
  cumpl: number;
  puntualidad: number | null;
  diasPromAtraso: number;
}

function computeStats(
  activities: Actividad[],
  funcionarios: Funcionario[],
  competencias: Competencia[],
) {
  const today = TODAY_ISO;
  const totals = {
    total: activities.length,
    pendiente: 0,
    en_progreso: 0,
    en_revision: 0,
    cumplida: 0,
    vencidas: 0,
    proxVencer: 0,
  } as Record<string, number>;
  for (const a of activities) {
    totals[a.estado]++;
    const p = plazoInfo(a, today);
    if (p.kind === "overdue") totals.vencidas++;
    if (p.kind === "soon" || p.kind === "today") totals.proxVencer++;
  }

  const porFuncionario: FuncionarioStat[] = funcionarios
    .map((f) => {
      const mine = activities.filter((a) => actividadIncludesFuncionario(a, f.id));
      const total = mine.length;
      const cumplidas = mine.filter((a) => a.estado === "cumplida");
      const enPlazo = cumplidas.filter(
        (a) => daysBetween(a.fechaCumplimiento ?? today, a.fechaVencimiento) >= 0,
      ).length;
      const fueraPlazo = cumplidas.length - enPlazo;
      const vencidas = mine.filter(
        (a) => a.estado !== "cumplida" && daysBetween(today, a.fechaVencimiento) < 0,
      ).length;
      const vigentes = mine.filter(
        (a) => a.estado !== "cumplida" && daysBetween(today, a.fechaVencimiento) >= 0,
      ).length;
      const cumpl = total ? Math.round((cumplidas.length / total) * 100) : 0;
      const puntualidad = cumplidas.length
        ? Math.round((enPlazo / cumplidas.length) * 100)
        : null;
      const atrasos = mine.filter((a) => {
        if (a.estado === "cumplida")
          return daysBetween(a.fechaCumplimiento ?? today, a.fechaVencimiento) < 0;
        return daysBetween(today, a.fechaVencimiento) < 0;
      });
      const diasPromAtraso = atrasos.length
        ? Math.round(
            atrasos.reduce((s, a) => {
              const ref = a.fechaCumplimiento || today;
              return s + Math.max(0, -daysBetween(ref, a.fechaVencimiento));
            }, 0) / atrasos.length,
          )
        : 0;

      return { f, total, cumplidas: cumplidas.length, enPlazo, fueraPlazo, vencidas, vigentes, cumpl, puntualidad, diasPromAtraso };
    })
    .sort((a, b) => b.total - a.total);

  const porCompetencia = competencias
    .map((c) => ({ c, total: activities.filter((a) => a.competenciaId === c.id).length }))
    .sort((a, b) => b.total - a.total);

  return { totals, porFuncionario, porCompetencia };
}

const tooltipStyle: React.CSSProperties = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  background: "#fff",
  boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
};

function Kpi({
  icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: IconName;
  tone: "slate" | "blue" | "green" | "red" | "amber";
  label: string;
  value: number;
  sub?: string;
}) {
  const ring = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-700",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
  };
  return (
    <Card>
      <div className="flex items-start justify-between p-4">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
          {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
        </div>
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", ring[tone])}>
          <Icon name={icon} size={18} />
        </div>
      </div>
    </Card>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const tone = pct >= 75 ? "bg-green-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full", tone)} style={{ width: pct + "%" }} />
      </div>
      <span className="w-10 text-right text-xs font-medium tabular-nums text-slate-700">{pct}%</span>
    </div>
  );
}

export function StatsView({
  activities,
  funcionarios,
  competencias,
  useAvatars,
}: {
  activities: Actividad[];
  funcionarios: Funcionario[];
  competencias: Competencia[];
  useAvatars: boolean;
}) {
  const s = useMemo(
    () => computeStats(activities, funcionarios, competencias),
    [activities, funcionarios, competencias],
  );

  const estadoData = ESTADOS.map((e) => ({
    name: e.label,
    value: s.totals[e.id] || 0,
    color: { slate: "#94a3b8", blue: "#2563eb", amber: "#f59e0b", green: "#22c55e" }[e.accent],
  }));

  const compData = s.porCompetencia.filter((x) => x.total > 0).slice(0, 6).map((x) => ({
    id: x.c.id,
    name: x.c.nombre,
    full: x.c.nombre,
    total: x.total,
  }));
  const maxCompetenciaTotal = Math.max(...compData.map((x) => x.total), 1);

  const buckets = [
    { name: "Vencidas", value: activities.filter((a) => a.estado !== "cumplida" && daysBetween(TODAY_ISO, a.fechaVencimiento) < 0).length, color: "#ef4444" },
    { name: "Vence hoy", value: activities.filter((a) => a.estado !== "cumplida" && daysBetween(TODAY_ISO, a.fechaVencimiento) === 0).length, color: "#f97316" },
    { name: "1–3 días", value: activities.filter((a) => { const d = daysBetween(TODAY_ISO, a.fechaVencimiento); return a.estado !== "cumplida" && d >= 1 && d <= 3; }).length, color: "#f59e0b" },
    { name: "4–7 días", value: activities.filter((a) => { const d = daysBetween(TODAY_ISO, a.fechaVencimiento); return a.estado !== "cumplida" && d >= 4 && d <= 7; }).length, color: "#eab308" },
    { name: "8+ días", value: activities.filter((a) => { const d = daysBetween(TODAY_ISO, a.fechaVencimiento); return a.estado !== "cumplida" && d >= 8; }).length, color: "#22c55e" },
  ];

  const cumplidasEnPlazo = activities.filter(
    (a) => a.estado === "cumplida" && daysBetween(a.fechaCumplimiento ?? TODAY_ISO, a.fechaVencimiento) >= 0,
  ).length;
  const enPlazoPct = s.totals.cumplida ? Math.round((cumplidasEnPlazo / s.totals.cumplida) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi icon="inbox" tone="slate" label="Actividades totales" value={s.totals.total} />
        <Kpi icon="zap" tone="blue" label="En progreso" value={s.totals.en_progreso} sub={`${s.totals.en_revision} en revisión`} />
        <Kpi icon="checkCircle" tone="green" label="Cumplidas" value={s.totals.cumplida} sub={`${enPlazoPct}% en plazo`} />
        <Kpi icon="alert" tone="red" label="Vencidas" value={s.totals.vencidas} />
        <Kpi icon="flame" tone="amber" label="Próximas a vencer" value={s.totals.proxVencer} sub="≤ 3 días" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Estado donut */}
        <Card>
          <CardHeader className="flex items-center justify-between !pb-0">
            <CardTitle>Distribución por estado</CardTitle>
            <Icon name="chart" size={14} className="text-slate-400" />
          </CardHeader>
          <CardContent>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={estadoData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
                    {estadoData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-1.5 text-xs">
              {estadoData.map((d, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                    {d.name}
                  </span>
                  <span className="font-medium text-slate-700">{d.value}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Plazos */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between !pb-0">
            <CardTitle>Carga de plazos · actividades abiertas</CardTitle>
            <span className="text-xs text-slate-500">{buckets.reduce((a, b) => a + b.value, 0)} pendientes</span>
          </CardHeader>
          <CardContent>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={buckets} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {buckets.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ranking de funcionarios */}
      <Card>
        <CardHeader className="flex items-center justify-between !pb-2">
          <div>
            <CardTitle>Cumplimiento por funcionario</CardTitle>
            <div className="mt-0.5 text-xs text-slate-500">Total asignadas, cumplidas, puntualidad y atraso promedio</div>
          </div>
          <Badge variant="outline">{funcionarios.length} funcionarios</Badge>
        </CardHeader>
        <CardContent className="!px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-2 text-left font-medium">Funcionario</th>
                  <th className="px-2 py-2 text-right font-medium">Total</th>
                  <th className="px-2 py-2 text-right font-medium">Cumplidas</th>
                  <th className="px-2 py-2 text-right font-medium">Vencidas</th>
                  <th className="px-4 py-2 text-left font-medium">% Cumplimiento</th>
                  <th className="px-2 py-2 text-right font-medium">Puntualidad</th>
                  <th className="px-2 py-2 text-right font-medium">Atraso prom.</th>
                </tr>
              </thead>
              <tbody>
                {s.porFuncionario.map((row) => (
                  <tr key={row.f.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar funcionario={row.f} useAvatars={useAvatars} size={28} />
                        <div>
                          <div className="font-medium text-slate-900 leading-tight">{row.f.nombre}</div>
                          <div className="text-[11px] text-slate-500">{row.f.cargo}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right font-medium tabular-nums text-slate-800">{row.total}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-700">{row.cumplidas}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {row.vencidas > 0 ? (
                        <span className="font-medium text-red-600">{row.vencidas}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <ProgressBar pct={row.cumpl} />
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {row.puntualidad == null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span
                          className={cn(
                            "font-medium",
                            row.puntualidad >= 80
                              ? "text-green-700"
                              : row.puntualidad >= 50
                                ? "text-amber-700"
                                : "text-red-700",
                          )}
                        >
                          {row.puntualidad}%
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {row.diasPromAtraso > 0 ? (
                        <span className="text-red-600">+{row.diasPromAtraso}d</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Competencias */}
      <Card>
        <CardHeader className="!pb-0">
          <CardTitle>Competencias con más actividades</CardTitle>
        </CardHeader>
        <CardContent>
          {compData.length > 0 ? (
            <div className="space-y-3 pt-1">
              {compData.map((item) => {
                const pct = Math.max(4, Math.round((item.total / maxCompetenciaTotal) * 100));
                return (
                  <div
                    key={item.id}
                    className="grid gap-2 sm:grid-cols-[minmax(180px,320px)_minmax(0,1fr)] sm:items-center"
                  >
                    <div
                      className="line-clamp-2 text-xs font-medium leading-snug text-slate-800"
                      title={item.full}
                    >
                      {item.name}
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="h-6 flex-1 overflow-hidden rounded-md bg-slate-100">
                        <div
                          className="h-full rounded-md bg-violet-600"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700">
                        {item.total}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-slate-400">Sin actividades registradas</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
