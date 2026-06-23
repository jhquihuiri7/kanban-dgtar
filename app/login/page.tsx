"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Button, Icon, Input, Label } from "@/components/ui";

type Mode = "login" | "forgot" | "reset";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [token, setToken] = useState("");
  const [nextUrl, setNextUrl] = useState("/");
  const [resetUrl, setResetUrl] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reset = params.get("reset");
    if (reset) {
      setToken(reset);
      setMode("reset");
    }
    setNextUrl(params.get("next") || "/");
  }, []);

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo iniciar sesión.");
      window.location.href = nextUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setResetUrl("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/request-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo generar el enlace.");
      setMessage(json?.message || "Solicitud enviada.");
      if (json?.resetUrl) setResetUrl(json.resetUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: newPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo cambiar la contraseña.");
      setMessage("Contraseña actualizada. Ya puedes iniciar sesión.");
      setMode("login");
      setPassword("");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-900">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl ring-1 ring-foreground/10">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Icon name="kanban" size={18} />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">Kanban de Seguimiento</h1>
            <p className="text-xs text-slate-500">DGTAR</p>
          </div>
        </div>

        {mode === "login" && (
          <form className="space-y-3" onSubmit={submitLogin}>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <Button className="w-full" type="submit" disabled={loading || !email || !password}>
              {loading ? <Icon name="loader" size={14} className="animate-spin" /> : <Icon name="check" size={14} />}
              Iniciar sesión
            </Button>
            <button
              type="button"
              className="w-full text-center text-xs font-medium text-slate-500 hover:text-slate-900"
              onClick={() => {
                setMode("forgot");
                setError("");
                setMessage("");
              }}
            >
              Recuperar contraseña
            </button>
          </form>
        )}

        {mode === "forgot" && (
          <form className="space-y-3" onSubmit={requestReset}>
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <Button className="w-full" type="submit" disabled={loading || !email}>
              {loading ? <Icon name="loader" size={14} className="animate-spin" /> : <Icon name="refresh" size={14} />}
              Generar enlace
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setMode("login")}>
              Volver al login
            </Button>
          </form>
        )}

        {mode === "reset" && (
          <form className="space-y-3" onSubmit={submitReset}>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Nueva contraseña</Label>
              <Input
                id="new-password"
                type="password"
                autoFocus
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <Button className="w-full" type="submit" disabled={loading || newPassword.length < 8}>
              {loading ? <Icon name="loader" size={14} className="animate-spin" /> : <Icon name="check" size={14} />}
              Actualizar contraseña
            </Button>
          </form>
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-xs font-medium text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        )}
        {message && (
          <div className="mt-4 rounded-lg bg-green-50 p-3 text-xs font-medium text-green-700 ring-1 ring-green-200">
            {message}
            {resetUrl && (
              <a className="mt-2 block underline" href={resetUrl}>
                Abrir enlace de recuperación
              </a>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
