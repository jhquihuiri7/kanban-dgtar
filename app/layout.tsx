import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kanban de Seguimiento · DGTAR",
  description:
    "Tablero de seguimiento de actividades — Dirección de Planificación · Plataforma Ambiental",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
