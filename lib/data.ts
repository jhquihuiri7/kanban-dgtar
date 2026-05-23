// Demo data — Dirección de Planificación y Gestión Ambiental
// Plan Galápagos / Consejo de Gobierno Régimen Especial Galápagos
// All names/activities are illustrative.

export const ZONE_TZ = "Pacific/Galapagos";

export type EstadoActividad =
  | "pendiente"
  | "en_progreso"
  | "en_revision"
  | "cumplida"
  | "archivada";

export type Unidad = "PMA" | "RGDP" | "PG" | "GEO" | "DIR";

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

export const FUNCIONARIOS: Funcionario[] = [
  { id: "u1", nombre: "María Cevallos", email: "mcevallos@cgreg.gob.ec", cargo: "Analista Ambiental", unidad: "PMA", color: "#0ea5e9" },
  { id: "u2", nombre: "Andrés Toro", email: "atoro@cgreg.gob.ec", cargo: "Especialista RGDP", unidad: "RGDP", color: "#22c55e" },
  { id: "u3", nombre: "Lucía Naranjo", email: "lnaranjo@cgreg.gob.ec", cargo: "Coordinadora PG", unidad: "PG", color: "#8b5cf6" },
  { id: "u4", nombre: "Diego Salas", email: "dsalas@cgreg.gob.ec", cargo: "Técnico Geoportal", unidad: "GEO", color: "#14b8a6" },
  { id: "u5", nombre: "Paola Endara", email: "pendara@cgreg.gob.ec", cargo: "Analista Jurídico", unidad: "PG", color: "#a855f7" },
  { id: "u6", nombre: "Jorge Yépez", email: "jyepez@cgreg.gob.ec", cargo: "Inspector PMA", unidad: "PMA", color: "#16a34a" },
  { id: "u7", nombre: "Camila Robalino", email: "crobalino@cgreg.gob.ec", cargo: "Especialista RGDP", unidad: "RGDP", color: "#2563eb" },
  { id: "u8", nombre: "Iván Mosquera", email: "imosquera@cgreg.gob.ec", cargo: "Director de Área", unidad: "DIR", color: "#475569" },
];

export const COMPETENCIAS: Competencia[] = [
  { id: "c1", nombre: "Plan Galápagos 2030", unidad: "PG" },
  { id: "c2", nombre: "Permisos Ambientales", unidad: "PMA" },
  { id: "c3", nombre: "Residuos Sólidos y Peligrosos", unidad: "RGDP" },
  { id: "c4", nombre: "Geoportal y Cartografía", unidad: "GEO" },
  { id: "c5", nombre: "Régimen Especial Galápagos", unidad: "PG" },
  { id: "c6", nombre: "Inspecciones y Control", unidad: "PMA" },
  { id: "c7", nombre: "Calidad de Agua y Vertidos", unidad: "RGDP" },
  { id: "c8", nombre: "Áreas Protegidas", unidad: "PG" },
];

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

// Build demo dates relative to the current Galapagos date.
const TODAY = dateFromIso(TODAY_ISO);

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

interface RawActividad {
  titulo: string;
  descripcion: string;
  funcionario: string;
  competencia: string;
  estado: EstadoActividad;
  creada: number;
  plazo: number;
  cumplida?: number;
}

