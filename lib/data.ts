export const ZONE_TZ = "Pacific/Galapagos";

export type EstadoActividad =
  | "pendiente"
  | "en_progreso"
  | "en_revision"
  | "cumplida"
  | "archivada";

export type TipoActividad = "asignacion" | "reunion";

export const TIPOS: { id: TipoActividad; label: string }[] = [
  { id: "asignacion", label: "Asignación" },
  { id: "reunion", label: "Reunión" },
];

export interface Gestion {
  id: string;
  nombre: string;
  color: string;
}

export interface Entregable {
  id: string;
  nombre: string;
  gestionId: string;
}

export interface Funcionario {
  id: string;
  nombre: string;
  email: string;
  cargo: string;
  gestionId: string;
  color: string;
}

export interface Competencia {
  id: string;
  nombre: string;
  gestionId: string;
}

export interface Actividad {
  id: string;
  tipo: TipoActividad;
  titulo: string;
  descripcion: string;
  funcionarioId: string;
  participantesIds: string[];
  competenciaId: string;
  entregableId: string | null;
  estado: EstadoActividad;
  fechaCreacion: string;
  fechaInicio: string;
  fechaFin: string;
  fechaCumplimiento: string | null;
  observaciones: string;
  accionesPendientes: string;
  resultadosAlcanzados: string;
  orden: number;
}

export interface EstadoDef {
  id: Exclude<EstadoActividad, "archivada">;
  label: string;
  accent: "slate" | "blue" | "amber" | "green";
}

export function todayIsoForZone(timeZone: string): string {
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
  // Tolerates an optional "THH:mm" suffix (used by reuniones) — solo la parte
  // de fecha define el día para comparaciones de calendario.
  const [datePart] = isoStr.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/* ── Fecha + hora (reuniones) ───────────────────────────────────────────
   En reuniones, fechaInicio y fechaFin contienen el mismo
   "YYYY-MM-DDTHH:mm". Estas funciones separan la hora para mostrarla y
   editarla sin afectar las comparaciones por día. */

export function dateOnly(isoStr: string | null): string {
  return isoStr ? isoStr.split("T")[0] : "";
}
export function fmtHora(isoStr: string | null): string {
  if (!isoStr) return "";
  const t = isoStr.split("T")[1];
  return t ? t.slice(0, 5) : "";
}
export function withHora(fechaIso: string, hora: string): string {
  return `${dateOnly(fechaIso)}T${hora}`;
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

export function actividadFuncionarioIds(
  act: Pick<Actividad, "funcionarioId" | "participantesIds">,
): string[] {
  return Array.from(new Set([act.funcionarioId, ...(act.participantesIds ?? [])].filter(Boolean)));
}

export function actividadIncludesFuncionario(
  act: Pick<Actividad, "funcionarioId" | "participantesIds">,
  funcionarioId: string | null | undefined,
): boolean {
  if (!funcionarioId) return false;
  return actividadFuncionarioIds(act).includes(funcionarioId);
}

// Las gestiones son un catálogo dinámico (el admin las crea/borra), así que
// el tono de Badge (solo 8 variantes fijas, ver components/ui.tsx) se asigna
// por posición estable dentro de la lista en vez de por nombre hardcodeado.
const GESTION_TONE_PALETTE: BadgeVariant[] = ["slate", "blue", "green", "amber", "violet", "teal", "red"];

export function gestionTone(gestionId: string | undefined, gestiones: Gestion[]): BadgeVariant {
  if (!gestionId) return "slate";
  const index = gestiones.findIndex((g) => g.id === gestionId);
  if (index < 0) return "slate";
  return GESTION_TONE_PALETTE[index % GESTION_TONE_PALETTE.length];
}

export function gestionNombre(gestionId: string | undefined, gestiones: Gestion[]): string {
  return gestiones.find((g) => g.id === gestionId)?.nombre ?? "—";
}

// Las competencias no guardan código en la base (se eliminó la columna); el
// "C1" del rediseño es su posición dentro de la gestión a la que pertenecen.
export function competenciaCodigo(
  competenciaId: string | undefined,
  competencias: Competencia[],
): string {
  const comp = competencias.find((c) => c.id === competenciaId);
  if (!comp) return "—";
  const index = competencias.filter((c) => c.gestionId === comp.gestionId).findIndex((c) => c.id === comp.id);
  return `C${index + 1}`;
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

export type FechaTone = "green" | "amber" | "red" | "slate";
export type FechaKind = "ok" | "ended" | "today" | "soon" | "normal";

export interface FechaInfo {
  kind: FechaKind;
  text: string;
  tone: FechaTone;
  days?: number;
}

// Estado visual respecto de la fecha de fin:
//  - Verde: completada, sin monitorear retrasos una vez cerrada
//  - Amber: finaliza hoy o en los próximos 3 días
//  - Rojo: fecha de fin superada mientras sigue abierta
//  - Slate: fecha de fin a más de 3 días
export function fechaFinInfo(act: Actividad, today: string): FechaInfo {
  if (act.estado === "cumplida") {
    return { kind: "ok", text: "Cumplida", tone: "green" };
  }
  const dRest = daysBetween(today, act.fechaFin);
  if (dRest < 0) return { kind: "ended", text: `Fin superado ${-dRest}d`, tone: "red", days: dRest };
  if (dRest === 0) return { kind: "today", text: "Finaliza hoy", tone: "amber", days: 0 };
  if (dRest <= 3) return { kind: "soon", text: `Finaliza en ${dRest}d`, tone: "amber", days: dRest };
  return { kind: "normal", text: `Finaliza en ${dRest}d`, tone: "slate", days: dRest };
}
