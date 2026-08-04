import type { Config } from "tailwindcss";

/* Tokens del rediseño (design_handoff_kanban_dgtar/README.md → «Design tokens»).
   Las escalas de Tailwind (slate/violet/…) siguen disponibles mientras las
   pantallas se migran pantalla por pantalla. */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic aliases used across the style guide
        foreground: "rgb(15 23 42)",
        background: "rgb(248 250 252)",
        border: "rgb(226 232 240)",
        "muted-foreground": "rgb(100 116 139)",

        // Superficies
        app: "#F4F4F6",
        column: "#EFEFF2",
        surface: {
          DEFAULT: "#FFFFFF",
          subtle: "#FAFAFB",
          muted: "#F7F7F9",
        },
        // Bordes y separadores
        line: {
          DEFAULT: "#ECECEF",
          hover: "#DCDCE3",
          strong: "#E9E9ED",
          soft: "#F1F1F4",
          dashed: "#E4E4E9",
        },
        // Texto
        ink: {
          DEFAULT: "#12121A",
          hover: "#26262F",
          soft: "#4B4B57",
          muted: "#5B5B69",
          faint: "#8A8A99",
          ghost: "#9C9CAA",
          disabled: "#C4C4CE",
          label: "#B4B4C2",
        },
        // Acento (selección, hoy, activo)
        accent: {
          DEFAULT: "#6D28D9",
          soft: "#F1EBFF",
          softer: "#F7F2FF",
          border: "#DCC9FA",
        },
        // Track de segmentos y píldoras de conteo
        track: "#EDEDF1",
        chip: "#E7E7EC",
        // Estados de actividad: punto/barra, fondo de insignia y texto
        estado: {
          pendiente: "#A5A5B3",
          "pendiente-bg": "#F2F2F5",
          "pendiente-fg": "#5B5B69",
          progreso: "#3B82F6",
          "progreso-bg": "#E9F1FE",
          "progreso-fg": "#1D4ED8",
          revision: "#F59E0B",
          "revision-bg": "#FEF4E2",
          "revision-fg": "#B45309",
          cumplida: "#10B981",
          "cumplida-bg": "#E7F8F1",
          "cumplida-fg": "#0B7A5A",
          vencida: "#F43F5E",
          "vencida-bg": "#FEECEF",
          "vencida-fg": "#C81E45",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-jakarta)",
          "Plus Jakarta Sans",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "Menlo", "Monaco", "monospace"],
      },
      borderRadius: {
        btn: "10px",
        input: "11px",
        card: "14px",
        kpi: "16px",
        section: "20px",
        modal: "22px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(18,18,26,.03)",
        "card-hover": "0 4px 14px rgba(18,18,26,.07)",
        primary: "0 2px 8px rgba(18,18,26,.22)",
        popover: "0 14px 38px rgba(18,18,26,.16)",
        modal: "0 24px 64px rgba(18,18,26,.24)",
        panel: "-18px 0 48px rgba(18,18,26,.16)",
        seg: "0 1px 3px rgba(18,18,26,.10)",
        pill: "0 0 0 1px rgba(109,40,217,.18), 0 2px 10px rgba(109,40,217,.16)",
        avatar: "0 0 0 2px #fff, 0 0 0 3px #E9E9ED",
        "avatar-active": "0 0 0 2px #fff, 0 0 0 3px #6D28D9",
      },
    },
  },
  plugins: [],
};

export default config;
