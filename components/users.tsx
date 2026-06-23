"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Icon, Input, Label, Select } from "@/components/ui";
import type { AuthUser, UserRole } from "@/lib/auth-token";
import type { Funcionario } from "@/lib/data";

interface ManagedUser extends AuthUser {
  funcionarioNombre: string | null;
  createdAt: string;
  updatedAt: string;
}

const emptyUser: ManagedUser = {
  id: "",
  email: "",
  nombre: "",
  role: "user",
  funcionarioId: null,
  funcionarioNombre: null,
  createdAt: "",
  updatedAt: "",
};

export function UsersView({
  funcionarios,
  currentUser,
}: {
  funcionarios: Funcionario[];
  currentUser: AuthUser;
}) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [creating, setCreating] = useState(false);

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

  async function remove(user: ManagedUser) {
    if (user.id === currentUser.id) return;
    setError("");
    try {
      const res = await fetch(`/api/users?id=${encodeURIComponent(user.id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo eliminar.");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex items-center justify-between !pb-2">
          <CardTitle>Usuarios</CardTitle>
          <Button onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} /> Nuevo usuario
          </Button>
        </CardHeader>
        <CardContent className="!px-0">
          {error && (
            <div className="mx-4 mb-3 rounded-lg bg-red-50 p-3 text-xs font-medium text-red-700 ring-1 ring-red-200">
              {error}
            </div>
          )}
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500">
              <Icon name="loader" size={16} className="animate-spin" />
              Cargando usuarios…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-2 text-left font-medium">Usuario</th>
                    <th className="px-2 py-2 text-left font-medium">Rol</th>
                    <th className="px-2 py-2 text-left font-medium">Funcionario vinculado</th>
                    <th className="px-4 py-2 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-900">{user.nombre || user.email}</div>
                        <div className="font-mono text-xs text-slate-500">{user.email}</div>
                      </td>
                      <td className="px-2 py-2.5">
                        <Badge variant={user.role === "admin" ? "blue" : "slate"}>
                          {user.role === "admin" ? "Admin" : "User"}
                        </Badge>
                      </td>
                      <td className="px-2 py-2.5 text-slate-700">
                        {user.role === "admin" ? "Acceso global" : user.funcionarioNombre || "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="outline" size="icon" title="Editar usuario" onClick={() => setEditing(user)}>
                            <Icon name="edit" size={14} />
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            title="Eliminar usuario"
                            disabled={user.id === currentUser.id}
                            onClick={() => remove(user)}
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
          )}
        </CardContent>
      </Card>

      {(creating || editing) && (
        <UserDialog
          user={editing ?? emptyUser}
          creating={creating}
          funcionarios={funcionarios}
          currentUserId={currentUser.id}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            await loadUsers();
          }}
        />
      )}
    </div>
  );
}

function UserDialog({
  user,
  creating,
  funcionarios,
  currentUserId,
  onClose,
  onSaved,
}: {
  user: ManagedUser;
  creating: boolean;
  funcionarios: Funcionario[];
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState(user.email);
  const [nombre, setNombre] = useState(user.nombre);
  const [role, setRole] = useState<UserRole>(user.role);
  const [funcionarioId, setFuncionarioId] = useState(user.funcionarioId ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const editingSelf = !creating && user.id === currentUserId;
  const effectiveRole = editingSelf ? "admin" : role;

  React.useEffect(() => {
    if (effectiveRole === "admin" && funcionarioId) setFuncionarioId("");
  }, [effectiveRole, funcionarioId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = {
        id: user.id,
        email,
        nombre,
        role: effectiveRole,
        funcionarioId: effectiveRole === "admin" ? null : funcionarioId || null,
        password,
      };
      const res = await fetch("/api/users", {
        method: creating ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo guardar.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={submit} className="relative z-10 w-full max-w-md rounded-xl bg-white p-5 ring-1 ring-foreground/10 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-base font-semibold text-slate-900">
              {creating ? "Nuevo usuario" : "Editar usuario"}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">Email, rol y funcionario vinculado</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="user-email">Email</Label>
            <Input id="user-email" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-name">Nombre visible</Label>
            <Input id="user-name" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="user-role">Rol</Label>
              <Select
                id="user-role"
                value={effectiveRole}
                disabled={editingSelf}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                <option value="admin">Admin</option>
                <option value="user">User</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-funcionario">Funcionario</Label>
              {effectiveRole === "admin" ? (
                <div className="flex h-9 items-center rounded-lg bg-slate-50 px-3 text-sm text-slate-500 ring-1 ring-foreground/5">
                  Acceso global
                </div>
              ) : (
                <Select id="user-funcionario" value={funcionarioId} onChange={(e) => setFuncionarioId(e.target.value)}>
                  <option value="">Sin vínculo</option>
                  {funcionarios.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nombre}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-password">{creating ? "Contraseña" : "Nueva contraseña"}</Label>
            <Input
              id="user-password"
              type="password"
              value={password}
              placeholder={creating ? "" : "Dejar vacío para conservar"}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-xs font-medium text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || !email || (creating && password.length < 8)}>
            {saving ? <Icon name="loader" size={14} className="animate-spin" /> : <Icon name="check" size={14} />}
            Guardar
          </Button>
        </div>
      </form>
    </div>
  );
}
