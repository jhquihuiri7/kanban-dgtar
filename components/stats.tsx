"use client";

import * as React from "react";
import { useMemo } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Sankey,
  Tooltip,
} from "recharts";
import { Avatar, Badge, Card, CardContent, CardHeader, CardTitle, Icon, type IconName } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  ESTADOS,
  TODAY_ISO,
  actividadFuncionarioIds,
  actividadIncludesFuncionario,
  addDays,
  daysBetween,
  fechaFinInfo,
  fmtFecha,
  fmtHora,
  gestionNombre,
  iso,
  type Actividad,
  type Competencia,
  type Entregable,
  type FechaInfo,
  type Funcionario,
  type Gestion,
} from "@/lib/data";

interface FuncionarioStat {
  f: Funcionario;
  total: number;
  cumplidas: number;
  fechaFinSuperada: number;
  cumpl: number;
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
    fechaFinSuperada: 0,
    proximasFinalizar: 0,
  } as Record<string, number>;
  for (const a of activities) {
    totals[a.estado]++;
    const fecha = fechaFinInfo(a, today);
    if (fecha.kind === "ended") totals.fechaFinSuperada++;
    if (fecha.kind === "soon" || fecha.kind === "today") totals.proximasFinalizar++;
  }

  const porFuncionario: FuncionarioStat[] = funcionarios
    .map((f) => {
      const mine = activities.filter((a) => actividadIncludesFuncionario(a, f.id));
      const total = mine.length;
      const cumplidas = mine.filter((a) => a.estado === "cumplida");
      const fechaFinSuperada = mine.filter(
        (a) => a.estado !== "cumplida" && daysBetween(today, a.fechaFin) < 0,
      ).length;
      const cumpl = total ? Math.round((cumplidas.length / total) * 100) : 0;

      return {
        f,
        total,
        cumplidas: cumplidas.length,
        fechaFinSuperada,
        cumpl,
      };
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

const COMPETENCIA_COLOR = "#7c3aed";
const ENTREGABLE_COLOR = "#f59e0b";
const SIN_ENTREGABLE_COLOR = "#94a3b8";
const SIN_GESTION_COLOR = "#64748b";
const SIN_ENTREGABLE_ID = "__sin_entregable__";
const SIN_ENTREGABLE_NOMBRE = "Sin entregable";

interface SankeyNodeDatum {
  name: string;
  shortName: string;
  kind: "gestion" | "competencia" | "entregable";
  color: string;
}

interface SankeyLinkDatum {
  source: number;
  target: number;
  value: number;
  color: string;
}

interface SankeyLegendItem {
  id: string;
  code: string;
  name: string;
  total: number;
}

interface SankeyGestionItem {
  gestionId: string;
  name: string;
  shortName: string;
  color: string;
  total: number;
}

interface ManagementCompetenceSankeyData {
  nodes: SankeyNodeDatum[];
  links: SankeyLinkDatum[];
  competencias: SankeyLegendItem[];
  entregables: SankeyLegendItem[];
  gestiones: SankeyGestionItem[];
  total: number;
}

// Gestión → Competencia → Entregable. El color de cada tramo se hereda de la
// gestión de origen (vía competencia.gestionId) en los dos saltos, para poder
// seguir de un vistazo a qué gestión pertenece un entregable. Las actividades
// sin entregable asignado (hoy, las de DGTAR) se agrupan en un nodo "Sin
// entregable" en vez de perderse silenciosamente.
function buildManagementCompetenceSankey(
  activities: Actividad[],
  funcionarios: Funcionario[],
  competencias: Competencia[],
  entregables: Entregable[],
  gestiones: Gestion[],
): ManagementCompetenceSankeyData {
  const funcionarioById = new Map(funcionarios.map((f) => [f.id, f]));
  const competenciaById = new Map(competencias.map((c) => [c.id, c]));
  const entregableById = new Map(entregables.map((e) => [e.id, e]));
  const gestionById = new Map(gestiones.map((g) => [g.id, g]));
  const linksByGestion = new Map<string, Map<string, number>>();
  const gestionTotals = new Map<string, number>();
  const competenciaTotals = new Map<string, number>();
  const linksByCompetencia = new Map<string, Map<string, number>>();
  const entregableTotals = new Map<string, number>();
  let total = 0;

  for (const activity of activities) {
    const funcionario = funcionarioById.get(activity.funcionarioId);
    const competencia = competenciaById.get(activity.competenciaId);
    if (!funcionario || !competencia) continue;

    const gestionId = funcionario.gestionId;
    const gestionLinks = linksByGestion.get(gestionId) ?? new Map<string, number>();
    gestionLinks.set(competencia.id, (gestionLinks.get(competencia.id) ?? 0) + 1);
    linksByGestion.set(gestionId, gestionLinks);
    gestionTotals.set(gestionId, (gestionTotals.get(gestionId) ?? 0) + 1);
    competenciaTotals.set(competencia.id, (competenciaTotals.get(competencia.id) ?? 0) + 1);

    const entregableKey =
      activity.entregableId && entregableById.has(activity.entregableId) ? activity.entregableId : SIN_ENTREGABLE_ID;
    const competenciaLinks = linksByCompetencia.get(competencia.id) ?? new Map<string, number>();
    competenciaLinks.set(entregableKey, (competenciaLinks.get(entregableKey) ?? 0) + 1);
    linksByCompetencia.set(competencia.id, competenciaLinks);
    entregableTotals.set(entregableKey, (entregableTotals.get(entregableKey) ?? 0) + 1);

    total++;
  }

  const gestionOrder = new Map(gestiones.map((g, index) => [g.id, index]));
  const gestionStats: SankeyGestionItem[] = Array.from(gestionTotals, ([gestionId, count]) => {
    const g = gestionById.get(gestionId);
    const name = g?.nombre ?? "Sin gestión";
    return { gestionId, name, shortName: name, color: g?.color || SIN_GESTION_COLOR, total: count };
  }).sort((a, b) => {
    const orderA = gestionOrder.get(a.gestionId) ?? Number.MAX_SAFE_INTEGER;
    const orderB = gestionOrder.get(b.gestionId) ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB || a.name.localeCompare(b.name, "es");
  });

  const activeCompetencias = competencias
    .map((competencia) => ({
      id: competencia.id,
      name: competencia.nombre,
      total: competenciaTotals.get(competencia.id) ?? 0,
    }))
    .filter((competencia) => competencia.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "es"));
  const competenciaLegend = activeCompetencias.map((competencia, index) => ({
    ...competencia,
    code: `C${index + 1}`,
  }));
  // Color de cada competencia = color de su propia gestión, para que el
  // segundo salto (competencia → entregable) siga heredando ese color.
  const competenciaColor = new Map(
    competencias.map((c) => [c.id, gestionById.get(c.gestionId)?.color || SIN_GESTION_COLOR]),
  );

  const hasSinEntregable = (entregableTotals.get(SIN_ENTREGABLE_ID) ?? 0) > 0;
  const activeEntregables = entregables
    .map((entregable) => ({
      id: entregable.id,
      name: entregable.nombre,
      total: entregableTotals.get(entregable.id) ?? 0,
    }))
    .filter((entregable) => entregable.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "es"));
  const entregableLegend = activeEntregables.map((entregable, index) => ({
    ...entregable,
    code: `E${index + 1}`,
  }));
  const sinEntregableLegend = hasSinEntregable
    ? [{ id: SIN_ENTREGABLE_ID, name: SIN_ENTREGABLE_NOMBRE, total: entregableTotals.get(SIN_ENTREGABLE_ID) ?? 0, code: "—" }]
    : [];

  const nodes: SankeyNodeDatum[] = [
    ...gestionStats.map((gestion) => ({
      name: gestion.name,
      shortName: gestion.shortName,
      kind: "gestion" as const,
      color: gestion.color,
    })),
    ...competenciaLegend.map((competencia) => ({
      name: competencia.name,
      shortName: competencia.code,
      kind: "competencia" as const,
      color: COMPETENCIA_COLOR,
    })),
    ...entregableLegend.map((entregable) => ({
      name: entregable.name,
      shortName: entregable.code,
      kind: "entregable" as const,
      color: ENTREGABLE_COLOR,
    })),
    ...(hasSinEntregable
      ? [{ name: SIN_ENTREGABLE_NOMBRE, shortName: SIN_ENTREGABLE_NOMBRE, kind: "entregable" as const, color: SIN_ENTREGABLE_COLOR }]
      : []),
  ];

  const gestionIndex = new Map(gestionStats.map((gestion, index) => [gestion.gestionId, index]));
  const competenciaIndex = new Map(
    competenciaLegend.map((competencia, index) => [competencia.id, gestionStats.length + index]),
  );
  const entregableBase = gestionStats.length + competenciaLegend.length;
  const entregableIndex = new Map(entregableLegend.map((entregable, index) => [entregable.id, entregableBase + index]));
  const sinEntregableIndex = hasSinEntregable ? entregableBase + entregableLegend.length : null;

  const links: SankeyLinkDatum[] = [];
  for (const gestion of gestionStats) {
    const source = gestionIndex.get(gestion.gestionId);
    if (source == null) continue;
    for (const competencia of competenciaLegend) {
      const value = linksByGestion.get(gestion.gestionId)?.get(competencia.id) ?? 0;
      const target = competenciaIndex.get(competencia.id);
      if (value > 0 && target != null) {
        links.push({ source, target, value, color: gestion.color });
      }
    }
  }
  for (const competencia of competenciaLegend) {
    const source = competenciaIndex.get(competencia.id);
    const compLinks = linksByCompetencia.get(competencia.id);
    if (source == null || !compLinks) continue;
    const color = competenciaColor.get(competencia.id) || COMPETENCIA_COLOR;
    for (const entregable of entregableLegend) {
      const value = compLinks.get(entregable.id) ?? 0;
      const target = entregableIndex.get(entregable.id);
      if (value > 0 && target != null) links.push({ source, target, value, color });
    }
    const sinEntregableValue = compLinks.get(SIN_ENTREGABLE_ID) ?? 0;
    if (sinEntregableValue > 0 && sinEntregableIndex != null) {
      links.push({ source, target: sinEntregableIndex, value: sinEntregableValue, color });
    }
  }

  return {
    nodes,
    links,
    competencias: competenciaLegend,
    entregables: [...entregableLegend, ...sinEntregableLegend],
    gestiones: gestionStats,
    total,
  };
}

