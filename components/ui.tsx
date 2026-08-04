"use client";

import * as React from "react";
import {
  Kanban,
  BarChart3,
  List,
  Plus,
  Search,
  Filter,
  User,
  Users,
  MoreHorizontal,
  X,
  Check,
  Clock,
  Calendar,
  Pencil,
  Trash2,
  ArrowRight,
  AlertTriangle,
  Flame,
  GripVertical,
  Download,
  TreePine,
  Shield,
  Map as MapIcon,
  Briefcase,
  TrendingUp,
  Zap,
  Inbox,
  CheckCircle2,
  Loader2,
  RefreshCw,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Target,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { initials, type Funcionario, type BadgeVariant } from "@/lib/data";

/* ── Button ─────────────────────────────────────────────────────────── */

type ButtonVariant =
  | "default"
  | "outline"
  | "secondary"
  | "ghost"
  | "destructive"
  | "link";
type ButtonSize = "default" | "sm" | "lg" | "icon";
type ButtonShape = "btn" | "pill";

export function Button({
  variant = "default",
  size = "default",
  shape = "btn",
  className = "",
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /* «Botón/insignia píldora 999px · Botón cuadrado 10px» */
  shape?: ButtonShape;
}) {
  const base =
    "inline-flex touch-manipulation items-center justify-center gap-1.5 whitespace-nowrap text-[13px] font-[650] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-50 disabled:pointer-events-none sm:text-[12.5px]";
  const shapes: Record<ButtonShape, string> = {
    btn: "rounded-btn",
    pill: "rounded-full",
  };
  const variants: Record<ButtonVariant, string> = {
    default: "bg-ink text-white shadow-primary hover:bg-ink-hover",
    outline: "border border-line-strong bg-white text-ink shadow-card hover:border-line-hover hover:bg-surface-subtle",
    secondary: "bg-estado-pendiente-bg text-ink hover:bg-chip",
    ghost: "text-ink-muted hover:bg-estado-pendiente-bg hover:text-ink",
    destructive: "bg-estado-vencida text-white hover:bg-[#E11D48]",
    link: "text-accent underline-offset-4 hover:underline",
  };
  const sizes: Record<ButtonSize, string> = {
    default: "h-11 px-3.5 sm:h-[34px] sm:px-[13px]",
    sm: "h-11 px-3 sm:h-[30px] sm:px-2.5 sm:text-[12px]",
    lg: "h-11 px-4 sm:h-10 sm:px-4",
    icon: "h-11 w-11 sm:h-[34px] sm:w-[34px]",
  };
  return (
    <button
      className={cn(base, shapes[shape], variants[variant], sizes[size], className)}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ── Badge ──────────────────────────────────────────────────────────── */

export function Badge({
  variant = "default",
  className = "",
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}) {
  const map: Record<BadgeVariant, string> = {
    default: "bg-estado-pendiente-bg text-estado-pendiente-fg",
    outline: "border border-line bg-white text-ink-muted",
    green: "bg-estado-cumplida-bg text-estado-cumplida-fg",
    amber: "bg-estado-revision-bg text-estado-revision-fg",
    red: "bg-estado-vencida-bg text-estado-vencida-fg",
    blue: "bg-estado-progreso-bg text-estado-progreso-fg",
    violet: "bg-accent-soft text-accent",
    slate: "bg-estado-pendiente-bg text-estado-pendiente-fg",
    teal: "bg-[#E6F7F5] text-[#0F766E]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-[9px] py-0.5 text-[10.5px] font-bold leading-[1.5]",
        map[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── Form controls ──────────────────────────────────────────────────── */

export function Input({
  className = "",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-11 min-w-0 w-full touch-manipulation rounded-input border border-line-strong bg-white px-3 py-2 text-base font-medium text-ink placeholder:font-normal placeholder:text-ink-faint focus-visible:border-accent-border focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/10 sm:h-[38px] sm:text-[13px]",
        className,
      )}
      {...rest}
    />
  );
}
export function Textarea({
  className = "",
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-11 min-w-0 w-full touch-manipulation rounded-input border border-line-strong bg-white px-3 py-2 text-base font-medium text-ink placeholder:font-normal placeholder:text-ink-faint focus-visible:border-accent-border focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/10 sm:min-h-0 sm:text-[13px]",
        className,
      )}
      {...rest}
    />
  );
}
export function Select({
  className = "",
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "flex h-11 min-w-0 w-full touch-manipulation rounded-input border border-line-strong bg-white px-3 py-1.5 text-base font-medium text-ink focus-visible:border-accent-border focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/10 sm:h-[38px] sm:text-[13px]",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}
export function Label({
  className = "",
  children,
  ...rest
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("text-[11.5px] font-bold text-ink-soft", className)} {...rest}>
      {children}
    </label>
  );
}

/* ── Avatar ─────────────────────────────────────────────────────────── */

/* El handoff pide gradientes «color → color oscuro» equivalentes al paso 500→600
   de la paleta (#0ea5e9→#0284c7). Un factor multiplicativo lo aproxima sin
   tabla fija y sin recortar canales como hacía la resta plana. */
export function darken(hex: string, factor = 0.82): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((n >> shift) & 0xff) * factor)));
  return "#" + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0");
}

