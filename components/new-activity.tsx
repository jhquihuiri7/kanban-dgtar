"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Badge, Button, Icon, Input, Label, Select, Textarea } from "@/components/ui";
import {
  ESTADOS,
  TODAY_ISO,
  addDays,
  fmtFechaLarga,
  iso,
  type Actividad,
  type Competencia,
  type EstadoActividad,
  type Funcionario,
} from "@/lib/data";

export type NewActivityInput = Omit<Actividad, "id" | "orden">;

export function NewActivityDialog({
  open,
  onClose,
  onCreate,
  funcionarios,
  competencias,
  defaultEstado = "pendiente",
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: NewActivityInput) => void;
  funcionarios: Funcionario[];
  competencias: Competencia[];
  defaultEstado?: EstadoActividad;
}) {
  const activos = funcionarios.filter((f) => f.activo);
  const competenciasActivas = competencias.filter((c) => c.activo);

  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [funcionarioId, setFuncionarioId] = useState(activos[0]?.id || "");
  const [competenciaId, setCompetenciaId] = useState(competenciasActivas[0]?.id || "");
  const [plazoDias, setPlazoDias] = useState<number | string>(7);

  useEffect(() => {
    if (open) {
      setTitulo("");
      setDescripcion("");
      setFuncionarioId(funcionarios.filter((f) => f.activo)[0]?.id || "");
      setCompetenciaId(competencias.filter((c) => c.activo)[0]?.id || "");
      setPlazoDias(7);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const catalogosVacios = activos.length === 0 || competenciasActivas.length === 0;
  const vence = iso(addDays(new Date(TODAY_ISO + "T12:00:00"), Number(plazoDias) || 0));
  const estadoDef = ESTADOS.find((e) => e.id === defaultEstado);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || catalogosVacios) return;
    onCreate({
      titulo: titulo.trim(),
      descripcion: descripcion.trim(),
      funcionarioId,
      competenciaId,
      estado: defaultEstado,
      fechaCreacion: TODAY_ISO,
      plazoDias: Number(plazoDias) || 0,
      fechaVencimiento: vence,
      fechaCumplimiento: null,
      observaciones: "",
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-xl rounded-xl bg-white p-5 ring-1 ring-foreground/10 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-base font-semibold text-slate-900">Nueva actividad</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Se registrará en estado{" "}
              <Badge variant={estadoDef?.accent || "slate"}>{estadoDef?.label}</Badge>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {catalogosVacios ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <Icon name="alert" size={18} />
            </div>
            <div className="text-sm font-medium text-slate-900">
              Catálogos incompletos
            </div>
            <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
              Necesitas al menos un funcionario activo y una competencia activa para crear
              actividades. Actívalos en la pestaña <b>Catálogos</b>.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="titulo">Título</Label>
              <Input
                id="titulo"
                autoFocus
                placeholder="Ej. Revisar informe trimestral PMA"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desc">Descripción</Label>
              <Textarea
                id="desc"
                rows={3}
                placeholder="Detalles, alcances, archivos relacionados…"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="resp">Funcionario responsable</Label>
                <Select id="resp" value={funcionarioId} onChange={(e) => setFuncionarioId(e.target.value)}>
                  {activos.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nombre} — {f.unidad}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="comp">Competencia</Label>
                <Select id="comp" value={competenciaId} onChange={(e) => setCompetenciaId(e.target.value)}>
                  {competenciasActivas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo} — {c.nombre}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plazo">Plazo (días calendario)</Label>
                <Input
                  id="plazo"
                  type="number"
                  min={1}
                  max={365}
                  value={plazoDias}
                  onChange={(e) => setPlazoDias(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha de vencimiento</Label>
                <div className="flex h-9 items-center gap-2 rounded-lg bg-slate-50 px-3 text-sm font-medium text-slate-700 ring-1 ring-foreground/5">
                  <Icon name="calendar" size={14} className="text-slate-400" />
                  {fmtFechaLarga(vence)}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={catalogosVacios || !titulo.trim()}>
            <Icon name="plus" size={14} /> Crear actividad
          </Button>
        </div>
      </form>
    </div>
  );
}
