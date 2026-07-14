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

export function Button({
  variant = "default",
  size = "default",
  className = "",
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const base =
    "inline-flex touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 disabled:opacity-50 disabled:pointer-events-none";
  const variants: Record<ButtonVariant, string> = {
    default: "bg-slate-900 text-white hover:bg-slate-800",
    outline: "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
    secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200",
    ghost: "text-slate-700 hover:bg-slate-100",
    destructive: "bg-red-600 text-white hover:bg-red-700",
    link: "text-slate-900 underline-offset-4 hover:underline",
  };
  const sizes: Record<ButtonSize, string> = {
    default: "h-11 px-3 sm:h-8",
    sm: "h-11 px-3 text-sm sm:h-7 sm:px-2.5 sm:text-xs",
    lg: "h-11 px-4 sm:h-10",
    icon: "h-11 w-11 sm:h-8 sm:w-8",
  };
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {children}
    </button>
  );
}

/* ── Card ───────────────────────────────────────────────────────────── */

export function Card({
  className = "",
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl bg-white ring-1 ring-foreground/10", className)} {...rest}>
      {children}
    </div>
  );
}
export function CardHeader({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("px-4 pt-4 pb-2", className)}>{children}</div>;
}
export function CardTitle({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("text-base font-semibold tracking-tight", className)}>{children}</div>;
}
export function CardContent({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("px-4 pb-4", className)}>{children}</div>;
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
    default: "bg-slate-100 text-slate-700 border border-slate-200",
    outline: "bg-white text-slate-700 border border-slate-200",
    green: "bg-green-50 text-green-700 border border-green-200",
    amber: "bg-amber-50 text-amber-700 border border-amber-200",
    red: "bg-red-50 text-red-700 border border-red-200",
    blue: "bg-blue-50 text-blue-700 border border-blue-200",
    violet: "bg-violet-50 text-violet-700 border border-violet-200",
    slate: "bg-slate-50 text-slate-600 border border-slate-200",
    teal: "bg-teal-50 text-teal-700 border border-teal-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
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
        "flex h-11 min-w-0 w-full touch-manipulation rounded-lg border border-slate-200 bg-white px-3 py-2 text-base placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 sm:h-9 sm:text-sm",
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
        "flex min-h-11 min-w-0 w-full touch-manipulation rounded-lg border border-slate-200 bg-white px-3 py-2 text-base placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 sm:min-h-0 sm:text-sm",
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
        "flex h-11 min-w-0 w-full touch-manipulation rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 sm:h-9 sm:text-sm",
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
    <label className={cn("text-xs font-medium text-slate-700", className)} {...rest}>
      {children}
    </label>
  );
}

/* ── Avatar ─────────────────────────────────────────────────────────── */

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  let r = (n >> 16) + amt;
  let g = ((n >> 8) & 0xff) + amt;
  let b = (n & 0xff) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
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
    const hue = funcionario.color;
    return (
      <div
        className={cn(
          "inline-flex items-center justify-center rounded-full font-semibold text-white ring-1 ring-foreground/10 shrink-0",
          className,
        )}
        style={{ ...dim, background: `linear-gradient(135deg, ${hue}, ${shade(hue, -18)})` }}
        title={funcionario.nombre}
      >
        {initials(funcionario.nombre)}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-700 font-semibold ring-1 ring-foreground/10 shrink-0",
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
  | "logout";

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
};

export function Icon({
  name,
  size = 16,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const C = ICONS[name];
  return <C size={size} className={className} strokeWidth={2} />;
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
