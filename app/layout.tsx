import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

/* Fuente variable: los pesos intermedios del handoff (550/650/750) sólo se
   renderizan correctamente con el eje continuo, no con instancias estáticas. */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
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
