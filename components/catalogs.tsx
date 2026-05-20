"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, Icon } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  unidadTone,
  type Actividad,
  type Competencia,
  type Funcionario,
} from "@/lib/data";

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

function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-4 w-7 items-center rounded-full transition-colors",
        on ? "bg-slate-900" : "bg-slate-300",
      )}
    >
      <span
        className={cn(
          "inline-block h-3 w-3 rounded-full bg-white shadow transform transition-transform",
          on ? "translate-x-3.5" : "translate-x-0.5",
        )}
      />
    </span>
  );
}

function FuncionariosTable({
  funcionarios,
  setFuncionarios,
  activities,
  useAvatars,
}: {
  funcionarios: Funcionario[];
  setFuncionarios: React.Dispatch<React.SetStateAction<Funcionario[]>>;
  activities: Actividad[];
  useAvatars: boolean;
}) {
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of activities) m[a.funcionarioId] = (m[a.funcionarioId] || 0) + 1;
    return m;
  }, [activities]);

  function toggle(id: string) {
    setFuncionarios((prev) => prev.map((f) => (f.id === id ? { ...f, activo: !f.activo } : f)));
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between !pb-2">
        <CardTitle>Funcionarios</CardTitle>
        <Button variant="default">
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
                <th className="px-2 py-2 text-left font-medium">Estado</th>
                <th className="w-8" />
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
                  <td className="px-2 py-2.5">
                    <button onClick={() => toggle(f.id)} className="inline-flex items-center gap-1.5">
                      <Switch on={f.activo} />
                      <span className="text-xs text-slate-600">{f.activo ? "Activo" : "Inactivo"}</span>
                    </button>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <button className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                      <Icon name="more" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function CompetenciasTable({
  competencias,
  setCompetencias,
  activities,
}: {
  competencias: Competencia[];
  setCompetencias: React.Dispatch<React.SetStateAction<Competencia[]>>;
  activities: Actividad[];
}) {
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of activities) m[a.competenciaId] = (m[a.competenciaId] || 0) + 1;
    return m;
  }, [activities]);

  function toggle(id: string) {
    setCompetencias((prev) => prev.map((c) => (c.id === id ? { ...c, activo: !c.activo } : c)));
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between !pb-2">
        <CardTitle>Competencias del Estatuto</CardTitle>
        <Button variant="default">
          <Icon name="plus" size={14} /> Nueva competencia
        </Button>
      </CardHeader>
      <CardContent className="!px-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="px-4 py-2 text-left font-medium">Código</th>
                <th className="px-2 py-2 text-left font-medium">Nombre</th>
                <th className="px-2 py-2 text-left font-medium">Artículo</th>
                <th className="px-2 py-2 text-left font-medium">Unidad</th>
                <th className="px-2 py-2 text-right font-medium">Actividades</th>
                <th className="px-2 py-2 text-left font-medium">Estado</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {competencias.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5">
                    <Badge variant={unidadTone(c.unidad)}>{c.codigo}</Badge>
                  </td>
                  <td className="px-2 py-2.5 font-medium text-slate-900">{c.nombre}</td>
                  <td className="px-2 py-2.5 text-xs text-slate-500">{c.articulo}</td>
                  <td className="px-2 py-2.5 text-slate-700">{c.unidad}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-700">{counts[c.id] || 0}</td>
                  <td className="px-2 py-2.5">
                    <button onClick={() => toggle(c.id)} className="inline-flex items-center gap-1.5">
                      <Switch on={c.activo} />
                      <span className="text-xs text-slate-600">{c.activo ? "Activo" : "Inactivo"}</span>
                    </button>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <button className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                      <Icon name="more" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function CatalogsView({
  funcionarios,
  setFuncionarios,
  competencias,
  setCompetencias,
  activities,
  useAvatars,
}: {
  funcionarios: Funcionario[];
  setFuncionarios: React.Dispatch<React.SetStateAction<Funcionario[]>>;
  competencias: Competencia[];
  setCompetencias: React.Dispatch<React.SetStateAction<Competencia[]>>;
  activities: Actividad[];
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
          useAvatars={useAvatars}
        />
      ) : (
        <CompetenciasTable
          competencias={competencias}
          setCompetencias={setCompetencias}
          activities={activities}
        />
      )}
    </div>
  );
}