export function avatarGradient(color: string): string {
  return `linear-gradient(135deg, ${color}, ${darken(color)})`;
}

export function Avatar({
  funcionario,
  useAvatars = true,
  size = 28,
  className = "",
}: {
  funcionario?: Funcionario;
  useAvatars?: boolean;
  size?: number;
  className?: string;
}) {
  if (!funcionario) return null;
  const dim = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (useAvatars) {
    return (
      <div
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white",
          className,
        )}
        style={{ ...dim, background: avatarGradient(funcionario.color) }}
        title={funcionario.nombre}
      >
        {initials(funcionario.nombre)}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-estado-pendiente-bg font-bold text-ink-muted",
        className,
      )}
      style={dim}
      title={funcionario.nombre}
    >
      {initials(funcionario.nombre)}
    </div>
  );
}

/* ── Icons (lucide-react, mapped to the prototype's names) ──────────── */

export type IconName =
  | "kanban"
  | "chart"
  | "list"
  | "plus"
  | "search"
  | "filter"
  | "user"
  | "users"
  | "more"
  | "close"
  | "check"
  | "clock"
  | "calendar"
  | "edit"
  | "trash"
  | "arrow"
  | "alert"
  | "flame"
  | "drag"
  | "download"
  | "tree"
  | "shield"
  | "map"
  | "briefcase"
  | "trending"
  | "zap"
  | "inbox"
  | "checkCircle"
  | "loader"
  | "refresh"
  | "logout"
  | "chevronLeft"
  | "chevronRight"
  | "chevronDown"
  | "target"
  | "fileText";

const ICONS: Record<IconName, LucideIcon> = {
  kanban: Kanban,
  chart: BarChart3,
  list: List,
  plus: Plus,
  search: Search,
  filter: Filter,
  user: User,
  users: Users,
  more: MoreHorizontal,
  close: X,
  check: Check,
  clock: Clock,
  calendar: Calendar,
  edit: Pencil,
  trash: Trash2,
  arrow: ArrowRight,
  alert: AlertTriangle,
  flame: Flame,
  drag: GripVertical,
  download: Download,
  tree: TreePine,
  shield: Shield,
  map: MapIcon,
  briefcase: Briefcase,
  trending: TrendingUp,
  zap: Zap,
  inbox: Inbox,
  checkCircle: CheckCircle2,
  loader: Loader2,
  refresh: RefreshCw,
  logout: LogOut,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  target: Target,
  fileText: FileText,
};

export function Icon({
  name,
  size = 16,
  className = "",
  style,
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
}) {
  const C = ICONS[name];
  return <C size={size} className={className} style={style} strokeWidth={strokeWidth} />;
}

/* ── click-outside helper ───────────────────────────────────────────── */

export function useClickAway(
  ref: React.RefObject<HTMLElement>,
  onAway: () => void,
) {
  React.useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onAway();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [ref, onAway]);
}
