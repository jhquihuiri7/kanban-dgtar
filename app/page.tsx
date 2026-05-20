"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Icon, Input, Select, useClickAway, type IconName } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  TODAY_ISO,
  daysBetween,
  fmtFechaLarga,
  type Actividad,
  type Competencia,
  type EstadoActividad,
  type Funcionario,
} from "@/lib/data";
import { KanbanBoard, type Filters } from "@/components/kanban";
import { DetailPanel } from "@/components/detail";
import { StatsView } from "@/components/stats";
import { CatalogsView } from "@/components/catalogs";
import { NewActivityDialog, type NewActivityInput } from "@/components/new-activity";

type Tab = "kanban" | "stats" | "catalogs";
type Accent = "violet" | "green" | "blue" | "slate";
type Density = "standard" | "compact";
type LoadState = "loading" | "ready" | "error";
type SyncState = "idle" | "saving" | "saved" | "error";

interface Settings {
  density: Density;
  useAvatars: boolean;
  moduleAccent: Accent;
}

const ACCENT_MAP: Record<Accent, string> = {
  violet: "from-violet-600 to-purple-500",
  green: "from-emerald-600 to-green-500",
  blue: "from-blue-600 to-sky-500",
  slate: "from-slate-700 to-slate-500",
};

const SYNC_DEBOUNCE_MS = 800;

/* Loads the catalog + activities from /api/data on mount, then writes the
   whole document back (debounced) whenever any of the three lists change.
   This keeps every existing mutation (drag&drop, edits, toggles, create) in
   sync with the PostgreSQL backend without touching the child components. */
function useServerSync({
  funcionarios,
  competencias,
  activities,
  setFuncionarios,
  setCompetencias,
  setActivities,
}: {
  funcionarios: Funcionario[];
  competencias: Competencia[];
  activities: Actividad[];
  setFuncionarios: React.Dispatch<React.SetStateAction<Funcionario[]>>;
  setCompetencias: React.Dispatch<React.SetStateAction<Competencia[]>>;
  setActivities: React.Dispatch<React.SetStateAction<Actividad[]>>;
}) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [reloadKey, setReloadKey] = useState(0);

  // Skip the first change that comes from hydrating state after the load.
  const skipNextSyncRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial load (and manual retry via reloadKey).
  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setLoadError("");
    (async () => {
      try {
        const res = await fetch("/api/data");
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || res.statusText);
        if (cancelled) return;
        skipNextSyncRef.current = true;
        setFuncionarios(json.funcionarios ?? []);
        setCompetencias(json.competencias ?? []);
        setActivities(json.actividades ?? []);
        setLoadState("ready");
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Error desconocido");
        setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  // Debounced full-document write on any data change.
  useEffect(() => {
    if (loadState !== "ready") return;
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    setSyncState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/data", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ funcionarios, competencias, actividades: activities }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error || res.statusText);
        }
        setSyncState("saved");
      } catch (err) {
        console.error("[sync] PUT /api/data", err);
        setSyncState("error");
      }
    }, SYNC_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [funcionarios, competencias, activities, loadState]);

  return { loadState, loadError, syncState, retry: () => setReloadKey((k) => k + 1) };
}

