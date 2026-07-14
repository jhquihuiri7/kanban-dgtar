"use client";

import * as React from "react";
import { useState } from "react";
import { Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, Icon, Input, Label, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  gestionNombre,
  gestionTone,
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

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition sm:min-h-0 sm:w-auto sm:px-3 sm:py-1.5 sm:text-sm",
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
      )}
    >
      {children}
    </button>
  );
}

/* ── Diálogo genérico de "solo nombre" (gestión, competencia, entregable) ── */

function NameDialog({
  title,
  description,
  initialValue,
  onClose,
  onSave,
}: {
  title: string;
  description: string;
  initialValue: string;
  onClose: () => void;
  onSave: (nombre: string) => void;
}) {
  const [nombre, setNombre] = useState(initialValue);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = nombre.trim();
    if (!clean) return;
    onSave(clean);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative z-10 max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 ring-1 ring-foreground/10 shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-900">{title}</div>
            <div className="text-xs text-slate-500 mt-0.5">{description}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 sm:h-auto sm:w-auto sm:p-1.5"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name-dialog-nombre">Nombre</Label>
            <Input
              id="name-dialog-nombre"
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
          <Button className="w-full sm:w-auto" type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="w-full sm:w-auto" type="submit" disabled={!nombre.trim()}>
            <Icon name="check" size={14} /> Guardar
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ── Funcionarios ─────────────────────────────────────────────────────── */

function FuncionariosTable({
  funcionarios,
  setFuncionarios,
  gestiones,
  activities,
  setActivities,
  useAvatars,
}: {
  funcionarios: Funcionario[];
  setFuncionarios: React.Dispatch<React.SetStateAction<Funcionario[]>>;
  gestiones: Gestion[];
  activities: Actividad[];
  setActivities: React.Dispatch<React.SetStateAction<Actividad[]>>;
  useAvatars: boolean;
}) {
  const [editing, setEditing] = useState<Funcionario | null>(null);
  const [creating, setCreating] = useState(false);

  function removeFuncionario(f: Funcionario) {
    setFuncionarios((prev) => prev.filter((item) => item.id !== f.id));
    setActivities((prev) =>
      prev
        .filter((item) => item.funcionarioId !== f.id)
        .map((item) => ({
          ...item,
          participantesIds: (item.participantesIds ?? []).filter((id) => id !== f.id),
        })),
    );
  }

  function updateFuncionario(next: Funcionario) {
    setFuncionarios((prev) => prev.map((f) => (f.id === next.id ? next : f)));
  }

  function createFuncionario(next: Funcionario) {
    setFuncionarios((prev) => [...prev, next]);
  }

  const newFuncionario: Funcionario = {
    id: nextCatalogId(funcionarios, "u"),
    nombre: "",
    email: "",
    cargo: "",
    gestionId: gestiones[0]?.id ?? "",
    color: CATALOG_COLORS[funcionarios.length % CATALOG_COLORS.length],
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col items-stretch gap-3 !pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-0 sm:!pb-2">
          <CardTitle>Funcionarios</CardTitle>
          <Button
            className="w-full sm:w-auto"
            variant="default"
            disabled={gestiones.length === 0}
            title={gestiones.length === 0 ? "Crea una gestión primero" : undefined}
            onClick={() => setCreating(true)}
          >
            <Icon name="plus" size={14} /> Nuevo funcionario
          </Button>
        </CardHeader>
        <CardContent className="!px-0">
          <div className="divide-y divide-slate-100 sm:hidden">
            {funcionarios.map((f) => (
              <article key={f.id} className="space-y-3 px-4 py-4">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar funcionario={f} useAvatars={useAvatars} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm font-medium text-slate-900">{f.nombre}</div>
                    <div className="mt-0.5 break-words text-xs text-slate-500">{f.cargo || "Sin cargo"}</div>
                  </div>
                </div>
                <div className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-foreground/5">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Email</div>
                    <div className="mt-0.5 break-all font-mono text-xs text-slate-600">{f.email || "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Gestión</div>
                    <Badge className="mt-1 max-w-full whitespace-normal" variant={gestionTone(f.gestionId, gestiones)}>
                      {gestionNombre(f.gestionId, gestiones)}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button className="w-full" type="button" variant="outline" onClick={() => setEditing(f)}>
                    <Icon name="edit" size={14} /> Editar
                  </Button>
                  <Button className="w-full" type="button" variant="destructive" onClick={() => removeFuncionario(f)}>
                    <Icon name="trash" size={14} /> Eliminar
                  </Button>
                </div>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-2 text-left font-medium">Nombre</th>
                  <th className="px-2 py-2 text-left font-medium">Cargo</th>
                  <th className="px-2 py-2 text-left font-medium">Email</th>
                  <th className="px-2 py-2 text-left font-medium">Gestión</th>
                  <th className="px-4 py-2 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {funcionarios.map((f) => (
                  <tr key={f.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar funcionario={f} useAvatars={useAvatars} size={28} />
                        <div className="font-medium text-slate-900">{f.nombre}</div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-slate-700">{f.cargo}</td>
                    <td className="px-2 py-2.5 font-mono text-xs text-slate-500">{f.email}</td>
                    <td className="px-2 py-2.5">
                      <Badge variant={gestionTone(f.gestionId, gestiones)}>{gestionNombre(f.gestionId, gestiones)}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          title="Editar funcionario"
                          onClick={() => setEditing(f)}
                        >
                          <Icon name="edit" size={14} />
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          title="Borrar funcionario"
                          onClick={() => removeFuncionario(f)}
                        >
                          <Icon name="trash" size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {editing && (
        <FuncionarioDialog
          title="Editar funcionario"
          funcionario={editing}
          gestiones={gestiones}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            updateFuncionario(next);
            setEditing(null);
          }}
        />
      )}

      {creating && (
        <FuncionarioDialog
          title="Nuevo funcionario"
          funcionario={newFuncionario}
          gestiones={gestiones}
          onClose={() => setCreating(false)}
          onSave={(next) => {
            createFuncionario(next);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}

function FuncionarioDialog({
  title,
  funcionario,
  gestiones,
  onClose,
  onSave,
}: {
  title: string;
  funcionario: Funcionario;
  gestiones: Gestion[];
  onClose: () => void;
  onSave: (funcionario: Funcionario) => void;
}) {
  const [nombre, setNombre] = useState(funcionario.nombre);
  const [cargo, setCargo] = useState(funcionario.cargo);
  const [email, setEmail] = useState(funcionario.email);
  const [gestionId, setGestionId] = useState(funcionario.gestionId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = nombre.trim();
    if (!cleanName) return;
    onSave({
      ...funcionario,
      nombre: cleanName,
      cargo: cargo.trim(),
      email: email.trim(),
      gestionId,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative z-10 max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 ring-1 ring-foreground/10 shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-900">{title}</div>
            <div className="text-xs text-slate-500 mt-0.5">Completa los datos del catálogo</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 sm:h-auto sm:w-auto sm:p-1.5"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="funcionario-nombre">Nombre</Label>
            <Input
              id="funcionario-nombre"
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="funcionario-cargo">Cargo</Label>
            <Input id="funcionario-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="funcionario-email">Email</Label>
            <Input id="funcionario-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="funcionario-gestion">Gestión</Label>
            <Select
              id="funcionario-gestion"
              value={gestionId}
              onChange={(e) => setGestionId(e.target.value)}
            >
              {gestiones.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
          <Button className="w-full sm:w-auto" type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="w-full sm:w-auto" type="submit" disabled={!nombre.trim()}>
            <Icon name="check" size={14} /> Guardar
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ── Sub-catálogo genérico anidado en una gestión (competencias / entregables) ── */

interface NestedItem {
  id: string;
  nombre: string;
  gestionId: string;
}

function NestedCatalogCard<T extends NestedItem>({
  title,
  icon,
  items,
  gestionId,
  idPrefix,
  newLabel,
  emptyLabel,
  onCreate,
  onUpdate,
  onRemove,
}: {
  title: string;
  icon: React.ComponentProps<typeof Icon>["name"];
  items: T[];
  gestionId: string;
  idPrefix: string;
  newLabel: string;
  emptyLabel: string;
  onCreate: (id: string, nombre: string) => void;
  onUpdate: (item: T) => void;
  onRemove: (item: T) => void;
}) {
  const [editing, setEditing] = useState<T | null>(null);
  const [creating, setCreating] = useState(false);
  const scoped = items.filter((item) => item.gestionId === gestionId);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col items-stretch gap-3 !pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-0 sm:!pb-2">
          <CardTitle className="flex items-center gap-1.5">
            <Icon name={icon} size={15} /> {title}
          </CardTitle>
          <Button className="w-full sm:w-auto" variant="default" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} /> {newLabel}
          </Button>
        </CardHeader>
        <CardContent className="!px-0">
          {scoped.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-500">{emptyLabel}</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {scoped.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0 break-words text-sm font-medium text-slate-900">{item.nombre}</div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title={`Editar ${title.toLowerCase()}`}
                      onClick={() => setEditing(item)}
                    >
                      <Icon name="edit" size={14} />
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      title={`Borrar ${title.toLowerCase()}`}
                      onClick={() => onRemove(item)}
                    >
                      <Icon name="trash" size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <NameDialog
          title={`Editar ${title.toLowerCase()}`}
          description="Completa los datos del catálogo"
          initialValue={editing.nombre}
          onClose={() => setEditing(null)}
          onSave={(nombre) => {
            onUpdate({ ...editing, nombre });
            setEditing(null);
          }}
        />
      )}

      {creating && (
        <NameDialog
          title={newLabel}
          description="Completa los datos del catálogo"
          initialValue=""
          onClose={() => setCreating(false)}
          onSave={(nombre) => {
            onCreate(nextCatalogId(items, idPrefix), nombre);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}

/* ── Gestiones (catálogo padre de competencias y entregables) ──────────── */

function GestionesPanel({
  gestiones,
  setGestiones,
  funcionarios,
  competencias,
  setCompetencias,
  entregables,
  setEntregables,
  activities,
  setActivities,
}: {
  gestiones: Gestion[];
  setGestiones: React.Dispatch<React.SetStateAction<Gestion[]>>;
  funcionarios: Funcionario[];
  competencias: Competencia[];
  setCompetencias: React.Dispatch<React.SetStateAction<Competencia[]>>;
  entregables: Entregable[];
  setEntregables: React.Dispatch<React.SetStateAction<Entregable[]>>;
  activities: Actividad[];
  setActivities: React.Dispatch<React.SetStateAction<Actividad[]>>;
}) {
  const [editing, setEditing] = useState<Gestion | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = gestiones.find((g) => g.id === selectedId) ?? gestiones[0] ?? null;

  function createGestion(nombre: string) {
    const next: Gestion = {
      id: nextCatalogId(gestiones, "g"),
      nombre,
      color: CATALOG_COLORS[gestiones.length % CATALOG_COLORS.length],
    };
    setGestiones((prev) => [...prev, next]);
    setSelectedId(next.id);
  }

  function updateGestion(g: Gestion, nombre: string) {
    setGestiones((prev) => prev.map((item) => (item.id === g.id ? { ...item, nombre } : item)));
  }

  function removeGestion(g: Gestion) {
    if (funcionarios.some((f) => f.gestionId === g.id)) {
      window.alert(`"${g.nombre}" tiene funcionarios asignados. Reasígnalos a otra gestión antes de eliminarla.`);
      return;
    }
    if (
      !window.confirm(
        `¿Eliminar la gestión "${g.nombre}"? También se eliminarán sus competencias y entregables, y las actividades ligadas a esas competencias.`,
      )
    ) {
      return;
    }
    const competenciaIds = new Set(competencias.filter((c) => c.gestionId === g.id).map((c) => c.id));
    setGestiones((prev) => prev.filter((item) => item.id !== g.id));
    setCompetencias((prev) => prev.filter((c) => c.gestionId !== g.id));
    setEntregables((prev) => prev.filter((e) => e.gestionId !== g.id));
    setActivities((prev) => prev.filter((a) => !competenciaIds.has(a.competenciaId)));
    if (selectedId === g.id) setSelectedId(null);
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-col items-stretch gap-3 !pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-0 sm:!pb-2">
          <CardTitle className="flex items-center gap-1.5">
            <Icon name="tree" size={15} /> Gestiones
          </CardTitle>
          <Button className="w-full sm:w-auto" variant="default" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} /> Nueva gestión
          </Button>
        </CardHeader>
        <CardContent className="!px-0">
          {gestiones.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-500">Todavía no hay gestiones.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {gestiones.map((g) => {
                const isSelected = selected?.id === g.id;
                const nFuncionarios = funcionarios.filter((f) => f.gestionId === g.id).length;
                const nCompetencias = competencias.filter((c) => c.gestionId === g.id).length;
                const nEntregables = entregables.filter((e) => e.gestionId === g.id).length;
                return (
                  <div
                    key={g.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(g.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(g.id);
                      }
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition",
                      isSelected ? "bg-blue-50/70" : "hover:bg-slate-50/60",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: g.color || "#64748b" }}
                        />
                        <span className="break-words text-sm font-medium text-slate-900">{g.nombre}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {nFuncionarios} funcionarios · {nCompetencias} competencias · {nEntregables} entregables
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        title="Editar gestión"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(g);
                        }}
                      >
                        <Icon name="edit" size={14} />
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        title="Borrar gestión"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeGestion(g);
                        }}
                      >
                        <Icon name="trash" size={14} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <>
          <div className="text-sm text-slate-500">
            Competencias y entregables de <span className="font-medium text-slate-700">{selected.nombre}</span>
          </div>
          <NestedCatalogCard
            title="Competencias del Estatuto"
            icon="briefcase"
            items={competencias}
            gestionId={selected.id}
            idPrefix="c"
            newLabel="Nueva competencia"
            emptyLabel="Esta gestión todavía no tiene competencias."
            onCreate={(id, nombre) => setCompetencias((prev) => [...prev, { id, nombre, gestionId: selected.id }])}
            onUpdate={(item) => setCompetencias((prev) => prev.map((c) => (c.id === item.id ? item : c)))}
            onRemove={(item) => {
              setCompetencias((prev) => prev.filter((c) => c.id !== item.id));
              setActivities((prev) => prev.filter((a) => a.competenciaId !== item.id));
            }}
          />
          <NestedCatalogCard
            title="Entregables"
            icon="checkCircle"
            items={entregables}
            gestionId={selected.id}
            idPrefix="e"
            newLabel="Nuevo entregable"
            emptyLabel="Esta gestión todavía no tiene entregables."
            onCreate={(id, nombre) => setEntregables((prev) => [...prev, { id, nombre, gestionId: selected.id }])}
            onUpdate={(item) => setEntregables((prev) => prev.map((e) => (e.id === item.id ? item : e)))}
            onRemove={(item) => setEntregables((prev) => prev.filter((e) => e.id !== item.id))}
          />
        </>
      )}

      {editing && (
        <NameDialog
          title="Editar gestión"
          description="Completa los datos del catálogo"
          initialValue={editing.nombre}
          onClose={() => setEditing(null)}
          onSave={(nombre) => {
            updateGestion(editing, nombre);
            setEditing(null);
          }}
        />
      )}

      {creating && (
        <NameDialog
          title="Nueva gestión"
          description="Completa los datos del catálogo"
          initialValue=""
          onClose={() => setCreating(false)}
          onSave={(nombre) => {
            createGestion(nombre);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

/* ── Vista principal de catálogos ────────────────────────────────────────── */

export function CatalogsView({
  funcionarios,
  setFuncionarios,
  gestiones,
  setGestiones,
  competencias,
  setCompetencias,
  entregables,
  setEntregables,
  activities,
  setActivities,
  useAvatars,
}: {
  funcionarios: Funcionario[];
  setFuncionarios: React.Dispatch<React.SetStateAction<Funcionario[]>>;
  gestiones: Gestion[];
  setGestiones: React.Dispatch<React.SetStateAction<Gestion[]>>;
  competencias: Competencia[];
  setCompetencias: React.Dispatch<React.SetStateAction<Competencia[]>>;
  entregables: Entregable[];
  setEntregables: React.Dispatch<React.SetStateAction<Entregable[]>>;
  activities: Actividad[];
  setActivities: React.Dispatch<React.SetStateAction<Actividad[]>>;
  useAvatars: boolean;
}) {
  const [tab, setTab] = useState<"funcionarios" | "gestiones">("funcionarios");
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="grid w-full grid-cols-2 rounded-lg bg-slate-100 p-1 sm:inline-flex sm:w-auto">
          <SegBtn active={tab === "funcionarios"} onClick={() => setTab("funcionarios")}>
            <Icon name="users" size={14} /> Funcionarios
            <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
              {funcionarios.length}
            </span>
          </SegBtn>
          <SegBtn active={tab === "gestiones"} onClick={() => setTab("gestiones")}>
            <Icon name="tree" size={14} /> Gestiones
            <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
              {gestiones.length}
            </span>
          </SegBtn>
        </div>
      </div>

      {tab === "funcionarios" ? (
        <FuncionariosTable
          funcionarios={funcionarios}
          setFuncionarios={setFuncionarios}
          gestiones={gestiones}
          activities={activities}
          setActivities={setActivities}
          useAvatars={useAvatars}
        />
      ) : (
        <GestionesPanel
          gestiones={gestiones}
          setGestiones={setGestiones}
          funcionarios={funcionarios}
          competencias={competencias}
          setCompetencias={setCompetencias}
          entregables={entregables}
          setEntregables={setEntregables}
          activities={activities}
          setActivities={setActivities}
        />
      )}
    </div>
  );
}
