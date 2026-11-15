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
import { CircleAlert, Info, X } from "lucide-react";
import { cn, STATUS_META, statusLabel } from "@/lib/utils";
import type { FlightStatus } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

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
        "rounded-xl border border-line/70 bg-surface/80 hairline",
        glow && "glow-accent",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Page-level heading. Use once per route so the document has a single h1 and
 * the supporting copy gets a readable measure instead of stretching full width.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="label-caps mb-2 text-accent">{eyebrow}</p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px] sm:leading-tight">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight text-ink">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-[color:var(--bg)] hover:bg-[color:var(--accent)]/90 active:brightness-95",
  secondary:
    "bg-surface-3 text-ink hover:bg-surface-4/80 border border-line/70",
  ghost: "text-muted hover:text-ink hover:bg-surface-3/60",
  outline:
    "border border-line-strong/70 text-ink hover:border-accent/50 hover:text-accent bg-transparent",
  danger:
    "bg-cancelled/12 text-cancelled border border-cancelled/40 hover:bg-cancelled/20",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-10 px-3.5 text-[13px] gap-1.5 rounded-lg",
  md: "h-11 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-lg",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
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
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-lg border border-transparent text-muted transition-colors hover:border-line hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Status and filtering                                                       */
/* -------------------------------------------------------------------------- */

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
          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-line/70 bg-surface-2 px-2 py-1 text-xs font-medium leading-none text-subtle",
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
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold leading-none",
        className,
      )}
      style={{
        color: meta.color,
        backgroundColor: meta.soft,
        borderColor: `${meta.color}4d`,
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
      aria-pressed={Boolean(active)}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        active
          ? "text-ink"
          : "border-line/70 bg-surface-2/50 text-muted hover:border-line-strong hover:text-ink",
        className,
      )}
      style={
        active
          ? {
              borderColor: color ? `${color}80` : "var(--accent)",
              backgroundColor: color ? `${color}24` : "var(--accent-soft)",
              color: color ?? "var(--accent)",
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
  label = "View",
}: {
  tabs: Array<{ value: T; label: ReactNode; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  compact?: boolean;
  label?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "flex items-center gap-1 rounded-lg border border-line/70 bg-surface-2/60 p-1",
        className,
      )}
    >
      {tabs.map((tab, index) => {
        const selected = value === tab.value;
        return (
          <button
            key={tab.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => move(event, index)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-[13px]",
              selected
                ? "bg-surface-4 text-ink shadow-sm"
                : "text-muted hover:text-ink",
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-xs tabular",
                  selected ? "bg-accent/15 text-accent" : "bg-surface-3 text-subtle",
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Forms                                                                      */
/* -------------------------------------------------------------------------- */

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
    <label className={cn("flex flex-col gap-2", className)}>
      {label && <span className="label-caps text-muted">{label}</span>}
      {children}
      {hint && <span className="text-xs leading-relaxed text-subtle">{hint}</span>}
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
        "h-11 w-full rounded-lg border border-line bg-surface-2/70 px-3 text-sm text-ink outline-none transition-colors placeholder:text-subtle/80 hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/20 aria-[invalid=true]:border-cancelled",
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Feedback                                                                   */
/* -------------------------------------------------------------------------- */

const CALLOUT_TONES = {
  info: {
    icon: <Info className="size-4" />,
    className: "border-line-strong/60 bg-surface-2/60 text-muted",
    iconClassName: "text-accent-2",
  },
  attention: {
    icon: <CircleAlert className="size-4" />,
    className: "border-delayed/30 bg-delayed/8 text-muted",
    iconClassName: "text-delayed",
  },
  danger: {
    icon: <CircleAlert className="size-4" />,
    className: "border-cancelled/30 bg-cancelled/8 text-muted",
    iconClassName: "text-cancelled",
  },
  success: {
    icon: <Info className="size-4" />,
    className: "border-landed/30 bg-landed/8 text-muted",
    iconClassName: "text-landed",
  },
} as const;

export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof CALLOUT_TONES;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const meta = CALLOUT_TONES[tone];
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm leading-relaxed",
        meta.className,
        className,
      )}
      role={tone === "danger" ? "alert" : undefined}
    >
      <span className={cn("mt-0.5 shrink-0", meta.iconClassName)}>
        {meta.icon}
      </span>
      <div className="min-w-0">
        {title && <p className="font-semibold text-ink">{title}</p>}
        <div className={cn(title && "mt-0.5")}>{children}</div>
      </div>
    </div>
  );
}

export function Skeleton({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn("skeleton rounded-lg", className)}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

/** Loading, empty and error states share one rhythm across the app. */
export function StatePanel({
  icon,
  title,
  description,
  action,
  loading,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 text-center",
        className,
      )}
      aria-busy={loading || undefined}
      role={loading ? "status" : undefined}
    >
      {icon && (
        <div
          className={cn(
            "mb-4 flex size-12 items-center justify-center rounded-xl border border-line/70 bg-surface-2/60 text-muted",
            loading && "animate-pulse text-accent",
          )}
        >
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function EmptyState(props: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return <StatePanel {...props} />;
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
        "rounded-lg border border-line/60 bg-surface-2/40 px-3.5 py-3",
        className,
      )}
    >
      <p className="label-caps text-subtle">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-[15px] font-semibold tabular",
          accent ? "text-accent" : "text-ink",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 truncate text-xs text-subtle">{sub}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                      */
/* -------------------------------------------------------------------------- */

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
  // Keep the latest close handler without re-running the focus effect. Pages
  // usually pass an inline arrow function, which used to reset focus to the
  // first control on every keystroke inside the dialog.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const titleId = `avi-modal-${id.replace(/:/g, "")}-title`;
  const subtitleId = subtitle
    ? `avi-modal-${id.replace(/:/g, "")}-sub`
    : undefined;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const focusables = () =>
      Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const index = items.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      const nextIndex = event.shiftKey
        ? index <= 0
          ? items.length - 1
          : index - 1
        : index === items.length - 1 || index < 0
          ? 0
          : index + 1;
      items[nextIndex]?.focus();
    };

    document.addEventListener("keydown", onKeyDown);
    const frame = requestAnimationFrame(() => {
      const items = focusables();
      (items[0] ?? containerRef.current)?.focus();
    });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const sizes = {
    sm: "max-w-md",
    md: "max-w-2xl",
    lg: "max-w-4xl",
    xl: "max-w-6xl",
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-8">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 bg-bg/80 backdrop-blur-sm"
        onClick={() => onCloseRef.current()}
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl animate-float-in sm:max-h-[88dvh] sm:rounded-2xl",
          sizes[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line/60 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent-soft text-accent">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-base font-semibold text-ink">
                {title}
              </h2>
              {subtitle && (
                <p
                  id={subtitleId}
                  className="mt-1 text-sm leading-relaxed text-muted"
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <IconButton
            label="Close"
            onClick={() => onCloseRef.current()}
            className="-mr-2 -mt-1 shrink-0"
          >
            <X className="size-4" />
          </IconButton>
        </div>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto px-5 py-5",
            !footer && "pb-safe-body",
          )}
        >
          {children}
        </div>
        {footer && (
          <div className="pb-safe flex flex-wrap items-center justify-end gap-2 border-t border-line/60 bg-surface-2/40 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
