"use client";

import * as React from "react";
import { Avatar, Badge, Button, Icon, Label, Textarea, type IconName } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  ESTADOS,
  TODAY_ISO,
  addDays,
  daysBetween,
  fmtFecha,
  fmtFechaLarga,
  iso,
  plazoInfo,
  unidadTone,
  type Actividad,
  type Competencia,
  type EstadoActividad,
  type Funcionario,
  type PlazoInfo,
  type PlazoTone,
} from "@/lib/data";

function nextEstado(e: EstadoActividad): EstadoActividad {
  const order: EstadoActividad[] = ["pendiente", "en_progreso", "en_revision", "cumplida"];
  const i = order.indexOf(e);
  return order[Math.min(order.length - 1, i + 1)];
}

export function EstadoBadge({ estado }: { estado: EstadoActividad }) {
  const e = ESTADOS.find((x) => x.id === estado);
  if (!e) return null;
  return <Badge variant={e.accent}>{e.label}</Badge>;
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-foreground/5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

function PlazoBanner({ act, p }: { act: Actividad; p: PlazoInfo }) {
  const map: Record<PlazoTone, { bg: string; ring: string; text: string; icon: IconName }> = {
    green: { bg: "bg-green-50", ring: "ring-green-200", text: "text-green-700", icon: "check" },
    amber: { bg: "bg-amber-50", ring: "ring-amber-200", text: "text-amber-800", icon: "clock" },
    red: { bg: "bg-red-50", ring: "ring-red-200", text: "text-red-700", icon: "alert" },
    slate: { bg: "bg-slate-50", ring: "ring-slate-200", text: "text-slate-700", icon: "clock" },
  };
  const s = map[p.tone];
  const heading =
    act.estado === "cumplida"
      ? p.kind === "ok"
        ? "Cumplida dentro del plazo"
        : `Cumplida con ${-daysBetween(act.fechaCumplimiento ?? TODAY_ISO, act.fechaVencimiento)} día(s) de atraso`
      : p.kind === "overdue"
        ? `Vencida hace ${-(p.days ?? 0)} día(s)`
        : p.kind === "today"
          ? "Vence hoy"
          : `${p.days} día(s) restantes`;
  return (
    <div className={cn("flex items-center gap-3 rounded-lg p-3 ring-1", s.bg, s.ring)}>
      <div className={cn("flex h-8 w-8 items-center justify-center rounded-md ring-1 bg-white", s.ring, s.text)}>
        <Icon name={s.icon} size={16} />
      </div>
      <div className="flex-1">
        <div className={cn("text-sm font-semibold", s.text)}>{heading}</div>
        <div className="text-xs text-slate-600">Vencimiento: {fmtFechaLarga(act.fechaVencimiento)}</div>
      </div>
    </div>
  );
}

function HistoryItem({
  icon,
  tone,
  text,
  when,
}: {
  icon: IconName;
  tone: "slate" | "blue" | "amber" | "green" | "red";
  text: React.ReactNode;
  when: string;
}) {
  const dotMap = {
    slate: "bg-slate-200 text-slate-700",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
  };
  return (
    <li className="flex items-start gap-3">
      <div className={cn("flex h-6 w-6 items-center justify-center rounded-full", dotMap[tone])}>
        <Icon name={icon} size={12} />
      </div>
      <div className="flex-1">
        <div className="text-sm text-slate-800">{text}</div>
        <div className="text-[11px] text-slate-500">{when}</div>
      </div>
    </li>
  );
}

export function DetailPanel({
  activityId,
  activities,
  setActivities,
  funcionarios,
  competencias,
  useAvatars,
  onClose,
}: {
  activityId: string;
  activities: Actividad[];
  setActivities: React.Dispatch<React.SetStateAction<Actividad[]>>;
  funcionarios: Funcionario[];
  competencias: Competencia[];
  useAvatars: boolean;
  onClose: () => void;
}) {
  const act = activities.find((a) => a.id === activityId);
  if (!act) return null;
  const fun = funcionarios.find((f) => f.id === act.funcionarioId);
  const comp = competencias.find((c) => c.id === act.competenciaId);
  const p = plazoInfo(act, TODAY_ISO);

  function update(patch: Partial<Actividad>) {
    setActivities((prev) => prev.map((a) => (a.id === act!.id ? { ...a, ...patch } : a)));
  }
  function marcarCumplida() {
    update({ estado: "cumplida", fechaCumplimiento: TODAY_ISO });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-[520px] flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
        {/* header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <Badge variant={comp ? unidadTone(comp.unidad) : "slate"}>{comp?.unidad}</Badge>
            <EstadoBadge estado={act.estado} />
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-6 p-5">
          {/* title + description */}
          <div>
            <h2 className="text-lg font-semibold text-slate-900 leading-snug">{act.titulo}</h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">{act.descripcion}</p>
          </div>

          {/* responsable */}
          <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 ring-1 ring-foreground/5">
            <div className="flex items-center gap-3">
              <Avatar funcionario={fun} useAvatars={useAvatars} size={36} />
              <div>
                <div className="text-sm font-medium text-slate-900">{fun?.nombre}</div>
                <div className="text-xs text-slate-500">
                  {fun?.cargo} · {fun?.unidad}
                </div>
              </div>
            </div>
            <Badge variant={unidadTone(fun?.unidad)}>{fun?.unidad}</Badge>
          </div>

          {/* plazo grid */}
          <div className="grid grid-cols-3 gap-2">
            <MetaCell label="Creada" value={fmtFecha(act.fechaCreacion)} />
            <MetaCell label="Plazo" value={`${act.plazoDias} días`} />
            <MetaCell label="Vence" value={fmtFecha(act.fechaVencimiento)} />
          </div>

          {/* plazo banner */}
          <PlazoBanner act={act} p={p} />

          {/* competencia */}
          <div>
            <Label className="mb-1.5 block uppercase tracking-wide text-slate-500">Competencia</Label>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-900">{comp?.nombre}</div>
                  <div className="text-xs text-slate-500">Estatuto del Régimen Especial</div>
                </div>
                <Badge variant={unidadTone(comp?.unidad)}>{comp?.unidad}</Badge>
              </div>
            </div>
          </div>

          {/* Historial demo */}
          <div>
            <Label className="mb-2 block uppercase tracking-wide text-slate-500">Historial</Label>
            <ol className="space-y-2.5 text-sm">
              <HistoryItem
                icon="plus"
                tone="slate"
                text={
                  <>
                    Actividad creada por <b>{fun?.nombre.split(" ")[0]}</b>
                  </>
                }
                when={fmtFecha(act.fechaCreacion)}
              />
              {act.estado !== "pendiente" && (
                <HistoryItem
                  icon="arrow"
                  tone="blue"
                  text="Movida a En progreso"
                  when={fmtFecha(iso(addDays(new Date(act.fechaCreacion), 1)))}
                />
              )}
              {(act.estado === "en_revision" || act.estado === "cumplida") && (
                <HistoryItem
                  icon="arrow"
                  tone="amber"
                  text="Enviada a revisión"
                  when={fmtFecha(iso(addDays(new Date(act.fechaCreacion), Math.floor(act.plazoDias / 2))))}
                />
              )}
              {act.estado === "cumplida" && (
                <HistoryItem
                  icon="check"
                  tone={p.kind === "ok" ? "green" : "red"}
                  text={p.kind === "ok" ? "Marcada como cumplida en plazo" : "Marcada como cumplida fuera de plazo"}
                  when={fmtFecha(act.fechaCumplimiento)}
                />
              )}
            </ol>
          </div>

          {/* observaciones */}
          <div>
            <Label className="mb-1.5 block uppercase tracking-wide text-slate-500">Observaciones</Label>
            <Textarea
              rows={3}
              placeholder="Comentario interno…"
              value={act.observaciones || ""}
              onChange={(e) => update({ observaciones: e.target.value })}
            />
          </div>
        </div>

        {/* footer actions */}
        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-slate-200 bg-white p-3">
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <div className="flex items-center gap-2">
            {act.estado !== "cumplida" && (
              <Button variant="outline" onClick={() => update({ estado: nextEstado(act.estado) })}>
                <Icon name="arrow" size={14} /> Avanzar
              </Button>
            )}
            {act.estado !== "cumplida" ? (
              <Button onClick={marcarCumplida}>
                <Icon name="check" size={14} /> Marcar cumplida
              </Button>
            ) : (
              <Button variant="outline" onClick={() => update({ estado: "en_revision", fechaCumplimiento: null })}>
                Reabrir
              </Button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
