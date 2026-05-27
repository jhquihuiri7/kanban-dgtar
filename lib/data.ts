export const ZONE_TZ = "Pacific/Galapagos";

export type EstadoActividad =
  | "pendiente"
  | "en_progreso"
  | "en_revision"
  | "cumplida"
  | "archivada";

export const UNIDADES = [
  "DGTAR",
  "Gestión Territorial",
  "Gestión y Saneamiento Ambiental",
  "Gestión de Riesgos",
] as const;

export type Unidad = (typeof UNIDADES)[number];

export interface Funcionario {
  id: string;
  nombre: string;
  email: string;
  cargo: string;
  unidad: Unidad;
  color: string;
}

export interface Competencia {
  id: string;
  nombre: string;
  unidad: Unidad;
}

export interface Actividad {
  id: string;
  titulo: string;
  descripcion: string;
  funcionarioId: string;
  competenciaId: string;
  estado: EstadoActividad;
  fechaCreacion: string;
  plazoDias: number;
  fechaVencimiento: string;
  fechaCumplimiento: string | null;
  observaciones: string;
  orden: number;
}

export interface EstadoDef {
  id: Exclude<EstadoActividad, "archivada">;
  label: string;
  accent: "slate" | "blue" | "amber" | "green";
}

function todayIsoForZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dateFromIso(isoStr: string): Date {
  const [year, month, day] = isoStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export const TODAY_ISO = todayIsoForZone(ZONE_TZ);

export function addDays(d: Date | string, n: number): Date {
  const r = typeof d === "string" ? dateFromIso(d) : new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
export function iso(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const ESTADOS: EstadoDef[] = [
  { id: "pendiente", label: "Pendiente", accent: "slate" },
  { id: "en_progreso", label: "En progreso", accent: "blue" },
  { id: "en_revision", label: "En revisión", accent: "amber" },
  { id: "cumplida", label: "Cumplida", accent: "green" },
];

export function daysBetween(a: string, b: string): number {
  const ms = dateFromIso(b).getTime() - dateFromIso(a).getTime();
  return Math.round(ms / 86400000);
}

export function fmtFecha(isoStr: string | null): string {
  if (!isoStr) return "—";
  const d = dateFromIso(isoStr);
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", timeZone: ZONE_TZ });
}
export function fmtFechaLarga(isoStr: string | null): string {
  if (!isoStr) return "—";
  const d = dateFromIso(isoStr);
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "long", year: "numeric", timeZone: ZONE_TZ });
}

export function initials(nombre: string): string {
  return nombre
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function unidadTone(u: string | undefined): BadgeVariant {
  return (
    ({
      DGTAR: "slate",
      "Gestión Territorial": "blue",
      "Gestión y Saneamiento Ambiental": "green",
      "Gestión de Riesgos": "amber",
    } as Record<string, BadgeVariant>)[u ?? ""] || "slate"
  );
}

export type BadgeVariant =
  | "default"
  | "outline"
  | "green"
  | "amber"
  | "red"
  | "blue"
  | "violet"
  | "slate"
  | "teal";

export type PlazoTone = "green" | "amber" | "red" | "slate";
export type PlazoKind = "ok" | "late" | "overdue" | "today" | "soon" | "normal";

export interface PlazoInfo {
  kind: PlazoKind;
  text: string;
  tone: PlazoTone;
  days?: number;
}

// Colores de plazo:
//  - Verde: cumplida en plazo
//  - Amber: vence en 3 días o menos
//  - Red: vencida o cumplida fuera de plazo
//  - Slate: plazo normal
export function plazoInfo(act: Actividad, today: string): PlazoInfo {
  if (act.estado === "cumplida") {
    const dCum = daysBetween(act.fechaCumplimiento ?? today, act.fechaVencimiento);
    if (dCum >= 0) return { kind: "ok", text: "Cumplida en plazo", tone: "green" };
    return { kind: "late", text: `Cumplida +${-dCum}d`, tone: "red" };
  }
  const dRest = daysBetween(today, act.fechaVencimiento);
  if (dRest < 0) return { kind: "overdue", text: `Vencida ${-dRest}d`, tone: "red", days: dRest };
  if (dRest === 0) return { kind: "today", text: "Vence hoy", tone: "amber", days: 0 };
  if (dRest <= 3) return { kind: "soon", text: `${dRest}d restantes`, tone: "amber", days: dRest };
  return { kind: "normal", text: `${dRest}d restantes`, tone: "slate", days: dRest };
}
