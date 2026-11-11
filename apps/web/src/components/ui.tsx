"use client";

import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn, STATUS_META, statusLabel } from "@/lib/utils";
import type { FlightStatus } from "@/lib/types";

export function Panel({
  children,
  className,
  glow,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line/90 bg-surface/90 hairline",
        glow && "glow-accent",
        className,
      )}
    >
      {children}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-[color:var(--bg)] hover:brightness-110 active:brightness-95 shadow-[0_10px_30px_-12px_rgba(0,229,255,0.65)]",
  secondary:
    "bg-surface-3 text-ink hover:bg-surface-3/80 border border-line/80",
  ghost: "text-muted hover:text-ink hover:bg-surface-3/60",
  outline:
    "border border-line text-ink hover:border-accent/60 hover:text-accent bg-transparent",
  danger:
    "bg-cancelled/15 text-cancelled border border-cancelled/45 hover:bg-cancelled/25",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-sm gap-2 rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function IconButton({
  className,
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-xl border border-line/70 bg-surface-2/80 text-muted transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function StatusBadge({
  status,
  statusReported = true,
  delayMinutes = 0,
  delayReported = true,
  className,
}: {
  status: FlightStatus;
  statusReported?: boolean;
  delayMinutes?: number;
  delayReported?: boolean;
  className?: string;
}) {
  if (!statusReported) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface-2 px-2 py-1 text-[11px] font-semibold leading-none text-subtle",
          className,
        )}
      >
        <span className="size-1.5 rounded-full bg-subtle" />
        Status not reported
      </span>
    );
  }
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-semibold leading-none",
        className,
      )}
      style={{
        color: meta.color,
        backgroundColor: meta.soft,
        borderColor: `${meta.color}66`,
      }}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "DEPARTED" && "animate-pulse-dot",
        )}
        style={{ backgroundColor: meta.color }}
      />
      {statusLabel(status, delayReported ? delayMinutes : 0)}
    </span>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
  color,
  className,
  title,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  color?: string;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
        active
          ? "text-[color:var(--bg)]"
          : "border-line/80 bg-surface-2 text-muted hover:border-accent/45 hover:text-ink",
        className,
      )}
      style={
        active
          ? {
              backgroundColor: color ?? "var(--accent)",
              borderColor: color ?? "var(--accent)",
            }
          : undefined
      }
    >
      {children}
    </button>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  compact,
}: {
  tabs: Array<{ value: T; label: ReactNode; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-xl border border-line/80 bg-surface-2 p-1",
        className,
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-colors",
            compact ? "px-2 py-1.5 text-[11px]" : "px-3 py-2 text-xs",
            value === tab.value
              ? "bg-accent text-[color:var(--bg)]"
              : "text-muted hover:text-ink",
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[9px] tabular",
                value === tab.value
                  ? "bg-[color:var(--bg)]/20"
                  : "bg-surface-3 text-subtle",
              )}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  hint,
  className,
  children,
}: {
  label?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <span className="label-caps text-subtle">{label}</span>
      )}
      {children}
      {hint && <span className="text-[11px] text-subtle">{hint}</span>}
    </label>
  );
}

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-ink outline-none transition-colors placeholder:text-subtle/80 focus:border-accent focus:ring-2 focus:ring-accent/15",
        className,
      )}
      {...props}
    />
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  icon,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  icon?: ReactNode;
}) {
  const id = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const titleId = `avi-modal-${id.replace(/:/g, "")}-title`;
  const subtitleId = subtitle ? `avi-modal-${id.replace(/:/g, "")}-sub` : undefined;

  const focusables = () =>
    Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => !element.hasAttribute("disabled"));

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      // Focus trap: cycle inside the dialog instead of behind the overlay.
      const items = focusables();
      if (!items.length) return;
      const index = items.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      const nextIndex = event.shiftKey
        ? (index <= 0 ? items.length - 1 : index - 1)
        : (index === items.length - 1 || index < 0 ? 0 : index + 1);
      items[nextIndex]?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestAnimationFrame(() => focusables()[0]?.focus());
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const sizes = {
    sm: "max-w-md",
    md: "max-w-2xl",
    lg: "max-w-4xl",
    xl: "max-w-6xl",
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 bg-[#02060c]/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
        className={cn(
          "relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl animate-float-in",
          sizes[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line/70 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-accent/35 bg-accent-soft text-accent">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-base font-bold text-ink">
                {title}
              </h2>
              {subtitle && (
                <p id={subtitleId} className="mt-0.5 text-xs leading-relaxed text-muted">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <IconButton label="Close" onClick={onClose} className="size-8 shrink-0">
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line/70 bg-surface-2/60 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-14 text-center",
        className,
      )}
    >
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-line bg-surface-2 text-subtle">
        {icon}
      </div>
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function MetricTile({
  label,
  value,
  sub,
  accent,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line/80 bg-surface-2 px-3 py-2.5",
        className,
      )}
    >
      <p className="label-caps text-subtle">{label}</p>
      <p
        className={cn(
          "mt-1 text-sm font-bold tabular",
          accent ? "text-accent" : "text-ink",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-[10px] text-subtle">{sub}</p>}
    </div>
  );
}