interface SankeyNodeRenderProps {
  x: number;
  y: number;
  width: number;
  height: number;
  payload: SankeyNodeDatum & { value: number };
}

// Gestión (izquierda) y Entregable (derecha) tienen espacio libre a su lado
// para la etiqueta. Competencia quedó en la columna del medio: con hasta 8
// nodos angostos apretados, cualquier etiqueta ahí choca con la vecina, así
// que Competencia no dibuja texto en el diagrama — el código (C#) solo vive
// en la leyenda de abajo, y el nombre completo aparece al pasar el mouse
// (title nativo + tooltip de Recharts en los flujos).
function SankeyNode({ x, y, width, height, payload }: SankeyNodeRenderProps) {
  const h = Math.max(height, 1);
  const rect = <rect x={x} y={y} width={width} height={h} rx={2} fill={payload.color} />;
  const title = (
    <title>{`${payload.name}: ${payload.value} ${payload.value === 1 ? "actividad" : "actividades"}`}</title>
  );
  if (payload.kind === "competencia") {
    return (
      <g>
        {title}
        {rect}
      </g>
    );
  }
  const isGestion = payload.kind === "gestion";
  const labelX = isGestion ? x - 6 : x + width + 6;
  return (
    <g>
      {title}
      {rect}
      <text
        x={labelX}
        y={y + h / 2}
        dy="0.35em"
        textAnchor={isGestion ? "end" : "start"}
        fill="#475569"
        fontSize={10}
        fontWeight={600}
      >
        {payload.shortName}
      </text>
    </g>
  );
}

