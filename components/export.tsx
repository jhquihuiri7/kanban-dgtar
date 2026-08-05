"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Icon, Input, Label } from "@/components/ui";
import {
  ESTADOS,
  TIPOS,
  TODAY_ISO,
  dateOnly,
  fmtHora,
  type Actividad,
  type Competencia,
  type Entregable,
  type Funcionario,
  type Gestion,
} from "@/lib/data";

// Columnas del CSV (todos los campos). El orden aquí define el orden en el
// archivo. Las asignaciones usan fechas sin hora; las reuniones conservan el
// mismo instante en inicio y fin.
const COLUMNS = [
  "ID",
  "Tipo",
  "Título",
  "Descripción",
  "Funcionario",
  "Gestión funcionario",
  "Competencia",
  "Gestión competencia",
  "Entregable",
  "Estado",
  "Fecha creación",
  "Fecha inicio",
  "Hora inicio",
  "Fecha fin",
  "Hora fin",
  "Fecha cumplimiento",
  "Observaciones",
  "Acciones pendientes y actividades programadas",
  "Resultados alcanzados",
] as const;

const tipoLabel = (id: string) => TIPOS.find((t) => t.id === id)?.label ?? id;
const estadoLabel = (id: string) => ESTADOS.find((e) => e.id === id)?.label ?? id;

// Fechas en el CSV: día/mes/año. Recibe "YYYY-MM-DD" (o vacío) y devuelve
// "DD/MM/YYYY" sin construir Date para evitar desfases de zona horaria.
function fechaDMA(isoDate: string): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  return y && m && d ? `${d}/${m}/${y}` : isoDate;
}