export default function Page() {
  const [settings, setSettings] = useState<Settings>({
    density: "standard",
    useAvatars: true,
    moduleAccent: "violet",
  });
  const setTweak = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const [tab, setTab] = useState<Tab>("kanban");
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [activities, setActivities] = useState<Actividad[]>([]);

  const { loadState, loadError, syncState, retry } = useServerSync({
    funcionarios,
    competencias,
    activities,
    setFuncionarios,
    setCompetencias,
    setActivities,
  });

  const [openActivityId, setOpenActivityId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDefaultEstado, setDialogDefaultEstado] = useState<EstadoActividad>("pendiente");

  const [filters, setFilters] = useState<Filters>({ funcionario: "all", competencia: "all", q: "" });

  function createActivity(partial: NewActivityInput) {
    const maxNum = activities.reduce((m, a) => {
      const n = parseInt(a.id.replace(/\D/g, ""), 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    const id = "a" + (maxNum + 1).toString().padStart(3, "0");
    const next: Actividad = { id, orden: activities.length, ...partial };
    setActivities([next, ...activities]);
  }

  if (loadState !== "ready") {
    return <LoadingGate state={loadState} error={loadError} onRetry={retry} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header
        tab={tab}
        setTab={setTab}
        accent={settings.moduleAccent}
        settings={settings}
        setTweak={setTweak}
        syncState={syncState}
        onNew={() => {
          setDialogDefaultEstado("pendiente");
          setDialogOpen(true);
        }}
      />

      <main className="mx-auto max-w-[1500px] px-6 py-6">
        {tab === "kanban" && (
          <KanbanScreen
            activities={activities}
            setActivities={setActivities}
            funcionarios={funcionarios}
            competencias={competencias}
            filters={filters}
            setFilters={setFilters}
            density={settings.density}
            useAvatars={settings.useAvatars}
            onOpen={(id) => setOpenActivityId(id)}
            onAdd={(estado) => {
              setDialogDefaultEstado(estado);
              setDialogOpen(true);
            }}
          />
        )}

        {tab === "stats" && (
          <StatsScreen
            activities={activities}
            funcionarios={funcionarios}
            competencias={competencias}
            useAvatars={settings.useAvatars}
          />
        )}

        {tab === "catalogs" && (
          <CatalogsScreen
            funcionarios={funcionarios}
            setFuncionarios={setFuncionarios}
            competencias={competencias}
            setCompetencias={setCompetencias}
            activities={activities}
            useAvatars={settings.useAvatars}
          />
        )}
      </main>

      {openActivityId && (
        <DetailPanel
          activityId={openActivityId}
          activities={activities}
          setActivities={setActivities}
          funcionarios={funcionarios}
          competencias={competencias}
          useAvatars={settings.useAvatars}
          onClose={() => setOpenActivityId(null)}
        />
      )}

      <NewActivityDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreate={createActivity}
        funcionarios={funcionarios}
        competencias={competencias}
        defaultEstado={dialogDefaultEstado}
      />
    </div>
  );
}

function Header({
  tab,
  setTab,
  accent,
  settings,
  setTweak,
  syncState,
  onNew,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  accent: Accent;
  settings: Settings;
  setTweak: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  syncState: SyncState;
  onNew: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] items-center gap-6 px-6 py-2.5">
        {/* brand */}
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm",
              ACCENT_MAP[accent] || ACCENT_MAP.violet,
            )}
          >
            <Icon name="kanban" size={16} />
          </div>
          <div className="hidden sm:block">
            <div className="text-[13px] font-semibold leading-tight text-slate-900">Kanban de Seguimiento</div>
            <div className="text-[11px] leading-tight text-slate-500">
              Dirección de Planificación · Plataforma Ambiental
            </div>
          </div>
        </div>

        {/* tabs */}
        <nav className="ml-2 flex items-center gap-0.5">
          <TabBtn active={tab === "kanban"} onClick={() => setTab("kanban")}>
            <Icon name="kanban" size={14} /> Tablero
          </TabBtn>
          <TabBtn active={tab === "stats"} onClick={() => setTab("stats")}>
            <Icon name="chart" size={14} /> Estadísticas
          </TabBtn>
          <TabBtn active={tab === "catalogs"} onClick={() => setTab("catalogs")}>
            <Icon name="list" size={14} /> Catálogos
          </TabBtn>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <SyncIndicator state={syncState} />
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
            <Icon name="calendar" size={14} />
            <span>{fmtFechaLarga(TODAY_ISO)}</span>
          </div>
          <div className="h-5 w-px bg-slate-200 hidden md:block" />
          <SettingsMenu settings={settings} setTweak={setTweak} />
          <Button onClick={onNew}>
            <Icon name="plus" size={14} /> Nueva actividad
          </Button>
        </div>
      </div>
    </header>
  );
}

function TabBtn({
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
        "relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition",
        active
          ? "bg-white text-slate-900 shadow-sm ring-1 ring-foreground/10"
          : "text-slate-600 hover:text-slate-900 hover:bg-white/60",
      )}
    >
      {children}
    </button>
  );
}

/* Settings popover — surfaces the prototype's "Tweaks" (density / avatares / acento)
   as real in-app controls. */
