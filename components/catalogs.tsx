"use client";

import * as React from "react";
import { useState } from "react";
import { Button, Icon, Label } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  competenciaCodigo,
  type Actividad,
  type Competencia,
  type Entregable,
  type Funcionario,
  type Gestion,
} from "@/lib/data";

const CATALOG_COLORS = ["#0ea5e9", "#22c55e", "#8b5cf6", "#14b8a6", "#a855f7", "#16a34a", "#2563eb", "#475569"];

function nextCatalogId(items: { id: string }[], prefix: string): string {
  const maxNum = items.reduce((max, item) => {
    const n = Number.parseInt(item.id.replace(/\D/g, ""), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `${prefix}${maxNum + 1}`;
}

/* ── Diálogo de nombre (gestión, competencia y entregable) ──────────── */

function NameDialog({
  title,
  context,
  initialValue,
  placeholder,
  onClose,
  onSave,
}: {
  title: string;
  /* Declara la posición en la jerarquía: "Pertenecerá a DGTAR", "C1 · DGTAR". */
  context: string;
  initialValue: string;
  placeholder?: string;
  onClose: () => void;
  onSave: (nombre: string) => void;
}) {
  const [nombre, setNombre] = useState(initialValue);
  const invalido = !nombre.trim();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (invalido) return;
    onSave(nombre.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-[rgba(18,18,26,.32)] backdrop-blur-[3px]" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative z-10 max-h-[calc(100dvh-1.5rem)] w-full max-w-[440px] overflow-y-auto rounded-modal bg-white p-5 shadow-modal sm:p-6"
      >
        <div className="flex items-start justify-between gap-3.5">
          <div className="min-w-0">
            <div className="text-[18px] font-extrabold tracking-[-.025em]">{title}</div>
            <div className="mt-[3px] text-[12.5px] text-ink-faint">{context}</div>
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

        <div className="mt-5 flex flex-col gap-[7px]">
          <Label htmlFor="name-dialog-nombre">
            Nombre <span className="text-estado-vencida-fg">*</span>
          </Label>
          <input
            id="name-dialog-nombre"
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={placeholder}
            className="h-[42px] w-full rounded-input border border-line-dashed bg-white px-3.5 text-[13.5px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-disabled focus:border-accent-border focus:ring-[3px] focus:ring-accent/10"
          />
        </div>

        <div className="mt-[22px] flex items-center justify-end gap-2.5">
          <Button type="button" variant="outline" className="!h-10 !rounded-input !px-4" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" className="!h-10 !rounded-input !px-4" disabled={invalido}>
            <Icon name="check" size={14} /> Guardar
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ── Vista principal ────────────────────────────────────────────────── */

type Dialogo =
  | { tipo: "gestion-nueva" }
  | { tipo: "gestion-editar"; gestion: Gestion }
  | { tipo: "competencia-nueva" }
  | { tipo: "competencia-editar"; competencia: Competencia }
  | { tipo: "entregable-nuevo"; competencia: Competencia }
  | { tipo: "entregable-editar"; entregable: Entregable }
  | null;

export function CatalogsView({
  funcionarios,
  gestiones,
  setGestiones,
  competencias,
  setCompetencias,
  entregables,
  setEntregables,
  activities,
  setActivities,
}: {
  funcionarios: Funcionario[];
  gestiones: Gestion[];
  setGestiones: React.Dispatch<React.SetStateAction<Gestion[]>>;
  competencias: Competencia[];
  setCompetencias: React.Dispatch<React.SetStateAction<Competencia[]>>;
  entregables: Entregable[];
  setEntregables: React.Dispatch<React.SetStateAction<Entregable[]>>;
  activities: Actividad[];
  setActivities: React.Dispatch<React.SetStateAction<Actividad[]>>;
}) {
  const [gestionSel, setGestionSel] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [plegadas, setPlegadas] = useState<Record<string, true>>({});

  const activa = gestiones.find((g) => g.id === gestionSel) ?? gestiones[0] ?? null;
  const misCompetencias = activa ? competencias.filter((c) => c.gestionId === activa.id) : [];
  const idsCompetencias = new Set(misCompetencias.map((c) => c.id));
  const misEntregables = entregables.filter((e) => idsCompetencias.has(e.competenciaId));

  function togglePlegada(id: string) {
    setPlegadas((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }

  function crearGestion(nombre: string) {
    const nueva: Gestion = {
      id: nextCatalogId(gestiones, "g"),
      nombre,
      color: CATALOG_COLORS[gestiones.length % CATALOG_COLORS.length],
    };
    setGestiones((prev) => [...prev, nueva]);
    setGestionSel(nueva.id);
  }

  function borrarGestion(g: Gestion) {
    if (funcionarios.some((f) => f.gestionId === g.id)) {
      window.alert(`"${g.nombre}" tiene funcionarios asignados. Reasígnalos a otra gestión antes de eliminarla.`);
      return;
    }
    const competenciaIds = new Set(competencias.filter((c) => c.gestionId === g.id).map((c) => c.id));
    // Borrar la gestión arrastra sus competencias, así que rige la misma regla:
    // no puede llevarse por delante ninguna actividad.
    const ligadas = activities.filter((a) => competenciaIds.has(a.competenciaId)).length;
    if (ligadas > 0) {
      window.alert(
        `"${g.nombre}" tiene ${ligadas} ${ligadas === 1 ? "actividad" : "actividades"} en sus competencias. ` +
          `Reasígnalas a otra competencia antes de eliminar la gestión.`,
      );
      return;
    }
    if (
      !window.confirm(
        `¿Eliminar la gestión "${g.nombre}"? También se eliminarán sus competencias y entregables.`,
      )
    ) {
      return;
    }
    setGestiones((prev) => prev.filter((item) => item.id !== g.id));
    setCompetencias((prev) => prev.filter((c) => c.gestionId !== g.id));
    setEntregables((prev) => prev.filter((e) => !competenciaIds.has(e.competenciaId)));
    if (gestionSel === g.id) setGestionSel(null);
  }

  // Una actividad no puede quedarse sin competencia, así que borrar la
  // competencia nunca borra actividades: se bloquea hasta reasignarlas.
  function borrarCompetencia(c: Competencia) {
    const ligadas = activities.filter((a) => a.competenciaId === c.id).length;
    if (ligadas > 0) {
      window.alert(
        `"${c.nombre}" tiene ${ligadas} ${ligadas === 1 ? "actividad asignada" : "actividades asignadas"}. ` +
          `Reasígnalas a otra competencia desde el panel de detalle antes de eliminarla.`,
      );
      return;
    }
    const suyos = entregables.filter((e) => e.competenciaId === c.id).length;
    const aviso = suyos
      ? `¿Eliminar la competencia "${c.nombre}"? Se eliminarán también sus ${suyos} ${suyos === 1 ? "entregable" : "entregables"}.`
      : `¿Eliminar la competencia "${c.nombre}"?`;
    if (!window.confirm(aviso)) return;
    setCompetencias((prev) => prev.filter((item) => item.id !== c.id));
    setEntregables((prev) => prev.filter((e) => e.competenciaId !== c.id));
  }

  function borrarEntregable(e: Entregable) {
    if (!window.confirm(`¿Eliminar el entregable "${e.nombre}"?`)) return;
    setEntregables((prev) => prev.filter((item) => item.id !== e.id));
    // entregableId es opcional: se desliga en vez de borrar la actividad.
    setActivities((prev) =>
      prev.map((a) => (a.entregableId === e.id ? { ...a, entregableId: null } : a)),
    );
  }

  const accionChica =
    "flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] border border-line bg-white text-ink-muted transition-colors hover:border-line-hover hover:bg-surface-subtle";
  const borrarChico =
    "flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-estado-vencida text-white transition-colors hover:bg-[#E11D48]";

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-[14px] lg:grid-cols-[320px_1fr]">
        {/* Panel de gestiones */}
        <section className="overflow-hidden rounded-section border border-line bg-white shadow-card">
          <div className="flex items-center justify-between gap-3 px-[18px] pb-3 pt-[17px]">
            <h2 className="text-[15px] font-[750] tracking-[-.02em]">Gestiones</h2>
            <span className="rounded-full bg-estado-pendiente-bg px-2 py-0.5 text-[11px] font-bold text-ink-muted">
              {gestiones.length}
            </span>
          </div>

          {gestiones.length === 0 ? (
            <div className="px-[18px] pb-4 text-[12.5px] font-medium text-ink-faint">
              Todavía no hay gestiones.
            </div>
          ) : (
            gestiones.map((g) => {
              const esActiva = activa?.id === g.id;
              const nComp = competencias.filter((c) => c.gestionId === g.id).length;
              const compIds = new Set(competencias.filter((c) => c.gestionId === g.id).map((c) => c.id));
              const nEnt = entregables.filter((e) => compIds.has(e.competenciaId)).length;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGestionSel(g.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 border-l-[3px] px-[15px] py-3 text-left transition-colors",
                    esActiva
                      ? "border-l-accent bg-accent-softer"
                      : "border-l-transparent hover:bg-surface-subtle",
                  )}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color || "#A5A5B3" }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold leading-[1.25] tracking-[-.01em]">{g.nombre}</div>
                    <div className="mt-[3px] text-[11px] font-medium text-ink-ghost">
                      {nComp} {nComp === 1 ? "competencia" : "competencias"} · {nEnt}{" "}
                      {nEnt === 1 ? "entregable" : "entregables"}
                    </div>
                  </div>
                  {esActiva && <Icon name="chevronRight" size={13} className="shrink-0 text-accent" />}
                </button>
              );
            })
          )}

          <div className="px-3.5 pb-3.5 pt-3">
            <Button
              className="!h-9 w-full !rounded-input"
              onClick={() => setDialogo({ tipo: "gestion-nueva" })}
            >
              <Icon name="plus" size={13} /> Nueva gestión
            </Button>
          </div>
        </section>

        {/* Detalle de la gestión activa */}
        <section className="min-w-0 overflow-hidden rounded-section border border-line bg-white shadow-card">
          {!activa ? (
            <div className="px-5 py-10 text-center text-[12.5px] font-semibold text-ink-ghost">
              Crea una gestión para empezar.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3.5 px-5 pb-3.5 pt-[17px]">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: activa.color || "#A5A5B3" }}
                  />
                  <div className="min-w-0">
                    <h2 className="truncate text-[15px] font-[750] tracking-[-.02em]">{activa.nombre}</h2>
                    <div className="mt-0.5 text-[11.5px] font-medium text-ink-faint">
                      {misCompetencias.length} {misCompetencias.length === 1 ? "competencia" : "competencias"} ·{" "}
                      {misEntregables.length} {misEntregables.length === 1 ? "entregable" : "entregables"}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    aria-label="Editar gestión"
                    onClick={() => setDialogo({ tipo: "gestion-editar", gestion: activa })}
                    className="flex h-[34px] w-[34px] items-center justify-center rounded-btn border border-line bg-white text-ink-muted transition-colors hover:border-line-hover hover:bg-surface-subtle"
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Eliminar gestión"
                    onClick={() => borrarGestion(activa)}
                    className="flex h-[34px] w-[34px] items-center justify-center rounded-btn border border-line bg-white text-estado-vencida-fg transition-colors hover:border-estado-vencida hover:bg-estado-vencida-bg"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                  <Button className="!rounded-btn" onClick={() => setDialogo({ tipo: "competencia-nueva" })}>
                    <Icon name="plus" size={13} /> Nueva competencia
                  </Button>
                </div>
              </div>

              {misCompetencias.length === 0 ? (
                <div className="border-t border-line-soft px-5 py-6 text-[12.5px] font-medium text-ink-faint">
                  Esta gestión todavía no tiene competencias.
                </div>
              ) : (
                misCompetencias.map((c) => {
                  const codigo = competenciaCodigo(c.id, competencias);
                  const suyos = entregables.filter((e) => e.competenciaId === c.id);
                  const nActividades = activities.filter((a) => a.competenciaId === c.id).length;
                  const abierta = !plegadas[c.id];
                  return (
                    <div key={c.id} className="border-t border-line-soft">
                      {/* La fila entera pliega; los botones de acción cortan la
                          propagación o al pulsarlos se plegaría la competencia. */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => togglePlegada(c.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            togglePlegada(c.id);
                          }
                        }}
                        aria-expanded={abierta}
                        className="flex cursor-pointer items-center gap-[11px] px-5 py-3 transition-colors hover:bg-surface-subtle"
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center text-ink-faint transition-transform duration-[180ms]",
                            abierta && "rotate-90",
                          )}
                        >
                          <Icon name="chevronRight" size={12} />
                        </span>
                        <span className="shrink-0 rounded-[7px] bg-accent-soft px-2 py-0.5 text-[10px] font-extrabold text-accent">
                          {codigo}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-bold leading-[1.3] tracking-[-.01em]">{c.nombre}</div>
                          <div className="mt-[3px] text-[11px] font-medium text-ink-ghost">
                            {suyos.length} {suyos.length === 1 ? "entregable" : "entregables"} ·{" "}
                            {nActividades} {nActividades === 1 ? "actividad" : "actividades"}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-[7px]">
                          <button
                            type="button"
                            aria-label={`Editar ${codigo}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDialogo({ tipo: "competencia-editar", competencia: c });
                            }}
                            className={accionChica}
                          >
                            <Icon name="edit" size={13} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Borrar ${codigo}`}
                            title="Elimina también sus entregables y actividades"
                            onClick={(e) => {
                              e.stopPropagation();
                              borrarCompetencia(c);
                            }}
                            className={borrarChico}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </div>

                      {abierta && (
                        <div className="pb-3.5 pl-[60px] pr-5">
                          <div className="flex flex-col gap-[7px] border-l-[1.5px] border-dashed border-line-dashed pl-[18px]">
                            {suyos.map((e) => (
                              <div
                                key={e.id}
                                className="flex items-center gap-2.5 rounded-input border border-line-soft bg-surface-subtle px-3 py-2.5"
                              >
                                <Icon name="fileText" size={14} className="shrink-0 text-ink-ghost" strokeWidth={1.9} />
                                <span className="min-w-0 flex-1 text-[12.5px] font-[650]">{e.nombre}</span>
                                <div className="flex shrink-0 gap-1.5">
                                  <button
                                    type="button"
                                    aria-label="Editar entregable"
                                    onClick={() => setDialogo({ tipo: "entregable-editar", entregable: e })}
                                    className="flex h-[27px] w-[27px] items-center justify-center rounded-lg border border-line bg-white text-ink-muted transition-colors hover:bg-app"
                                  >
                                    <Icon name="edit" size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Borrar entregable"
                                    onClick={() => borrarEntregable(e)}
                                    className="flex h-[27px] w-[27px] items-center justify-center rounded-lg bg-estado-vencida text-white transition-colors hover:bg-[#E11D48]"
                                  >
                                    <Icon name="trash" size={12} />
                                  </button>
                                </div>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => setDialogo({ tipo: "entregable-nuevo", competencia: c })}
                              className="flex items-center gap-[7px] rounded-input border-[1.5px] border-dashed border-line-hover bg-white px-3 py-2.5 text-[12px] font-[650] text-ink-muted transition-colors hover:border-[#B9A6F0] hover:bg-[#FCFAFF] hover:text-accent"
                            >
                              <Icon name="plus" size={13} />
                              Nuevo entregable en {codigo}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}
        </section>
      </div>

      {dialogo?.tipo === "gestion-nueva" && (
        <NameDialog
          title="Nueva gestión"
          context="Se añadirá al catálogo de gestiones"
          initialValue=""
          placeholder="p. ej. Gestión de Riesgos"
          onClose={() => setDialogo(null)}
          onSave={(nombre) => {
            crearGestion(nombre);
            setDialogo(null);
          }}
        />
      )}

      {dialogo?.tipo === "gestion-editar" && (
        <NameDialog
          title="Editar gestión"
          context="Gestión del catálogo"
          initialValue={dialogo.gestion.nombre}
          onClose={() => setDialogo(null)}
          onSave={(nombre) => {
            const id = dialogo.gestion.id;
            setGestiones((prev) => prev.map((g) => (g.id === id ? { ...g, nombre } : g)));
            setDialogo(null);
          }}
        />
      )}

      {dialogo?.tipo === "competencia-nueva" && activa && (
        <NameDialog
          title="Nueva competencia"
          context={`Pertenecerá a ${activa.nombre}`}
          initialValue=""
          placeholder="p. ej. Seguimiento al Plan Galápagos"
          onClose={() => setDialogo(null)}
          onSave={(nombre) => {
            setCompetencias((prev) => [
              ...prev,
              { id: nextCatalogId(competencias, "c"), nombre, gestionId: activa.id },
            ]);
            setDialogo(null);
          }}
        />
      )}

      {dialogo?.tipo === "competencia-editar" && activa && (
        <NameDialog
          title="Editar competencia"
          context={`${competenciaCodigo(dialogo.competencia.id, competencias)} · ${activa.nombre}`}
          initialValue={dialogo.competencia.nombre}
          onClose={() => setDialogo(null)}
          onSave={(nombre) => {
            const id = dialogo.competencia.id;
            setCompetencias((prev) => prev.map((c) => (c.id === id ? { ...c, nombre } : c)));
            setDialogo(null);
          }}
        />
      )}

      {dialogo?.tipo === "entregable-nuevo" && activa && (
        <NameDialog
          title="Nuevo entregable"
          context={`Pertenecerá a ${competenciaCodigo(dialogo.competencia.id, competencias)} · ${dialogo.competencia.nombre}`}
          initialValue=""
          placeholder="p. ej. Informe trimestral"
          onClose={() => setDialogo(null)}
          onSave={(nombre) => {
            const competenciaId = dialogo.competencia.id;
            setEntregables((prev) => [
              ...prev,
              { id: nextCatalogId(entregables, "e"), nombre, competenciaId },
            ]);
            setDialogo(null);
          }}
        />
      )}

      {dialogo?.tipo === "entregable-editar" && activa && (
        <NameDialog
          title="Editar entregable"
          context={`${competenciaCodigo(dialogo.entregable.competenciaId, competencias)} · ${activa.nombre}`}
          initialValue={dialogo.entregable.nombre}
          onClose={() => setDialogo(null)}
          onSave={(nombre) => {
            const id = dialogo.entregable.id;
            setEntregables((prev) => prev.map((e) => (e.id === id ? { ...e, nombre } : e)));
            setDialogo(null);
          }}
        />
      )}
    </>
  );
}
