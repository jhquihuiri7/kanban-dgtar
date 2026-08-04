"use client";

import Image from "next/image";
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

  const heading = {
    login: {
      title: "Inicia sesión en tu cuenta",
      description: "Ingresa tus credenciales para acceder al tablero.",
    },
    forgot: {
      title: "Recupera tu contraseña",
      description: "Ingresa tu correo para generar un enlace de recuperación.",
    },
    reset: {
      title: "Actualiza tu contraseña",
      description: "Define una nueva contraseña para continuar.",
    },
  }[mode];

  return (
    <main className="grid min-h-svh bg-white text-ink lg:grid-cols-2">
      <section className="flex min-h-svh flex-col gap-3 p-4 sm:gap-4 sm:p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="/" className="flex min-h-11 touch-manipulation items-center gap-[11px] sm:min-h-0">
            <div className="flex h-[38px] w-[38px] items-center justify-center rounded-xl bg-ink text-white shadow-[0_2px_6px_rgba(18,18,26,.18)]">
              <Icon name="kanban" size={19} />
            </div>
            <div className="flex flex-col gap-px">
              <div className="text-[14px] font-bold leading-[1.15] tracking-[-.02em]">Kanban DGTAR</div>
              <div className="text-[10.5px] font-medium leading-[1.15] text-ink-faint">
                Dirección de Planificación
              </div>
            </div>
          </a>
        </div>

        <div className="flex flex-1 items-center justify-center py-4 sm:py-0">
          <div className="flex w-full max-w-[360px] flex-col gap-5 sm:gap-6">
            <div className="flex flex-col items-center gap-1.5 text-center">
              <h1 className="text-[20px] font-extrabold leading-[1.15] tracking-[-.03em] sm:text-[23px]">
                {heading.title}
              </h1>
              <p className="text-[12.5px] font-medium text-ink-faint">{heading.description}</p>
            </div>

            {mode === "login" && (
              <form className="flex flex-col gap-4 sm:gap-5" onSubmit={submitLogin}>
                <div className="flex flex-col gap-[7px]">
                  <Label htmlFor="email">
                    Correo electrónico
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    autoFocus
                    placeholder="usuario@ejemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    required
                    className="sm:!h-[42px] sm:!text-[13.5px]"
                  />
                </div>

                <div className="flex flex-col gap-[7px]">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Label htmlFor="password">
                      Contraseña
                    </Label>
                    <button
                      type="button"
                      className="ml-auto inline-flex min-h-11 touch-manipulation items-center text-right text-[11.5px] font-[650] text-accent underline-offset-4 hover:underline sm:min-h-0"
                      onClick={() => {
                        setMode("forgot");
                        setError("");
                        setMessage("");
                      }}
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Ingresa tu contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className="sm:!h-[42px] sm:!text-[13.5px]"
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-input bg-estado-vencida-bg px-3.5 py-2.5 text-[12px] font-semibold text-estado-vencida-fg"
                  >
                    {error}
                  </div>
                )}

                <Button className="w-full sm:!h-11 sm:!text-[13.5px]" type="submit" disabled={loading || !email || !password} aria-busy={loading}>
                  {loading && <Icon name="loader" size={14} className="animate-spin" />}
                  {loading ? "Iniciando sesión..." : "Iniciar sesión"}
                </Button>
              </form>
            )}

            {mode === "forgot" && (
              <form className="flex flex-col gap-4 sm:gap-5" onSubmit={requestReset}>
                <div className="flex flex-col gap-[7px]">
                  <Label htmlFor="forgot-email">
                    Correo electrónico
                  </Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    autoFocus
                    placeholder="usuario@ejemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    required
                    className="sm:!h-[42px] sm:!text-[13.5px]"
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-input bg-estado-vencida-bg px-3.5 py-2.5 text-[12px] font-semibold text-estado-vencida-fg"
                  >
                    {error}
                  </div>
                )}

                {message && (
                  <div
                    role="status"
                    className="rounded-input bg-estado-cumplida-bg px-3.5 py-2.5 text-[12px] font-semibold text-estado-cumplida-fg"
                  >
                    {message}
                    {resetUrl && (
                      <a className="mt-2 block break-all font-mono text-[11.5px] underline underline-offset-4" href={resetUrl}>
                        Abrir enlace de recuperación
                      </a>
                    )}
                  </div>
                )}

                <Button className="w-full sm:!h-11 sm:!text-[13.5px]" type="submit" disabled={loading || !email} aria-busy={loading}>
                  {loading && <Icon name="loader" size={14} className="animate-spin" />}
                  {loading ? "Generando enlace..." : "Generar enlace"}
                </Button>
                <Button type="button" variant="ghost" className="w-full sm:!h-11 sm:!text-[13.5px]" onClick={() => setMode("login")}>
                  Volver al login
                </Button>
              </form>
            )}

            {mode === "reset" && (
              <form className="flex flex-col gap-4 sm:gap-5" onSubmit={submitReset}>
                <div className="flex flex-col gap-[7px]">
                  <Label htmlFor="new-password">
                    Nueva contraseña
                  </Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoFocus
                    placeholder="Ingresa tu nueva contraseña"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    className="sm:!h-[42px] sm:!text-[13.5px]"
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-input bg-estado-vencida-bg px-3.5 py-2.5 text-[12px] font-semibold text-estado-vencida-fg"
                  >
                    {error}
                  </div>
                )}

                {message && (
                  <div
                    role="status"
                    className="rounded-input bg-estado-cumplida-bg px-3.5 py-2.5 text-[12px] font-semibold text-estado-cumplida-fg"
                  >
                    {message}
                  </div>
                )}

                <Button className="w-full sm:!h-11 sm:!text-[13.5px]" type="submit" disabled={loading || newPassword.length < 8} aria-busy={loading}>
                  {loading && <Icon name="loader" size={14} className="animate-spin" />}
                  {loading ? "Actualizando contraseña..." : "Actualizar contraseña"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="relative hidden bg-app lg:block">
        <Image
          src="/imgs/geo/login.png"
          alt="Vista aérea costera del geoportal ambiental"
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
      </section>
    </main>
  );
}