function SettingsMenu({
  settings,
  setTweak,
}: {
  settings: Settings;
  setTweak: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickAway(ref, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" size="icon" onClick={() => setOpen((o) => !o)} title="Vista">
        <Icon name="filter" size={14} />
      </Button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl bg-white p-3 ring-1 ring-foreground/10 shadow-xl">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Tablero</div>
          <div className="mt-2 space-y-2">
            <div>
              <div className="mb-1 text-xs font-medium text-slate-700">Densidad de cards</div>
              <Seg
                value={settings.density}
                options={[
                  { value: "standard", label: "Estándar" },
                  { value: "compact", label: "Compacto" },
                ]}
                onChange={(v) => setTweak("density", v as Density)}
              />
            </div>
            <label className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700">Avatares con color</span>
              <Toggle on={settings.useAvatars} onChange={(v) => setTweak("useAvatars", v)} />
            </label>
          </div>

          <div className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Acento del módulo
          </div>
          <div className="mt-2">
            <Seg
              value={settings.moduleAccent}
              options={[
                { value: "violet", label: "PG" },
                { value: "green", label: "PMA" },
                { value: "blue", label: "RGDP" },
              ]}
              onChange={(v) => setTweak("moduleAccent", v as Accent)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Seg({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex w-full rounded-lg bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-md px-2 py-1 text-xs font-medium transition",
            value === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
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
    </button>
  );
}

/* ── Screens ────────────────────────────────────────────────────────── */

function KanbanScreen({
  activities,
  setActivities,
  funcionarios,
  competencias,
  filters,
  setFilters,
  density,
  useAvatars,
  onOpen,
  onAdd,
}: {
  activities: Actividad[];
  setActivities: React.Dispatch<React.SetStateAction<Actividad[]>>;
  funcionarios: Funcionario[];
  competencias: Competencia[];
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  density: Density;
  useAvatars: boolean;
  onOpen: (id: string) => void;
  onAdd: (estado: EstadoActividad) => void;
}) {
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of activities) m[a.estado] = (m[a.estado] || 0) + 1;
    m.vencidas = activities.filter(
      (a) => a.estado !== "cumplida" && daysBetween(TODAY_ISO, a.fechaVencimiento) < 0,
    ).length;
    return m;
  }, [activities]);

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 leading-tight">Tablero de Actividades</h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-slate-500">
            <span>{activities.length} actividades</span>
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <span>
              <b className="text-red-600">{counts.vencidas}</b> vencidas
            </span>
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <span>
              <b className="text-slate-700">{counts.cumplida || 0}</b> cumplidas
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar actividad…"
              className="pl-8 h-9 w-64"
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            />
          </div>
          <Select
            value={filters.funcionario}
            onChange={(e) => setFilters({ ...filters, funcionario: e.target.value })}
            className="w-44"
          >
            <option value="all">Todos los funcionarios</option>
            {funcionarios.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
              </option>
            ))}
          </Select>
          <Select
            value={filters.competencia}
            onChange={(e) => setFilters({ ...filters, competencia: e.target.value })}
            className="w-48"
          >
            <option value="all">Todas las competencias</option>
            {competencias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.nombre}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <KanbanBoard
        activities={activities}
        setActivities={setActivities}
        funcionarios={funcionarios}
        competencias={competencias}
        useAvatars={useAvatars}
        density={density}
        onOpen={onOpen}
        onAdd={onAdd}
        filters={filters}
      />
    </div>
  );
}

function StatsScreen({
  activities,
  funcionarios,
  competencias,
  useAvatars,
}: {
  activities: Actividad[];
  funcionarios: Funcionario[];
  competencias: Competencia[];
  useAvatars: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 leading-tight">Estadísticas</h1>
          <div className="mt-1 text-sm text-slate-500">
            Métricas generales y cumplimiento por funcionario · corte al {fmtFechaLarga(TODAY_ISO)}
          </div>
        </div>
        <Button variant="outline">
          <Icon name="download" size={14} /> Exportar
        </Button>
      </div>
      <StatsView
        activities={activities}
        funcionarios={funcionarios}
        competencias={competencias}
        useAvatars={useAvatars}
      />
    </div>
  );
}

function CatalogsScreen(props: {
  funcionarios: Funcionario[];
  setFuncionarios: React.Dispatch<React.SetStateAction<Funcionario[]>>;
  competencias: Competencia[];
  setCompetencias: React.Dispatch<React.SetStateAction<Competencia[]>>;
  activities: Actividad[];
  useAvatars: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 leading-tight">Catálogos</h1>
        <div className="mt-1 text-sm text-slate-500">
          Administra funcionarios y competencias del Estatuto. Estos catálogos alimentan el tablero.
        </div>
      </div>
      <CatalogsView {...props} />
    </div>
  );
}

/* ── Sync / load UI ─────────────────────────────────────────────────── */

function SyncIndicator({ state }: { state: SyncState }) {
  if (state === "idle") return null;
  const map: Record<Exclude<SyncState, "idle">, { icon: IconName; text: string; cls: string; spin?: boolean }> = {
    saving: { icon: "loader", text: "Guardando…", cls: "text-slate-500", spin: true },
    saved: { icon: "check", text: "Guardado", cls: "text-emerald-600" },
    error: { icon: "alert", text: "Error al guardar", cls: "text-red-600" },
  };
  const s = map[state];
  return (
    <div className={cn("hidden sm:flex items-center gap-1.5 text-xs font-medium", s.cls)} title="Sincronización con la base de datos">
      <Icon name={s.icon} size={14} className={s.spin ? "animate-spin" : undefined} />
      <span>{s.text}</span>
    </div>
  );
}

function LoadingGate({
  state,
  error,
  onRetry,
}: {
  state: LoadState;
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900">
      {state === "error" ? (
        <div className="max-w-md rounded-xl bg-white p-6 text-center ring-1 ring-foreground/10 shadow-sm">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <Icon name="alert" size={20} />
          </div>
          <div className="text-sm font-semibold text-slate-900">No se pudo cargar desde la base de datos</div>
          <p className="mx-auto mt-1.5 max-w-sm text-xs text-slate-500 break-words">{error}</p>
          <p className="mx-auto mt-2 max-w-sm text-xs text-slate-400">
            Revisa que PostgreSQL esté arriba y que <span className="font-mono">DATABASE_URL</span> sea
            correcta. Si es la primera vez, ejecuta <span className="font-mono">npm run seed</span>.
          </p>
          <Button className="mt-4" onClick={onRetry}>
            <Icon name="refresh" size={14} /> Reintentar
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 text-sm text-slate-500">
          <Icon name="loader" size={18} className="animate-spin" />
          Cargando datos…
        </div>
      )}
    </div>
  );
}
