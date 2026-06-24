"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, Icon, Input, Label, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  UNIDADES,
  actividadIncludesFuncionario,
  unidadTone,
  type Actividad,
  type Competencia,
  type Funcionario,
  type Unidad,
} from "@/lib/data";

const FUNCIONARIO_COLORS = ["#0ea5e9", "#22c55e", "#8b5cf6", "#14b8a6", "#a855f7", "#16a34a", "#2563eb", "#475569"];

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
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition",
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
      )}
    >
      {children}
    </button>
  );
}

function FuncionariosTable({
  funcionarios,
  setFuncionarios,
  activities,
  setActivities,
  useAvatars,
}: {
  funcionarios: Funcionario[];
  setFuncionarios: React.Dispatch<React.SetStateAction<Funcionario[]>>;
  activities: Actividad[];
  setActivities: React.Dispatch<React.SetStateAction<Actividad[]>>;
  useAvatars: boolean;
}) {
  const [editing, setEditing] = useState<Funcionario | null>(null);
  const [creating, setCreating] = useState(false);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of funcionarios) {
      m[f.id] = activities.filter((a) => actividadIncludesFuncionario(a, f.id)).length;
    }
    return m;
  }, [activities, funcionarios]);

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
    unidad: UNIDADES[0],
    color: FUNCIONARIO_COLORS[funcionarios.length % FUNCIONARIO_COLORS.length],
  };

  return (
    <>
      <Card>
        <CardHeader className="flex items-center justify-between !pb-2">
          <CardTitle>Funcionarios</CardTitle>
          <Button variant="default" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} /> Nuevo funcionario
          </Button>
        </CardHeader>
        <CardContent className="!px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-2 text-left font-medium">Nombre</th>
                  <th className="px-2 py-2 text-left font-medium">Cargo</th>
                  <th className="px-2 py-2 text-left font-medium">Email</th>
                  <th className="px-2 py-2 text-left font-medium">Unidad</th>
                  <th className="px-2 py-2 text-right font-medium">Actividades</th>
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
                      <Badge variant={unidadTone(f.unidad)}>{f.unidad}</Badge>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-700">{counts[f.id] || 0}</td>
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
  onClose,
  onSave,
}: {
  title: string;
  funcionario: Funcionario;
  onClose: () => void;
  onSave: (funcionario: Funcionario) => void;
}) {
  const [nombre, setNombre] = useState(funcionario.nombre);
  const [cargo, setCargo] = useState(funcionario.cargo);
  const [email, setEmail] = useState(funcionario.email);
  const [unidad, setUnidad] = useState<Unidad>(funcionario.unidad);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = nombre.trim();
    if (!cleanName) return;
    onSave({
      ...funcionario,
      nombre: cleanName,
      cargo: cargo.trim(),
      email: email.trim(),
      unidad,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-md rounded-xl bg-white p-5 ring-1 ring-foreground/10 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-base font-semibold text-slate-900">{title}</div>
            <div className="text-xs text-slate-500 mt-0.5">Completa los datos del catálogo</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
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
            <Label htmlFor="funcionario-unidad">Unidad</Label>
            <Select
              id="funcionario-unidad"
              value={unidad}
              onChange={(e) => setUnidad(e.target.value as Unidad)}
            >
              {UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!nombre.trim()}>
            <Icon name="check" size={14} /> Guardar
          </Button>
        </div>
      </form>
    </div>
  );
}

function CompetenciasTable({
  competencias,
  setCompetencias,
  activities,
  setActivities,
}: {
  competencias: Competencia[];
  setCompetencias: React.Dispatch<React.SetStateAction<Competencia[]>>;
  activities: Actividad[];
  setActivities: React.Dispatch<React.SetStateAction<Actividad[]>>;
}) {
  const [editing, setEditing] = useState<Competencia | null>(null);
  const [creating, setCreating] = useState(false);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of activities) m[a.competenciaId] = (m[a.competenciaId] || 0) + 1;
    return m;
  }, [activities]);

  function removeCompetencia(c: Competencia) {
    setCompetencias((prev) => prev.filter((item) => item.id !== c.id));
    setActivities((prev) => prev.filter((item) => item.competenciaId !== c.id));
  }

  function updateCompetencia(next: Competencia) {
    setCompetencias((prev) => prev.map((c) => (c.id === next.id ? next : c)));
  }

  function createCompetencia(next: Competencia) {
    setCompetencias((prev) => [...prev, next]);
  }

  const newCompetencia: Competencia = {
    id: nextCatalogId(competencias, "c"),
    nombre: "",
    unidad: UNIDADES[0],
  };

  return (
    <>
      <Card>
        <CardHeader className="flex items-center justify-between !pb-2">
          <CardTitle>Competencias del Estatuto</CardTitle>
          <Button variant="default" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} /> Nueva competencia
          </Button>
        </CardHeader>
        <CardContent className="!px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-2 text-left font-medium">Nombre</th>
                  <th className="px-2 py-2 text-left font-medium">Unidad</th>
                  <th className="px-2 py-2 text-right font-medium">Actividades</th>
                  <th className="px-4 py-2 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {competencias.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{c.nombre}</td>
                    <td className="px-2 py-2.5">
                      <Badge variant={unidadTone(c.unidad)}>{c.unidad}</Badge>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-700">{counts[c.id] || 0}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          title="Editar competencia"
                          onClick={() => setEditing(c)}
                        >
                          <Icon name="edit" size={14} />
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          title="Borrar competencia"
                          onClick={() => removeCompetencia(c)}
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
        <CompetenciaDialog
          title="Editar competencia"
          competencia={editing}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            updateCompetencia(next);
            setEditing(null);
          }}
        />
      )}

      {creating && (
        <CompetenciaDialog
          title="Nueva competencia"
          competencia={newCompetencia}
          onClose={() => setCreating(false)}
          onSave={(next) => {
            createCompetencia(next);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}

function CompetenciaDialog({
  title,
  competencia,
  onClose,
  onSave,
}: {
  title: string;
  competencia: Competencia;
  onClose: () => void;
  onSave: (competencia: Competencia) => void;
}) {
  const [nombre, setNombre] = useState(competencia.nombre);
  const [unidad, setUnidad] = useState<Unidad>(competencia.unidad);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = nombre.trim();
    if (!cleanName) return;
    onSave({ ...competencia, nombre: cleanName, unidad });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-md rounded-xl bg-white p-5 ring-1 ring-foreground/10 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-base font-semibold text-slate-900">{title}</div>
            <div className="text-xs text-slate-500 mt-0.5">Completa los datos del catálogo</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="competencia-nombre">Nombre</Label>
            <Input
              id="competencia-nombre"
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="competencia-unidad">Unidad</Label>
            <Select
              id="competencia-unidad"
              value={unidad}
              onChange={(e) => setUnidad(e.target.value as Unidad)}
            >
              {UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!nombre.trim()}>
            <Icon name="check" size={14} /> Guardar
          </Button>
        </div>
      </form>
    </div>
  );
}

export function CatalogsView({
  funcionarios,
  setFuncionarios,
  competencias,
  setCompetencias,
  activities,
  setActivities,
  useAvatars,
}: {
  funcionarios: Funcionario[];
  setFuncionarios: React.Dispatch<React.SetStateAction<Funcionario[]>>;
  competencias: Competencia[];
  setCompetencias: React.Dispatch<React.SetStateAction<Competencia[]>>;
  activities: Actividad[];
  setActivities: React.Dispatch<React.SetStateAction<Actividad[]>>;
  useAvatars: boolean;
}) {
  const [tab, setTab] = useState<"funcionarios" | "competencias">("funcionarios");
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          <SegBtn active={tab === "funcionarios"} onClick={() => setTab("funcionarios")}>
            <Icon name="users" size={14} /> Funcionarios
            <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
              {funcionarios.length}
            </span>
          </SegBtn>
          <SegBtn active={tab === "competencias"} onClick={() => setTab("competencias")}>
            <Icon name="briefcase" size={14} /> Competencias
            <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
              {competencias.length}
            </span>
          </SegBtn>
        </div>
      </div>

      {tab === "funcionarios" ? (
        <FuncionariosTable
          funcionarios={funcionarios}
          setFuncionarios={setFuncionarios}
          activities={activities}
          setActivities={setActivities}
          useAvatars={useAvatars}
        />
      ) : (
        <CompetenciasTable
          competencias={competencias}
          setCompetencias={setCompetencias}
          activities={activities}
          setActivities={setActivities}
        />
      )}
    </div>
  );
}
