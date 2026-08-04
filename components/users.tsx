"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { Avatar, Badge, Button, Icon, Label, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { AuthUser, UserRole } from "@/lib/auth-token";
import { gestionNombre, gestionTone, type Actividad, type Funcionario, type Gestion } from "@/lib/data";

interface ManagedUser extends AuthUser {
  funcionarioNombre: string | null;
  createdAt: string;
  updatedAt: string;
}

/* Una fila = un funcionario con su cuenta. El modelo permite funcionarios sin
   cuenta y cuentas sin funcionario, así que ambos casos se muestran marcados
   para poder corregirlos desde aquí. */
interface Fila {
  key: string;
  funcionario?: Funcionario;
  user?: ManagedUser;
  nombre: string;
  cargo: string;
  email: string;
  gestionId: string;
  role?: UserRole;
}

const CATALOG_COLORS = ["#0ea5e9", "#22c55e", "#8b5cf6", "#14b8a6", "#a855f7", "#16a34a", "#2563eb", "#475569"];

function nextFuncionarioId(items: { id: string }[]): string {
  const max = items.reduce((acc, item) => {
    const n = Number.parseInt(item.id.replace(/\D/g, ""), 10);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return `u${max + 1}`;
}

export function UsersView({
  funcionarios,
  setFuncionarios,
  gestiones,
  activities,
  currentUser,
  useAvatars,
  persistFuncionarios,
}: {
  funcionarios: Funcionario[];
  setFuncionarios: React.Dispatch<React.SetStateAction<Funcionario[]>>;
  gestiones: Gestion[];
  activities: Actividad[];
  currentUser: AuthUser;
  useAvatars: boolean;
  /* Guarda el documento y espera la confirmación del servidor: la cuenta
     referencia al funcionario por FK, así que debe existir antes del POST. */
  persistFuncionarios: (next: Funcionario[], nextActivities?: Actividad[]) => Promise<void>;
}) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<{ fila: Fila | null } | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/users");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo cargar usuarios.");
      setUsers(json.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const filas = useMemo<Fila[]>(() => {
    const porFuncionario = new Map(users.filter((u) => u.funcionarioId).map((u) => [u.funcionarioId!, u]));
    const desdeFuncionarios: Fila[] = funcionarios.map((f) => {
      const user = porFuncionario.get(f.id);
      return {
        key: f.id,
        funcionario: f,
        user,
        nombre: f.nombre,
        cargo: f.cargo,
        email: user?.email || f.email,
        gestionId: f.gestionId,
        role: user?.role,
      };
    });
    const huerfanos: Fila[] = users
      .filter((u) => !u.funcionarioId || !funcionarios.some((f) => f.id === u.funcionarioId))
      .map((u) => ({
        key: `user:${u.id}`,
        user: u,
        nombre: u.nombre || u.email,
        cargo: "Cuenta sin funcionario",
        email: u.email,
        gestionId: "",
        role: u.role,
      }));
    return [...desdeFuncionarios, ...huerfanos].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [funcionarios, users]);

  const admins = filas.filter((f) => f.role === "admin").length;
  const usuarios = filas.filter((f) => f.role === "user").length;

  async function remove(fila: Fila) {
    if (fila.user?.id === currentUser.id) return;
    const etiqueta = fila.nombre || fila.email;
    if (
      !window.confirm(
        `¿Eliminar a ${etiqueta}? Se borrará su cuenta y sus actividades asignadas dejarán de estar visibles.`,
      )
    ) {
      return;
    }
    setError("");
    try {
      if (fila.user) {
        const res = await fetch(`/api/users?id=${encodeURIComponent(fila.user.id)}`, { method: "DELETE" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "No se pudo eliminar la cuenta.");
      }
      if (fila.funcionario) {
        const id = fila.funcionario.id;
        const nextActivities = activities
          .filter((item) => item.funcionarioId !== id)
          .map((item) => ({
            ...item,
            participantesIds: (item.participantesIds ?? []).filter((p) => p !== id),
          }));
        await persistFuncionarios(
          funcionarios.filter((f) => f.id !== id),
          nextActivities,
        );
      }
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return (
    <>
      <section className="overflow-hidden rounded-section border border-line bg-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3.5 px-4 pb-3.5 pt-[18px] sm:px-5">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h2 className="text-[16px] font-[750] tracking-[-.02em]">
              {filas.length} {filas.length === 1 ? "funcionario" : "funcionarios"}
            </h2>
            <span className="text-[12px] font-semibold text-ink-faint">
              {admins} {admins === 1 ? "administrador" : "administradores"} · {usuarios}{" "}
              {usuarios === 1 ? "usuario" : "usuarios"}
            </span>
          </div>
          <Button
            disabled={gestiones.length === 0}
            title={gestiones.length === 0 ? "Crea una gestión primero" : undefined}
            onClick={() => setDialog({ fila: null })}
          >
            <Icon name="plus" size={13} /> Nuevo funcionario
          </Button>
        </div>

        {error && (
          <div className="mx-4 mb-3 rounded-btn bg-estado-vencida-bg p-3 text-[12px] font-semibold text-estado-vencida-fg sm:mx-5">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 px-5 py-8 text-[13px] font-medium text-ink-faint">
            <Icon name="loader" size={16} className="animate-spin" />
            Cargando usuarios…
          </div>
        ) : (
          <>
            {/* móvil */}
            <div className="divide-y divide-line-soft sm:hidden">
              {filas.map((fila) => (
                <article key={fila.key} className="space-y-3 px-4 py-4">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar funcionario={fila.funcionario} useAvatars={useAvatars} size={32} />
                      <div className="min-w-0">
                        <div className="break-words text-[13px] font-[650]">{fila.nombre}</div>
                        <div className="mt-0.5 break-words text-[11px] text-ink-ghost">{fila.cargo}</div>
                      </div>
                    </div>
                    <AccesoBadge role={fila.role} />
                  </div>
                  <div className="break-all font-mono text-[11.5px] text-ink-ghost">{fila.email || "—"}</div>
                  {fila.gestionId && (
                    <Badge variant={gestionTone(fila.gestionId, gestiones)}>
                      {gestionNombre(fila.gestionId, gestiones)}
                    </Badge>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => setDialog({ fila })}>
                      <Icon name="edit" size={13} /> Editar
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={fila.user?.id === currentUser.id}
                      onClick={() => remove(fila)}
                    >
                      <Icon name="trash" size={13} /> Eliminar
                    </Button>
                  </div>
                </article>
              ))}
            </div>

            {/* escritorio */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-y border-line-soft bg-surface-subtle">
                    <th className="px-5 py-2.5 text-left text-[11px] font-bold text-ink-faint">Funcionario</th>
                    <th className="px-2.5 py-2.5 text-left text-[11px] font-bold text-ink-faint">Gestión</th>
                    <th className="px-2.5 py-2.5 text-left text-[11px] font-bold text-ink-faint">Email</th>
                    <th className="px-2.5 py-2.5 text-left text-[11px] font-bold text-ink-faint">Acceso</th>
                    <th className="px-5 py-2.5 text-right text-[11px] font-bold text-ink-faint">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((fila) => {
                    const esPropia = fila.user?.id === currentUser.id;
                    return (
                      <tr key={fila.key} className="border-b border-line-soft last:border-0 hover:bg-surface-subtle">
                        <td className="px-5 py-[11px]">
                          <div className="flex items-center gap-[11px]">
                            <Avatar funcionario={fila.funcionario} useAvatars={useAvatars} size={32} />
                            <div className="min-w-0">
                              <div className="truncate font-[650]">{fila.nombre}</div>
                              <div className="truncate text-[11px] text-ink-ghost">{fila.cargo}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2.5 py-[11px]">
                          {fila.gestionId ? (
                            <Badge variant={gestionTone(fila.gestionId, gestiones)}>
                              {gestionNombre(fila.gestionId, gestiones)}
                            </Badge>
                          ) : (
                            <span className="text-ink-disabled">—</span>
                          )}
                        </td>
                        <td className="px-2.5 py-[11px] font-mono text-[11.5px] text-ink-ghost">
                          {fila.email || "—"}
                        </td>
                        <td className="px-2.5 py-[11px]">
                          <AccesoBadge role={fila.role} />
                        </td>
                        <td className="px-5 py-[11px]">
                          <div className="flex justify-end gap-[7px]">
                            <button
                              type="button"
                              aria-label={`Editar a ${fila.nombre}`}
                              onClick={() => setDialog({ fila })}
                              className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-line bg-white text-ink-muted transition-colors hover:border-line-hover hover:bg-surface-subtle"
                            >
                              <Icon name="edit" size={13} />
                            </button>
                            <button
                              type="button"
                              aria-label={esPropia ? "No puedes eliminar tu propia cuenta" : `Eliminar a ${fila.nombre}`}
                              title={esPropia ? "No puedes eliminar tu propia cuenta" : "Eliminar"}
                              disabled={esPropia}
                              onClick={() => remove(fila)}
                              className={cn(
                                "flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-estado-vencida text-white transition-colors hover:bg-[#E11D48]",
                                esPropia && "cursor-not-allowed opacity-45 hover:bg-estado-vencida",
                              )}
                            >
                              <Icon name="trash" size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {dialog && (
        <FuncionarioDialog
          fila={dialog.fila}
          funcionarios={funcionarios}
          setFuncionarios={setFuncionarios}
          gestiones={gestiones}
          currentUserId={currentUser.id}
          persistFuncionarios={persistFuncionarios}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            setDialog(null);
            await loadUsers();
          }}
        />
      )}
    </>
  );
}

function AccesoBadge({ role }: { role?: UserRole }) {
  if (!role) return <Badge variant="outline">Sin cuenta</Badge>;
  return <Badge variant={role === "admin" ? "blue" : "slate"}>{role === "admin" ? "Admin" : "User"}</Badge>;
}

/* ── Diálogo Nuevo / Editar funcionario ─────────────────────────────── */

function FuncionarioDialog({
  fila,
  funcionarios,
  setFuncionarios,
  gestiones,
  currentUserId,
  persistFuncionarios,
  onClose,
  onSaved,
}: {
  fila: Fila | null;
  funcionarios: Funcionario[];
  setFuncionarios: React.Dispatch<React.SetStateAction<Funcionario[]>>;
  gestiones: Gestion[];
  currentUserId: string;
  persistFuncionarios: (next: Funcionario[]) => Promise<void>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editando = Boolean(fila);
  // Sin cuenta previa la contraseña vuelve a ser obligatoria aunque se edite.
  const creandoCuenta = !fila?.user;

  const [nombre, setNombre] = useState(fila?.nombre ?? "");
  const [cargo, setCargo] = useState(fila?.funcionario?.cargo ?? "");
  const [gestionId, setGestionId] = useState(fila?.gestionId || gestiones[0]?.id || "");
  const [email, setEmail] = useState(fila?.email ?? "");
  const [role, setRole] = useState<UserRole>(fila?.role ?? "user");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const editandoSelf = fila?.user?.id === currentUserId;
  const rolEfectivo: UserRole = editandoSelf ? "admin" : role;
  const faltanCaracteres = password.length > 0 && password.length < 8 ? 8 - password.length : 0;
  const passwordInvalida = creandoCuenta ? password.length < 8 : faltanCaracteres > 0;
  const invalido = !nombre.trim() || !email.trim() || passwordInvalida;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (invalido || saving) return;
    setError("");
    setSaving(true);
    const previos = funcionarios;
    try {
      const datos = {
        nombre: nombre.trim(),
        cargo: cargo.trim(),
        gestionId,
        email: email.trim().toLowerCase(),
      };

      let funcionarioId = fila?.funcionario?.id ?? null;
      if (fila?.funcionario) {
        await persistFuncionarios(
          funcionarios.map((f) => (f.id === fila.funcionario!.id ? { ...f, ...datos } : f)),
        );
      } else {
        const nuevo: Funcionario = {
          id: nextFuncionarioId(funcionarios),
          ...datos,
          color: CATALOG_COLORS[funcionarios.length % CATALOG_COLORS.length],
        };
        funcionarioId = nuevo.id;
        // El funcionario debe existir en la base antes de crear la cuenta.
        await persistFuncionarios([...funcionarios, nuevo]);
      }

      const payload = {
        id: fila?.user?.id,
        email: datos.email,
        nombre: datos.nombre,
        role: rolEfectivo,
        funcionarioId,
        password,
      };
      const res = await fetch("/api/users", {
        method: fila?.user ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo guardar la cuenta.");
      onSaved();
    } catch (err) {
      // Si la cuenta falla, el funcionario recién creado no debe quedarse suelto.
      if (!fila?.funcionario) {
        await persistFuncionarios(previos).catch(() => setFuncionarios(previos));
      }
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  const campo =
    "h-[42px] w-full rounded-input border border-line-dashed bg-white px-3.5 text-[13.5px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-disabled focus:border-accent-border focus:ring-[3px] focus:ring-accent/10";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-[rgba(18,18,26,.32)] backdrop-blur-[3px]" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative z-10 max-h-[calc(100dvh-1.5rem)] w-full max-w-[600px] overflow-y-auto rounded-modal bg-white p-5 shadow-modal sm:p-6"
      >
        <div className="flex items-start justify-between gap-3.5">
          <div className="min-w-0">
            <div className="text-[18px] font-extrabold tracking-[-.025em]">
              {editando ? "Editar funcionario" : "Nuevo funcionario"}
            </div>
            <div className="mt-[3px] text-[12.5px] text-ink-faint">
              Datos del funcionario y su acceso a la plataforma
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

        <div className="mt-5 flex flex-col gap-3.5">
          <div className="text-[10px] font-[750] uppercase tracking-[.06em] text-ink-label">
            Datos del funcionario
          </div>

          <div className="flex flex-col gap-[7px]">
            <Label htmlFor="func-nombre">
              Nombre <span className="text-estado-vencida-fg">*</span>
            </Label>
            <input
              id="func-nombre"
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="p. ej. Kevin Zambrano"
              className={campo}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-[7px]">
              <Label htmlFor="func-cargo">Cargo</Label>
              <input
                id="func-cargo"
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
                placeholder="p. ej. Especialista de Saneamiento"
                className={campo}
              />
            </div>
            <div className="flex flex-col gap-[7px]">
              <Label htmlFor="func-gestion">Gestión</Label>
              <Select
                id="func-gestion"
                value={gestionId}
                onChange={(e) => setGestionId(e.target.value)}
                className="!h-[42px] !rounded-input border-line-dashed !text-[13.5px]"
              >
                {gestiones.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nombre}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-[7px]">
            <Label htmlFor="func-email">
              Email institucional <span className="text-estado-vencida-fg">*</span>
            </Label>
            <input
              id="func-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@dgtar.gob.ec"
              className={cn(campo, "font-mono")}
            />
            <div className="text-[11px] text-ink-ghost">También es el correo con el que inicia sesión.</div>
          </div>

          <div className="mt-1 border-t border-line-soft pt-4">
            <div className="text-[10px] font-[750] uppercase tracking-[.06em] text-ink-label">
              Acceso a la plataforma
            </div>
            <div className="mt-1 text-[11.5px] font-medium text-ink-faint">
              Inicia sesión con su email institucional y aparece como{" "}
              <b className="font-bold text-ink-soft">{nombre.trim() || "—"}</b>
            </div>
          </div>

          <div className="flex flex-col gap-3.5 rounded-card border border-line-soft bg-surface-subtle p-4">
            <div className="flex flex-col gap-2">
              <Label>Rol</Label>
              <div className="inline-flex self-start gap-1 rounded-input bg-track p-1">
                {(["user", "admin"] as UserRole[]).map((valor) => (
                  <button
                    key={valor}
                    type="button"
                    disabled={editandoSelf}
                    onClick={() => setRole(valor)}
                    className={cn(
                      "h-8 rounded-[9px] px-3.5 text-[12.5px] font-[650] transition-colors disabled:opacity-60",
                      rolEfectivo === valor ? "bg-white text-ink shadow-seg" : "text-ink-muted hover:text-ink",
                    )}
                  >
                    {valor === "admin" ? "Admin" : "User"}
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-ink-ghost">
                {editandoSelf
                  ? "No puedes quitarte a ti mismo el rol de administrador."
                  : rolEfectivo === "admin"
                    ? "Gestiona catálogos, usuarios y todas las actividades."
                    : "Ve y edita solo las actividades en las que participa."}
              </div>
            </div>

            <div className="flex flex-col gap-[7px]">
              <Label htmlFor="func-pass">{creandoCuenta ? "Contraseña" : "Nueva contraseña"}</Label>
              <input
                id="func-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className={cn(campo, faltanCaracteres > 0 && "border-estado-vencida focus:border-estado-vencida")}
              />
              <div
                className={cn(
                  "text-[11px]",
                  faltanCaracteres > 0 ? "font-semibold text-estado-vencida-fg" : "text-ink-ghost",
                )}
              >
                {faltanCaracteres > 0
                  ? `Faltan ${faltanCaracteres} ${faltanCaracteres === 1 ? "caracter" : "caracteres"}`
                  : creandoCuenta
                    ? "Mínimo 8 caracteres."
                    : "Vacía mantiene la contraseña actual."}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 break-words rounded-btn bg-estado-vencida-bg p-3 text-[12px] font-semibold text-estado-vencida-fg">
            {error}
          </div>
        )}

        <div className="mt-[22px] flex items-center justify-end gap-2.5">
          <Button type="button" variant="outline" className="!h-10 !rounded-input !px-4" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            className="!h-10 !rounded-input !px-4"
            disabled={invalido || saving}
            title={invalido ? "Completa nombre, email y contraseña" : undefined}
          >
            {saving ? <Icon name="loader" size={14} className="animate-spin" /> : <Icon name="check" size={14} />}
            {editando ? "Guardar cambios" : "Crear funcionario"}
          </Button>
        </div>
      </form>
    </div>
  );
}