// El estado interno sigue siendo ISO ("YYYY-MM-DD"); estas funciones convierten
// hacia/desde el texto "DD/MM/YYYY" que se muestra al usuario.
function isoToDma(iso: string): string {
  return fechaDMA(iso);
}
function dmaToIso(dma: string): string | null {
  const m = dma.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const day = Number(d);
  const month = Number(mo);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${mo}-${d}`;
}
// Inserta las barras a medida que se escribe: "08062026" → "08/06/2026".
function maskDma(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
    .filter(Boolean)
    .join("/");
}

// Campo de fecha en formato día/mes/año (texto). Reemplaza al input nativo
// type="date", cuyo formato visible depende del idioma del navegador y no se
// puede fijar. Mantiene el valor hacia afuera en ISO.
function DateFieldDMA({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (iso: string) => void;
}) {
  const [text, setText] = useState(isoToDma(value));
  useEffect(() => {
    setText(isoToDma(value));
  }, [value]);
  return (
    <Input
      id={id}
      inputMode="numeric"
      placeholder="dd/mm/aaaa"
      className="sm:!h-[42px] sm:!text-[13.5px]"
      value={text}
      onChange={(e) => {
        const masked = maskDma(e.target.value);
        setText(masked);
        const iso = dmaToIso(masked);
        if (iso) onChange(iso);
        else if (masked === "") onChange("");
      }}
    />
  );
}

// Excel en español usa ';' como separador. Se antepone BOM para que los
// acentos se lean en UTF-8. Cada celda se entrecomilla y las comillas internas
// se duplican (formato CSV estándar).
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildCsv(
  rows: Actividad[],
  funcionarios: Funcionario[],
  competencias: Competencia[],
  entregables: Entregable[],
  gestiones: Gestion[],
): string {
  const funById = new Map(funcionarios.map((f) => [f.id, f]));
  const compById = new Map(competencias.map((c) => [c.id, c]));
  const entregableById = new Map(entregables.map((e) => [e.id, e]));
  const gestionById = new Map(gestiones.map((g) => [g.id, g]));

  const lines = [COLUMNS.map(csvCell).join(";")];
  for (const a of rows) {
    const fun = funById.get(a.funcionarioId);
    const comp = compById.get(a.competenciaId);
    const cells = [
      a.id,
      tipoLabel(a.tipo),
      a.titulo,
      a.descripcion,
      fun?.nombre ?? "",
      (fun && gestionById.get(fun.gestionId)?.nombre) ?? "",
      comp?.nombre ?? "",
      (comp && gestionById.get(comp.gestionId)?.nombre) ?? "",
      (a.entregableId && entregableById.get(a.entregableId)?.nombre) ?? "",
      estadoLabel(a.estado),
      fechaDMA(a.fechaCreacion),
      fechaDMA(dateOnly(a.fechaInicio)),
      fmtHora(a.fechaInicio),
      fechaDMA(dateOnly(a.fechaFin)),
      fmtHora(a.fechaFin),
      fechaDMA(a.fechaCumplimiento ?? ""),
      a.observaciones ?? "",
      a.accionesPendientes ?? "",
      a.resultadosAlcanzados ?? "",
    ];
    lines.push(cells.map((c) => csvCell(String(c ?? ""))).join(";"));
  }
  return "﻿" + lines.join("\r\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportDialog({
  open,
  onClose,
  activities,
  gestiones,
  funcionarios,
  competencias,
  entregables,
}: {
  open: boolean;
  onClose: () => void;
  activities: Actividad[];
  gestiones: Gestion[];
  funcionarios: Funcionario[];
  competencias: Competencia[];
  entregables: Entregable[];
}) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  useEffect(() => {
    if (open) {
      // Por defecto: primer día del mes actual hasta hoy.
      setDesde(TODAY_ISO.slice(0, 8) + "01");
      setHasta(TODAY_ISO);
    }
  }, [open]);

  // Incluye cualquier actividad cuyo rango se solape con el período elegido.
  // La comparación lexicográfica de "YYYY-MM-DD" equivale a la cronológica.
  const seleccionadas = useMemo(() => {
    if (!desde || !hasta) return [];
    const [a, b] = desde <= hasta ? [desde, hasta] : [hasta, desde];
    return activities
      .filter((act) => {
        const inicio = dateOnly(act.fechaInicio);
        const fin = dateOnly(act.fechaFin);
        return inicio <= b && fin >= a;
      })
      .sort(
        (x, y) =>
          dateOnly(x.fechaInicio).localeCompare(dateOnly(y.fechaInicio)) ||
          dateOnly(x.fechaFin).localeCompare(dateOnly(y.fechaFin)),
      );
  }, [activities, desde, hasta]);

  // El modal se monta en <body> con un portal. Dentro del árbol de la app
  // quedaba bajo el backdrop-filter de la cabecera, que crea un backdrop root
  // y alteraba su pintado pese a tener z-50.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  if (!open || !montado) return null;

  const rangoInvalido = !desde || !hasta;
  const sinResultados = !rangoInvalido && seleccionadas.length === 0;

  function exportar() {
    if (rangoInvalido || seleccionadas.length === 0) return;
    const [a, b] = desde <= hasta ? [desde, hasta] : [hasta, desde];
    const csv = buildCsv(seleccionadas, funcionarios, competencias, entregables, gestiones);
    downloadCsv(`actividades_${a}_a_${b}.csv`, csv);
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-[rgba(18,18,26,.32)] backdrop-blur-[3px]" onClick={onClose} />
      <div className="relative z-10 max-h-[calc(100dvh-1.5rem)] w-full max-w-[460px] overflow-y-auto rounded-modal bg-white p-5 shadow-modal sm:p-6">
        <div className="flex items-start justify-between gap-3.5">
          <div className="min-w-0">
            <div className="text-[18px] font-extrabold tracking-[-.025em]">Exportar actividades</div>
            <div className="mt-1 text-[12.5px] leading-[1.5] text-ink-faint">
              Incluye las actividades cuyo rango se solapa con el período y descarga un archivo CSV compatible
              con Excel.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-btn text-ink-faint transition-colors hover:bg-estado-pendiente-bg hover:text-ink"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-[7px]">
            <Label htmlFor="export-desde">Desde</Label>
            <DateFieldDMA id="export-desde" value={desde} onChange={setDesde} />
          </div>
          <div className="flex flex-col gap-[7px]">
            <Label htmlFor="export-hasta">Hasta</Label>
            <DateFieldDMA id="export-hasta" value={hasta} onChange={setHasta} />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-[11px] rounded-[13px] border border-line-soft bg-surface-subtle px-4 py-3.5">
          <Icon name="calendar" size={15} className="shrink-0 text-ink-faint" />
          {rangoInvalido ? (
            <span className="text-[13px] text-ink-faint">Selecciona ambas fechas.</span>
          ) : sinResultados ? (
            <span className="text-[13px] font-semibold text-estado-revision-fg">
              No hay actividades en ese rango.
            </span>
          ) : (
            <span className="text-[13px] text-ink-soft">
              <b className="font-[750] text-ink">{seleccionadas.length}</b>{" "}
              {seleccionadas.length === 1 ? "actividad en el rango" : "actividades en el rango"}
            </span>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <Button variant="outline" className="!h-10 !rounded-input !px-4" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="!h-10 !rounded-input !px-[19px]"
            onClick={exportar}
            disabled={rangoInvalido || sinResultados}
          >
            <Icon name="download" size={14} /> Exportar CSV
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
