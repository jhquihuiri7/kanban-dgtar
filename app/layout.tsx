import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

/* Fuente variable autoalojada. Se sirve desde el repo en lugar de
   `next/font/google` porque ese cargador descarga los .woff2 durante el build,
   y el build de Docker falla si no alcanza fonts.gstatic.com. El eje continuo
   es necesario para los pesos intermedios del handoff (550/650/750). */
const jakarta = localFont({
  src: [
    { path: "./fonts/PlusJakartaSans-latin.woff2", style: "normal" },
    { path: "./fonts/PlusJakartaSans-latin-ext.woff2", style: "normal" },
  ],
  weight: "200 800",
  display: "swap",
  variable: "--font-jakarta",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Kanban de Seguimiento · DGTAR",
  description:
    "Tablero de seguimiento de actividades — Dirección de Planificación · Plataforma Ambiental",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={jakarta.variable}>
      <body className="bg-app font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
