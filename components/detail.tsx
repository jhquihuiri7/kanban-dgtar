"use client";

import * as React from "react";
import { useState } from "react";
import { Avatar, Badge, Button, Icon, Input, Label, Select, Textarea, type IconName } from "@/components/ui";
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Actividad | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  function startEdit() {
    setDraft({ ...act! });
    setEditing(true);
  }
  function cancelEdit() {
    setEditing(false);
    setDraft(null);
  }
  // Guarda el borrador. El vencimiento se recalcula desde creación + plazo, y la
  // fecha de cumplimiento se ajusta según el estado elegido (igual que el tablero).
  function saveEdit() {
    if (!draft) return;
    const plazo = Math.max(0, Number(draft.plazoDias) || 0);
    const fechaVencimiento = iso(addDays(draft.fechaCreacion, plazo));
    let fechaCumplimiento = draft.fechaCumplimiento;
    if (draft.estado === "cumplida") fechaCumplimiento = fechaCumplimiento ?? TODAY_ISO;
    else fechaCumplimiento = null;
    update({
      titulo: draft.titulo.trim() || act!.titulo,
      descripcion: draft.descripcion.trim(),
      funcionarioId: draft.funcionarioId,
      competenciaId: draft.competenciaId,
      estado: draft.estado,
      fechaCreacion: draft.fechaCreacion,
      plazoDias: plazo,
      fechaVencimiento,
      fechaCumplimiento,
    });
    setEditing(false);
    setDraft(null);
  }

  function eliminar() {
    setActivities((prev) => prev.filter((a) => a.id !== act!.id));
    onClose();
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
          {editing && draft ? (
            <EditForm
              draft={draft}
              setDraft={setDraft}
              funcionarios={funcionarios}
              competencias={competencias}
            />
          ) : (
          <>
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

          {/* Historial */}
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
          </>
          )}
        </div>

        {/* footer actions */}
        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-slate-200 bg-white p-3">
          {editing ? (
            <>
              <Button variant="ghost" onClick={cancelEdit}>
                Cancelar
              </Button>
              <Button onClick={saveEdit} disabled={!draft?.titulo.trim()}>
                <Icon name="check" size={14} /> Guardar cambios
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={onClose}>
                  Cerrar
                </Button>
                <Button
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Icon name="trash" size={14} /> Eliminar
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={startEdit}>
                  <Icon name="edit" size={14} /> Editar
                </Button>
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
            </>
          )}
        </div>
      </aside>

      {confirmDelete && (
        <ConfirmDeleteDialog
          titulo={act.titulo}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={eliminar}
        />
      )}
    </div>
  );
}

/* ── Formulario de edición (todos los campos) ───────────────────────── */

function EditForm({
  draft,
  setDraft,
  funcionarios,
  competencias,
}: {
  draft: Actividad;
  setDraft: React.Dispatch<React.SetStateAction<Actividad | null>>;
  funcionarios: Funcionario[];
  competencias: Competencia[];
}) {
  function set<K extends keyof Actividad>(key: K, value: Actividad[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }
  const vence = iso(addDays(draft.fechaCreacion, Math.max(0, Number(draft.plazoDias) || 0)));

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="edit-titulo">Título</Label>
        <Input
          id="edit-titulo"
          value={draft.titulo}
          onChange={(e) => set("titulo", e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-desc">Descripción</Label>
        <Textarea
          id="edit-desc"
          rows={3}
          value={draft.descripcion}
          onChange={(e) => set("descripcion", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="edit-resp">Funcionario responsable</Label>
          <Select
            id="edit-resp"
            value={draft.funcionarioId}
            onChange={(e) => set("funcionarioId", e.target.value)}
          >
            {funcionarios.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre} — {f.unidad}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-comp">Competencia</Label>
          <Select
            id="edit-comp"
            value={draft.competenciaId}
            onChange={(e) => set("competenciaId", e.target.value)}
          >
            {competencias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} — {c.unidad}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-estado">Estado</Label>
          <Select
            id="edit-estado"
            value={draft.estado}
            onChange={(e) => set("estado", e.target.value as EstadoActividad)}
          >
            {ESTADOS.map((est) => (
              <option key={est.id} value={est.id}>
                {est.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Fecha de creación</Label>
          <div className="flex h-9 items-center gap-2 rounded-lg bg-slate-50 px-3 text-sm font-medium text-slate-500 ring-1 ring-foreground/5">
            <Icon name="calendar" size={14} className="text-slate-400" />
            {fmtFechaLarga(draft.fechaCreacion)}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-plazo">Plazo (días calendario)</Label>
          <Input
            id="edit-plazo"
            type="number"
            min={0}
            max={365}
            value={draft.plazoDias}
            onChange={(e) => set("plazoDias", Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Vence (calculado)</Label>
          <div className="flex h-9 items-center gap-2 rounded-lg bg-slate-50 px-3 text-sm font-medium text-slate-700 ring-1 ring-foreground/5">
            <Icon name="calendar" size={14} className="text-slate-400" />
            {fmtFechaLarga(vence)}
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-obs">Observaciones</Label>
        <Textarea
          id="edit-obs"
          rows={3}
          value={draft.observaciones || ""}
          onChange={(e) => set("observaciones", e.target.value)}
        />
      </div>
    </div>
  );
}

/* ── Confirmación de borrado ─────────────────────────────────────────── */

function ConfirmDeleteDialog({
  titulo,
  onCancel,
  onConfirm,
}: {
  titulo: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-xl bg-white p-5 ring-1 ring-foreground/10 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <Icon name="trash" size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">¿Eliminar esta actividad?</div>
            <p className="mt-1 text-xs text-slate-500">
              Se eliminará <b>“{titulo}”</b> de forma permanente. Esta acción no se puede deshacer.
            </p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            <Icon name="trash" size={14} /> Eliminar
          </Button>
        </div>
      </div>
    </div>
  );
}