interface SankeyLinkRenderProps {
  sourceX: number;
  sourceY: number;
  sourceControlX: number;
  targetX: number;
  targetY: number;
  targetControlX: number;
  linkWidth: number;
  payload: SankeyLinkDatum & {
    source: SankeyNodeDatum;
    target: SankeyNodeDatum;
  };
}

function SankeyLink({
  sourceX,
  sourceY,
  sourceControlX,
  targetX,
  targetY,
  targetControlX,
  linkWidth,
  payload,
}: SankeyLinkRenderProps) {
  const path = `M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;
  return (
    <path
      d={path}
      fill="none"
      stroke={payload.color}
      strokeWidth={Math.max(linkWidth, 1)}
      strokeOpacity={0.3}
      className="transition-opacity hover:opacity-80"
    >
      <title>{`${payload.source.name} → ${payload.target.name}: ${payload.value} ${payload.value === 1 ? "actividad" : "actividades"}`}</title>
    </path>
  );
}

function SankeyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string }>;
}) {
  const item = payload?.[0];
  if (!active || !item) return null;
  const value = Number(item.value ?? 0);
  return (
    <div className="max-w-[min(260px,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-lg">
      <div className="break-words font-medium leading-snug text-slate-800">
        {item.name?.replace(" - ", " → ")}
      </div>
      <div className="mt-1 font-semibold tabular-nums text-violet-700">
        {value} {value === 1 ? "actividad" : "actividades"}
      </div>
    </div>
  );
}

function CompetenceLegendList({
  title,
  items,
  badgeClassName,
}: {
  title: string;
  items: SankeyLegendItem[];
  badgeClassName: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      <ol className="grid gap-2 md:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded-lg bg-slate-50 p-2"
          >
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", badgeClassName)}>{item.code}</span>
            <span className="line-clamp-2 break-words text-[11px] leading-snug text-slate-600" title={item.name}>
              {item.name}
            </span>
            <span
              className="text-xs font-semibold tabular-nums text-slate-700"
              aria-label={`${item.total} ${item.total === 1 ? "actividad" : "actividades"}`}
            >
              {item.total}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ManagementCompetenceSankey({ data }: { data: ManagementCompetenceSankeyData }) {
  const chartHeight = Math.max(280, Math.max(data.competencias.length, data.entregables.length) * 34 + 24);
  return (
    <>
      <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <span>Gestión responsable</span>
        <span>Competencia</span>
        <span>Entregable</span>
      </div>
      <div className="w-full" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <Sankey
            data={{ nodes: data.nodes, links: data.links }}
            nameKey="name"
            dataKey="value"
            nodeWidth={10}
            nodePadding={10}
            linkCurvature={0.5}
            margin={{ top: 8, right: 34, bottom: 8, left: 72 }}
            node={SankeyNode}
            link={SankeyLink}
            aria-label="Diagrama de Sankey de gestiones responsables, competencias y entregables"
          >
            <Tooltip content={<SankeyTooltip />} />
          </Sankey>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-600">
          {data.gestiones.map((gestion) => (
            <span key={gestion.name} className="inline-flex items-center gap-1.5" title={gestion.name}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: gestion.color }} />
              <span>{gestion.shortName}</span>
              <span className="font-semibold tabular-nums text-slate-700">{gestion.total}</span>
            </span>
          ))}
        </div>
        <CompetenceLegendList
          title="Competencias"
          items={data.competencias}
          badgeClassName="bg-violet-100 text-violet-700"
        />
        <CompetenceLegendList
          title="Entregables"
          items={data.entregables}
          badgeClassName="bg-amber-100 text-amber-700"
        />
      </div>
    </>
  );
}

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
      <div className="flex items-start justify-between gap-2 p-3 sm:p-4">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
          {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
        </div>
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", ring[tone])}>
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

const GANTT_GROUP_ROW_HEIGHT = 44;
const GANTT_TASK_ROW_HEIGHT = 42;
const TODAY_COLUMN_STYLE: React.CSSProperties = {
  backgroundImage: "repeating-linear-gradient(135deg, rgba(14, 165, 233, 0.18) 0 6px, rgba(14, 165, 233, 0.04) 6px 12px)",
};

interface GanttRawRow {
  activity: Actividad;
  funcionario?: Funcionario;
  funcionarioKey: string;
  funcionarioName: string;
  funcionarioCargo?: string;
  gestion: string;
  start: number;
  end: number;
  duration: number;
  fecha: FechaInfo;
  barLeftPct: number;
  barWidthPct: number;
}

interface GanttGestionRow {
  kind: "gestion";
  key: string;
  label: string;
  count: number;
  collapsed: boolean;
  height: number;
}

interface GanttPrimaryRow {
  kind: "primary";
  key: string;
  label: string;
  meta?: string;
  count: number;
  collapsed: boolean;
  height: number;
}

type GanttActivityRow = GanttRawRow & {
  kind: "activity";
  key: string;
  height: number;
};

type GanttRow = GanttGestionRow | GanttPrimaryRow | GanttActivityRow;
type PositionedGanttRow = GanttRow & { top: number };

function monthLabel(isoStr: string): string {
  const [year, month, day] = isoStr.split("-").map(Number);
  const label = new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString("es-EC", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1).replace(".", "");
}

function dayLabel(isoStr: string): string {
  return String(Number(isoStr.slice(8, 10)));
}

function ganttStatusClass(estado: Actividad["estado"]): string {
  const map: Record<Actividad["estado"], string> = {
    pendiente:
      "bg-slate-400 text-white ring-slate-300 hover:bg-slate-500 focus-visible:ring-slate-500",
    en_progreso:
      "bg-blue-500 text-white ring-blue-300 hover:bg-blue-600 focus-visible:ring-blue-500",
    en_revision:
      "bg-amber-500 text-white ring-amber-300 hover:bg-amber-600 focus-visible:ring-amber-500",
    cumplida:
      "bg-green-500 text-white ring-green-300 hover:bg-green-600 focus-visible:ring-green-500",
    archivada:
      "bg-slate-200 text-slate-600 ring-slate-200 hover:bg-slate-300 focus-visible:ring-slate-400",
  };
  return map[estado];
}

function GanttChart({
  activities,
  funcionarios,
  gestiones,
  dateRange,
  onOpenActivity,
}: {
  activities: Actividad[];
  funcionarios: Funcionario[];
  gestiones: Gestion[];
  dateRange: { from: string; to: string };
  onOpenActivity: (activityId: string) => void;
}) {
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(() => new Set());
  const funcionarioById = useMemo(() => new Map(funcionarios.map((f) => [f.id, f])), [funcionarios]);
  const visibleActivities = useMemo(
    () => activities.filter((a) => a.estado !== "archivada"),
    [activities],
  );
  const toggleGroup = (key: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const rangeStartOffset = daysBetween(TODAY_ISO, dateRange.from);
  const rangeEndOffset = daysBetween(TODAY_ISO, dateRange.to);
  const gestionOrder = new Map(gestiones.map((g, index) => [g.nombre, index]));
  const rawRows = visibleActivities.flatMap((activity) => {
    const involvedFuncionarios = actividadFuncionarioIds(activity)
      .map((funcionarioId) => funcionarioById.get(funcionarioId))
      .filter((funcionario): funcionario is Funcionario => Boolean(funcionario));
    const rowFuncionarios: Array<Funcionario | undefined> =
      involvedFuncionarios.length > 0 ? involvedFuncionarios : [undefined];
    const activityStart = daysBetween(TODAY_ISO, activity.fechaInicio);
    const activityEnd = daysBetween(TODAY_ISO, activity.fechaFin);
    const start = Math.max(activityStart, rangeStartOffset);
    const end = Math.min(activityEnd, rangeEndOffset);
    const duration = activityEnd - activityStart + 1;

    return rowFuncionarios.map((funcionario) => ({
      activity,
      funcionario,
      funcionarioKey: funcionario?.id ?? "sin-funcionario",
      funcionarioName: funcionario?.nombre ?? "Sin funcionario asignado",
      funcionarioCargo: funcionario?.cargo,
      gestion: funcionario ? gestionNombre(funcionario.gestionId, gestiones) : "Sin gestión asignada",
      start,
      end,
      duration,
      fecha: fechaFinInfo(activity, TODAY_ISO),
    }));
  }).sort((a, b) => {
    const gestionA = gestionOrder.get(a.gestion) ?? Number.MAX_SAFE_INTEGER;
    const gestionB = gestionOrder.get(b.gestion) ?? Number.MAX_SAFE_INTEGER;
    return (
      gestionA - gestionB ||
      a.gestion.localeCompare(b.gestion, "es") ||
      a.funcionarioName.localeCompare(b.funcionarioName, "es") ||
      a.activity.fechaInicio.localeCompare(b.activity.fechaInicio) ||
      a.activity.fechaFin.localeCompare(b.activity.fechaFin)
    );
  });

  const minOffset = rangeStartOffset;
  const maxOffset = rangeEndOffset;
  const dayCount = maxOffset - minOffset + 1;
  const days = Array.from({ length: dayCount }, (_, index) => minOffset + index);
  const startDate = iso(addDays(TODAY_ISO, minOffset));
  const endDate = iso(addDays(TODAY_ISO, maxOffset));
  const monthRange =
    monthLabel(startDate) === monthLabel(endDate)
      ? monthLabel(startDate)
      : `${monthLabel(startDate)} - ${monthLabel(endDate)}`;
  const rows = rawRows.map((row) => {
    const visibleDuration = row.end - row.start + 1;
    const barLeftPct = ((row.start - minOffset) / dayCount) * 100;
    const barWidthPct = (visibleDuration / dayCount) * 100;
    return { ...row, barLeftPct, barWidthPct };
  });
  const gestionCounts = new Map<string, number>();
  const primaryCounts = new Map<string, number>();
  for (const row of rows) {
    gestionCounts.set(row.gestion, (gestionCounts.get(row.gestion) ?? 0) + 1);
    const primaryCountKey = `${row.gestion}::${row.funcionarioKey}`;
    primaryCounts.set(primaryCountKey, (primaryCounts.get(primaryCountKey) ?? 0) + 1);
  }
  const groupedRows: GanttRow[] = [];
  let currentGestion = "";
  let currentPrimaryKey = "";
  for (const row of rows) {
    if (row.gestion !== currentGestion) {
      currentGestion = row.gestion;
      currentPrimaryKey = "";
      const gestionKey = `gestion-${row.gestion}`;
      groupedRows.push({
        kind: "gestion" as const,
        key: gestionKey,
        label: row.gestion,
        count: gestionCounts.get(row.gestion) ?? 0,
        collapsed: collapsedGroups.has(gestionKey),
        height: GANTT_GROUP_ROW_HEIGHT,
      });
    }
    const primaryGroupKey = `${row.gestion}::${row.funcionarioKey}`;
    if (primaryGroupKey !== currentPrimaryKey) {
      currentPrimaryKey = primaryGroupKey;
      const primaryKey = `primary-${primaryGroupKey}`;
      groupedRows.push({
        kind: "primary" as const,
        key: primaryKey,
        label: row.funcionarioName,
        meta: row.funcionarioCargo,
        count: primaryCounts.get(primaryGroupKey) ?? 0,
        collapsed: collapsedGroups.has(primaryKey),
        height: GANTT_TASK_ROW_HEIGHT,
      });
    }
    groupedRows.push({
      ...row,
      kind: "activity" as const,
      key: `activity-${row.funcionarioKey}-${row.activity.id}`,
      height: GANTT_TASK_ROW_HEIGHT,
    });
  }
  const visibleGroupedRows: GanttRow[] = [];
  let gestionCollapsed = false;
  let primaryCollapsed = false;
  for (const row of groupedRows) {
    if (row.kind === "gestion") {
      visibleGroupedRows.push(row);
      gestionCollapsed = row.collapsed;
      primaryCollapsed = false;
      continue;
    }
    if (gestionCollapsed) continue;
    if (row.kind === "primary") {
      visibleGroupedRows.push(row);
      primaryCollapsed = row.collapsed;
      continue;
    }
    if (!primaryCollapsed) {
      visibleGroupedRows.push(row);
    }
  }
  let rowTop = 0;
  const visibleRows = visibleGroupedRows.map((row) => {
    const positionedRow = { ...row, top: rowTop };
    rowTop += row.height;
    return positionedRow;
  });
  const activityRows = visibleRows.filter((row) => row.kind === "activity");
  const bodyHeight = visibleRows.length > 0 ? rowTop : GANTT_GROUP_ROW_HEIGHT + GANTT_TASK_ROW_HEIGHT;
  const todayColumnLeftPct = ((0 - minOffset) / dayCount) * 100;
  const todayColumnWidthPct = 100 / dayCount;
  const todayVisible = minOffset <= 0 && maxOffset >= 0;

  return (
    <section className="relative z-0 isolate w-full rounded-xl bg-slate-100/80 p-2 ring-1 ring-slate-200 sm:p-3">
      <div className="mb-3 flex items-center justify-between gap-2 sm:relative sm:block sm:text-center">
        <h2 className="min-w-0 text-base font-semibold text-slate-900">Diagrama de Gantt</h2>
        <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600 sm:absolute sm:right-0 sm:top-0">
          {visibleActivities.length} actividades
        </span>
      </div>

      <div className="space-y-2 sm:hidden">
        {visibleRows.length > 0 ? (
          visibleRows.map((row) => {
            if (row.kind === "gestion") {
              return (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => toggleGroup(row.key)}
                  className="flex w-full items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-700 ring-1 ring-slate-200"
                  aria-expanded={!row.collapsed}
                >
                  <Icon name="arrow" size={13} className={cn("shrink-0 transition-transform", !row.collapsed && "rotate-90")} />
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  <span className="shrink-0 text-[10px] font-semibold normal-case tracking-normal text-slate-500">
                    {row.count} act.
                  </span>
                </button>
              );
            }
            if (row.kind === "primary") {
              return (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => toggleGroup(row.key)}
                  className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs font-semibold text-slate-600"
                  aria-expanded={!row.collapsed}
                >
                  <Icon name="arrow" size={12} className={cn("shrink-0 transition-transform", !row.collapsed && "rotate-90")} />
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  <span className="shrink-0 text-[10px] font-medium text-slate-400">{row.count} act.</span>
                </button>
              );
            }
            return (
              <article key={row.key} className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 break-words text-sm font-semibold leading-snug text-slate-900">
                    {row.activity.titulo}
                  </h3>
                  <Badge variant={row.fecha.tone} className="shrink-0">
                    {row.fecha.text}
                  </Badge>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="min-w-0">
                    <dt className="text-[10px] uppercase tracking-wide text-slate-400">Inicio</dt>
                    <dd className="mt-0.5 truncate font-medium text-slate-700">
                      {fmtFecha(row.activity.fechaInicio)}
                      {fmtHora(row.activity.fechaInicio) ? ` · ${fmtHora(row.activity.fechaInicio)}` : ""}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] uppercase tracking-wide text-slate-400">Fin</dt>
                    <dd className="mt-0.5 truncate font-medium text-slate-700">
                      {fmtFecha(row.activity.fechaFin)}
                      {fmtHora(row.activity.fechaFin) ? ` · ${fmtHora(row.activity.fechaFin)}` : ""}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[10px] uppercase tracking-wide text-slate-400">Duración</dt>
                    <dd className="mt-0.5 font-medium tabular-nums text-slate-700">{row.duration} días</dd>
                  </div>
                </dl>
              </article>
            );
          })
        ) : (
          <div className="rounded-lg bg-white px-3 py-8 text-center text-sm text-slate-400 ring-1 ring-slate-200">
            Sin actividades para mostrar
          </div>
        )}
      </div>

      <div className="hidden sm:block">
        <div className="flex min-w-full gap-3">
          <div className="w-[220px] shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 md:w-[280px]">
            <div className="flex h-16 items-center border-b border-slate-200 text-sm font-semibold text-slate-800">
              <div className="px-5">Gestión / funcionario</div>
            </div>

            <div
              className="divide-y divide-slate-200"
              style={{ height: bodyHeight }}
            >
              {visibleRows.length > 0 ? (
                visibleRows.map((row) => {
                  if (row.kind === "gestion") {
                    return (
                      <button
                        key={row.key}
                        type="button"
                        onClick={() => toggleGroup(row.key)}
                        className="flex w-full items-center bg-slate-100 text-left text-sm font-semibold text-slate-800 hover:bg-slate-200/60"
                        style={{ height: row.height }}
                        aria-expanded={!row.collapsed}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2 px-5">
                          <Icon name="arrow" size={14} className={cn("shrink-0 text-slate-600 transition-transform", !row.collapsed && "rotate-90")} />
                          <span className="truncate" title={row.label}>{row.label}</span>
                        </div>
                      </button>
                    );
                  }
                  if (row.kind === "primary") {
                    return (
                      <button
                        key={row.key}
                        type="button"
                        onClick={() => toggleGroup(row.key)}
                        className="flex w-full items-center bg-slate-50 text-left text-sm text-slate-700 hover:bg-slate-100"
                        style={{ height: row.height }}
                        aria-expanded={!row.collapsed}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2 px-5 pl-8">
                          <Icon name="arrow" size={13} className={cn("shrink-0 text-slate-500 transition-transform", !row.collapsed && "rotate-90")} />
                          <div className="min-w-0">
                            <div className="truncate font-medium" title={row.label}>{row.label}</div>
                            {row.meta && <div className="truncate text-[11px] text-slate-400" title={row.meta}>{row.meta}</div>}
                          </div>
                        </div>
                      </button>
                    );
                  }
                  return (
                    <div
                      key={row.key}
                      className="bg-white"
                      style={{ height: row.height }}
                    />
                  );
                })
              ) : (
                <div
                  className="flex items-center justify-center bg-white text-sm text-slate-400"
                  style={{ height: bodyHeight }}
                >
                  Sin actividades para mostrar
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
            <div className="flex h-8 items-center justify-center border-b border-slate-200 text-sm font-semibold text-slate-800">
              {monthRange}
            </div>
            <div
              className="grid h-12 border-b border-slate-200 text-[10px] font-semibold text-slate-800"
              style={{ gridTemplateColumns: `repeat(${dayCount}, minmax(0, 1fr))` }}
            >
              {days.map((offset) => {
                const dayIso = iso(addDays(TODAY_ISO, offset));
                const isToday = offset === 0;
                return (
                  <div
                    key={offset}
                    className={cn(
                      "flex min-w-0 items-center justify-center overflow-hidden border-l border-slate-200 first:border-l-0",
                      isToday && "bg-sky-100 font-bold text-sky-800 ring-1 ring-inset ring-sky-300",
                    )}
                    title={isToday ? "Fecha actual" : undefined}
                  >
                    {dayLabel(dayIso)}
                  </div>
                );
              })}
            </div>

            <div
              className="relative overflow-hidden bg-white"
              style={{ height: bodyHeight }}
            >
              <div
                className="absolute inset-y-0 left-0 grid"
                style={{ width: "100%", gridTemplateColumns: `repeat(${dayCount}, minmax(0, 1fr))` }}
              >
                {days.map((offset) => (
                  <div key={offset} className="border-l border-slate-200 first:border-l-0" />
                ))}
              </div>
              {todayVisible && (
                <div
                  className="pointer-events-none absolute inset-y-0 z-[1] border-x border-sky-300/70"
                  style={{
                    ...TODAY_COLUMN_STYLE,
                    left: `${todayColumnLeftPct}%`,
                    width: `${todayColumnWidthPct}%`,
                  }}
                  title="Fecha actual"
                />
              )}
              <div className="absolute inset-x-0 top-0 border-t border-slate-200" />
              {visibleRows.map((row) =>
                row.kind === "activity" ? null : (
                  <div
                    key={`${row.key}-bg`}
                    className={cn(
                      "absolute inset-x-0",
                      row.kind === "gestion" ? "bg-slate-100/70" : "bg-slate-50/70",
                    )}
                    style={{ top: row.top, height: row.height }}
                  />
                ),
              )}
              {visibleRows.map((row) => (
                <div
                  key={`${row.key}-line`}
                  className="absolute inset-x-0 border-t border-slate-200"
                  style={{ top: row.top }}
                />
              ))}

              {activityRows.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => onOpenActivity(row.activity.id)}
                  className={cn(
                    "absolute z-[3] flex h-7 items-center justify-center rounded-full px-1.5 text-xs font-semibold shadow-sm ring-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 md:px-4 md:text-sm",
                    ganttStatusClass(row.activity.estado),
                  )}
                  style={{
                    left: `${row.barLeftPct}%`,
                    top: row.top + 7,
                    width: `${row.barWidthPct}%`,
                  }}
                  title={`${row.activity.titulo} · ${fmtFecha(row.activity.fechaInicio)} – ${fmtFecha(row.activity.fechaFin)}`}
                  aria-label={`Ver detalle de ${row.activity.titulo}`}
                >
                  <span className="truncate">{row.activity.titulo}</span>
                </button>
              ))}

              {visibleRows.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                  Sin actividades para mostrar
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

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
  activities: Actividad[];
  gestiones: Gestion[];
  funcionarios: Funcionario[];
  responsables: Funcionario[];
  competencias: Competencia[];
  entregables: Entregable[];
  useAvatars: boolean;
  dateRange: { from: string; to: string };
  onOpenActivity: (activityId: string) => void;
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

  const sankeyData = useMemo(
    () => buildManagementCompetenceSankey(activities, responsables, competencias, entregables, gestiones),
    [activities, responsables, competencias, entregables, gestiones],
  );

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
        <Kpi icon="inbox" tone="slate" label="Actividades totales" value={s.totals.total} />
        <Kpi icon="zap" tone="blue" label="En progreso" value={s.totals.en_progreso} sub={`${s.totals.en_revision} en revisión`} />
        <Kpi icon="checkCircle" tone="green" label="Cumplidas" value={s.totals.cumplida} />
        <Kpi icon="alert" tone="red" label="Fecha fin superada" value={s.totals.fechaFinSuperada} />
        <Kpi icon="flame" tone="amber" label="Finalizan pronto" value={s.totals.proximasFinalizar} sub="≤ 3 días" />
      </div>

      <GanttChart
        activities={activities}
        funcionarios={funcionarios}
        gestiones={gestiones}
        dateRange={dateRange}
        onOpenActivity={onOpenActivity}
      />

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[1fr_2fr]">
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

        <Card>
          <CardHeader className="!pb-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>Gestiones y competencias</CardTitle>
                <div className="mt-0.5 text-xs text-slate-500">
                  El grosor de cada flujo representa el número de actividades
                </div>
              </div>
              {sankeyData.total > 0 && <Badge variant="violet">{sankeyData.total} actividades</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            {sankeyData.links.length > 0 ? (
              <ManagementCompetenceSankey data={sankeyData} />
            ) : (
              <div className="py-12 text-center text-sm text-slate-400">
                Sin relaciones entre gestiones y competencias
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ranking de funcionarios */}
      <Card>
        <CardHeader className="flex flex-col items-start gap-2 !pb-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Cumplimiento por funcionario</CardTitle>
            <div className="mt-0.5 text-xs text-slate-500">Total asignadas, cumplidas y porcentaje de cumplimiento</div>
          </div>
          <Badge variant="outline">{funcionarios.length} funcionarios</Badge>
        </CardHeader>
        <CardContent className="!px-0">
          <div className="space-y-2 px-3 pb-3 sm:hidden">
            {s.porFuncionario.length > 0 ? (
              s.porFuncionario.map((row) => (
                <article key={row.f.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar funcionario={row.f} useAvatars={useAvatars} size={32} />
                      <div className="min-w-0">
                        <div className="break-words text-sm font-medium leading-tight text-slate-900">{row.f.nombre}</div>
                        <div className="mt-0.5 break-words text-[11px] text-slate-500">{row.f.cargo}</div>
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0">{row.total} total</Badge>
                  </div>

                  <div className="mt-3">
                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">Cumplimiento</div>
                    <ProgressBar pct={row.cumpl} />
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div>
                      <dt className="text-slate-400">Cumplidas</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-slate-800">{row.cumplidas}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Fecha fin superada</dt>
                      <dd className={cn("mt-0.5 font-semibold tabular-nums", row.fechaFinSuperada > 0 ? "text-red-600" : "text-slate-400")}>
                        {row.fechaFinSuperada > 0 ? row.fechaFinSuperada : "—"}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))
            ) : (
              <div className="py-8 text-center text-sm text-slate-400">Sin funcionarios registrados</div>
            )}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-2 text-left font-medium">Funcionario</th>
                  <th className="px-2 py-2 text-right font-medium">Total</th>
                  <th className="px-2 py-2 text-right font-medium">Cumplidas</th>
                  <th className="px-2 py-2 text-right font-medium">Fecha fin superada</th>
                  <th className="px-4 py-2 text-left font-medium">% Cumplimiento</th>
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
                      {row.fechaFinSuperada > 0 ? (
                        <span className="font-medium text-red-600">{row.fechaFinSuperada}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <ProgressBar pct={row.cumpl} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
