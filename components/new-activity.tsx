"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Badge, Button, Icon, Input, Label, Select, Textarea } from "@/components/ui";
import {
  ESTADOS,
  TIPOS,
  TODAY_ISO,
  addDays,
  daysBetween,
  fmtFechaLarga,
  iso,
  type Actividad,
  type Competencia,
  type EstadoActividad,
  type Funcionario,
  type TipoActividad,
} from "@/lib/data";
import type { AuthUser } from "@/lib/auth-token";

export type NewActivityInput = Omit<Actividad, "id" | "orden">;

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

function cleanParticipantes(ids: string[], responsableId: string): string[] {
  return Array.from(new Set(ids.filter((id) => id && id !== responsableId)));
}

export function NewActivityDialog({
  open,
  onClose,
  onCreate,
  funcionarios,
  competencias,
  defaultEstado = "pendiente",
  currentUser,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: NewActivityInput) => void;
  funcionarios: Funcionario[];
  competencias: Competencia[];
  defaultEstado?: EstadoActividad;
  currentUser: AuthUser;
  isAdmin: boolean;
}) {
  const funcionariosDisponibles = funcionarios;
  const competenciasDisponibles = competencias;

  const [tipo, setTipo] = useState<TipoActividad>("asignacion");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [accionesPendientes, setAccionesPendientes] = useState("");
  const [resultadosAlcanzados, setResultadosAlcanzados] = useState("");
  const [funcionarioId, setFuncionarioId] = useState(funcionariosDisponibles[0]?.id || "");
  const [participantesIds, setParticipantesIds] = useState<string[]>([]);
  const [competenciaId, setCompetenciaId] = useState(competenciasDisponibles[0]?.id || "");
  const [plazoDias, setPlazoDias] = useState<number | string>(7);
  const [fechaReunion, setFechaReunion] = useState(TODAY_ISO);
  const [horaReunion, setHoraReunion] = useState("09:00");

  useEffect(() => {
    if (open) {
      setTipo("asignacion");
      setTitulo("");
      setDescripcion("");
      setAccionesPendientes("");
      setResultadosAlcanzados("");
      setFuncionarioId(isAdmin ? funcionarios[0]?.id || "" : currentUser.funcionarioId || "");
      setParticipantesIds([]);
      setCompetenciaId(competencias[0]?.id || "");
      setPlazoDias(7);
      setFechaReunion(TODAY_ISO);
      setHoraReunion("09:00");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const effectiveTipo = tipo;
  const effectiveEstado = defaultEstado;
  const esReunion = effectiveTipo === "reunion";
  const currentFuncionario = funcionariosDisponibles.find((f) => f.id === currentUser.funcionarioId);
  const catalogosVacios = isAdmin
    ? funcionariosDisponibles.length === 0 || competenciasDisponibles.length === 0
    : !currentUser.funcionarioId || competenciasDisponibles.length === 0;
  // Asignación: vence = hoy + plazo. Reunión: la fecha+hora elegidas se guardan
  // juntas en fechaVencimiento ("YYYY-MM-DDTHH:mm").
  const plazo = Number(plazoDias) || 0;
  const vence = esReunion ? `${fechaReunion}T${horaReunion}` : iso(addDays(TODAY_ISO, plazo));
  const estadoDef = ESTADOS.find((e) => e.id === effectiveEstado);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || catalogosVacios) return;
    if (esReunion && (!fechaReunion || !horaReunion)) return;
    onCreate({
      tipo: effectiveTipo,
      titulo: titulo.trim(),
      descripcion: descripcion.trim(),
      funcionarioId: isAdmin ? funcionarioId : currentUser.funcionarioId || "",
      participantesIds: esReunion ? cleanParticipantes(participantesIds, funcionarioId) : [],
      competenciaId,
      estado: effectiveEstado,
      fechaCreacion: TODAY_ISO,
      plazoDias: esReunion ? daysBetween(TODAY_ISO, fechaReunion) : plazo,
      fechaVencimiento: vence,
      fechaCumplimiento: null,
      observaciones: "",
      accionesPendientes: accionesPendientes.trim(),
      resultadosAlcanzados: resultadosAlcanzados.trim(),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white ring-1 ring-foreground/10 shadow-xl"
      >
        <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <div className="text-base font-semibold text-slate-900">
              {esReunion ? "Nueva reunión" : "Nueva actividad"}
            </div>
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {catalogosVacios ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <Icon name="alert" size={18} />
              </div>
              <div className="text-sm font-medium text-slate-900">
                Catálogos incompletos
              </div>
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
                Necesitas al menos un funcionario y una competencia para crear
                actividades. {isAdmin ? "Revísalos en la pestaña Catálogos." : "Tu usuario debe estar vinculado a un funcionario."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
              <Label htmlFor="tipo">Tipo</Label>
              <Select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoActividad)}>
                {TIPOS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
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
                rows={2}
                placeholder="Detalles, alcances, archivos relacionados…"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {isAdmin ? (
                <div className="space-y-1.5">
                  <Label htmlFor="resp">Funcionario responsable</Label>
                  <Select
                    id="resp"
                    value={funcionarioId}
                    onChange={(e) => {
                      setFuncionarioId(e.target.value);
                      setParticipantesIds((ids) => ids.filter((id) => id !== e.target.value));
                    }}
                  >
                    {funcionariosDisponibles.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nombre} — {f.unidad}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Funcionario responsable</Label>
                  <div className="flex h-9 items-center rounded-lg bg-slate-50 px-3 text-sm font-medium text-slate-700 ring-1 ring-foreground/5">
                    {currentFuncionario?.nombre || currentUser.email}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="comp">Competencia</Label>
                <Select id="comp" value={competenciaId} onChange={(e) => setCompetenciaId(e.target.value)}>
                  {competenciasDisponibles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} — {c.unidad}
                    </option>
                  ))}
                </Select>
              </div>
              {esReunion ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="fecha-reunion">Fecha de la reunión</Label>
                    <Input
                      id="fecha-reunion"
                      type="date"
                      value={fechaReunion}
                      onChange={(e) => setFechaReunion(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="hora-reunion">Hora</Label>
                    <Input
                      id="hora-reunion"
                      type="time"
                      value={horaReunion}
                      onChange={(e) => setHoraReunion(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
            {esReunion && (
              <div className="space-y-1.5">
                <Label>Participantes</Label>
                <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                  {funcionariosDisponibles.filter((f) => f.id !== funcionarioId).length > 0 ? (
                    <div className="space-y-1">
                      {funcionariosDisponibles
                        .filter((f) => f.id !== funcionarioId)
                        .map((f) => (
                          <label
                            key={f.id}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
                              checked={participantesIds.includes(f.id)}
                              onChange={() => setParticipantesIds((ids) => toggleId(ids, f.id))}
                            />
                            <span className="min-w-0 flex-1 truncate">{f.nombre}</span>
                            <span className="shrink-0 text-xs text-slate-400">{f.unidad}</span>
                          </label>
                        ))}
                    </div>
                  ) : (
                    <div className="px-2 py-3 text-sm text-slate-400">Sin participantes adicionales</div>
                  )}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="acciones">Acciones pendientes y actividades programadas</Label>
              <Textarea
                id="acciones"
                rows={2}
                placeholder="Próximos pasos, tareas programadas…"
                value={accionesPendientes}
                onChange={(e) => setAccionesPendientes(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resultados">Resultados alcanzados</Label>
              <Textarea
                id="resultados"
                rows={2}
                placeholder="Logros, entregables completados…"
                value={resultadosAlcanzados}
                onChange={(e) => setResultadosAlcanzados(e.target.value)}
              />
            </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={catalogosVacios || !titulo.trim()}>
            <Icon name="plus" size={14} /> {esReunion ? "Crear reunión" : "Crear actividad"}
          </Button>
        </div>
      </form>
    </div>
  );
}