const RAW_ACTIVITIES: RawActividad[] = [
  // PENDIENTE
  { titulo: "Revisar borrador del Plan Operativo Anual 2026 — Eje Biodiversidad", descripcion: "Validar metas, indicadores y línea base. Coordinar con la Dirección de Áreas Protegidas y devolver observaciones consolidadas.", funcionario: "u3", competencia: "c1", estado: "pendiente", creada: -2, plazo: 10 },
  { titulo: "Consolidar matriz de riesgos — temporada El Niño", descripcion: "Insumos del INAMHI y reportes municipales de Santa Cruz, San Cristóbal e Isabela.", funcionario: "u2", competencia: "c5", estado: "pendiente", creada: -1, plazo: 7 },
  { titulo: "Inspección en planta de tratamiento Puerto Ayora", descripcion: "Verificar cumplimiento de parámetros DBO5 y coliformes según TULSMA.", funcionario: "u6", competencia: "c7", estado: "pendiente", creada: -3, plazo: 5 },
  { titulo: "Catastro de generadores de residuos peligrosos — San Cristóbal", descripcion: "Actualizar 28 registros e incorporar nuevos generadores identificados por la EMA-SC.", funcionario: "u7", competencia: "c3", estado: "pendiente", creada: 0, plazo: 14 },
  { titulo: "Capas SIG para zonificación turística Isabela", descripcion: "Cargar nuevas geometrías al Geoportal y publicar capa con metadatos completos.", funcionario: "u4", competencia: "c4", estado: "pendiente", creada: -4, plazo: 12 },

  // EN PROGRESO
  { titulo: "Resolución administrativa — Licencia ambiental Hotel Pikaia", descripcion: "Revisión técnica del estudio de impacto, observaciones a la sección de manejo de residuos.", funcionario: "u5", competencia: "c2", estado: "en_progreso", creada: -8, plazo: 15 },
  { titulo: "Informe trimestral de denuncias ambientales", descripcion: "Sistematizar 47 denuncias del cuatrimestre y clasificar por unidad responsable.", funcionario: "u1", competencia: "c6", estado: "en_progreso", creada: -5, plazo: 7 },
  { titulo: "Mesa técnica con Parque Nacional Galápagos", descripcion: "Coordinar agenda 2026 sobre especies invasoras y control en zona agropecuaria.", funcionario: "u3", competencia: "c8", estado: "en_progreso", creada: -10, plazo: 12 },
  { titulo: "Auditoría a permisos de extracción de material pétreo", descripcion: "Cruce con registro de canteras activas y inspección de 3 sitios en Santa Cruz.", funcionario: "u6", competencia: "c2", estado: "en_progreso", creada: -6, plazo: 9 },
  { titulo: "Migrar capa de manglares al nuevo servidor del Geoportal", descripcion: "Validar geometrías y proyección EPSG:32715.", funcionario: "u4", competencia: "c4", estado: "en_progreso", creada: -12, plazo: 20 },

  // EN REVISIÓN
  { titulo: "Reglamento interno — Régimen Especial, capítulo IV", descripcion: "Pendiente firma del Director y observaciones de la Procuraduría.", funcionario: "u5", competencia: "c5", estado: "en_revision", creada: -14, plazo: 18 },
  { titulo: "Estadísticas de cumplimiento PMA — Q1 2026", descripcion: "Revisión por la Dirección antes del envío al Consejo de Gobierno.", funcionario: "u1", competencia: "c6", estado: "en_revision", creada: -9, plazo: 12 },
  { titulo: "Protocolo de respuesta a derrames de hidrocarburos", descripcion: "Revisión cruzada con la DIRNEA y capitanías de puerto.", funcionario: "u2", competencia: "c7", estado: "en_revision", creada: -7, plazo: 9 },

  // CUMPLIDA
  { titulo: "Publicar Geoportal v2.4 — capas de zonas de riesgo", descripcion: "Liberar versión y notificar a usuarios institucionales.", funcionario: "u4", competencia: "c4", estado: "cumplida", creada: -18, plazo: 14, cumplida: -5 },
  { titulo: "Capacitación a inspectores ambientales — módulo TULSMA", descripcion: "30 inspectores capacitados, evaluación final aprobada.", funcionario: "u6", competencia: "c6", estado: "cumplida", creada: -22, plazo: 12, cumplida: -9 },
  { titulo: "Cierre administrativo de expedientes 2024", descripcion: "180 expedientes cerrados y archivados según norma.", funcionario: "u1", competencia: "c2", estado: "cumplida", creada: -25, plazo: 15, cumplida: -8 },
  { titulo: "Informe de gestión 2025 — eje Plan Galápagos", descripcion: "Enviado al Consejo de Gobierno y publicado en portal de transparencia.", funcionario: "u3", competencia: "c1", estado: "cumplida", creada: -30, plazo: 20, cumplida: -6 },
  // cumplida fuera de plazo
  { titulo: "Actualizar registro de generadores eléctricos diésel", descripcion: "Cumplida con 4 días de atraso por demora en respuesta de ELECGALÁPAGOS.", funcionario: "u7", competencia: "c3", estado: "cumplida", creada: -28, plazo: 15, cumplida: -9 },
  { titulo: "Mapa preliminar de zonas de amortiguamiento", descripcion: "Cumplida fuera de plazo (3 días). Pendiente revisión cartográfica menor.", funcionario: "u4", competencia: "c8", estado: "cumplida", creada: -20, plazo: 10, cumplida: -7 },
];

export function buildActivities(): Actividad[] {
  return RAW_ACTIVITIES.map((a, i) => {
    const fc = addDays(TODAY, a.creada);
    const fv = addDays(fc, a.plazo);
    const fcum = a.cumplida != null ? addDays(TODAY, a.cumplida) : null;
    return {
      id: "a" + (i + 1).toString().padStart(3, "0"),
      titulo: a.titulo,
      descripcion: a.descripcion,
      funcionarioId: a.funcionario,
      competenciaId: a.competencia,
      estado: a.estado,
      fechaCreacion: iso(fc),
      plazoDias: a.plazo,
      fechaVencimiento: iso(fv),
      fechaCumplimiento: fcum ? iso(fcum) : null,
      observaciones: "",
      orden: i,
    };
  });
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
    ({ PG: "violet", PMA: "green", RGDP: "blue", GEO: "teal", DIR: "slate" } as Record<string, BadgeVariant>)[
      u ?? ""
    ] || "slate"
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
