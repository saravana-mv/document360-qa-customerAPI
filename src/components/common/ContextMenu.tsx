import { useState, useRef, useEffect, useLayoutEffect, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";

// ── Types ────────────────────────────────────────────────────────────────────

export interface MenuAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Tooltip shown on hover (useful for explaining why an item is disabled) */
  tooltip?: string;
}

export type MenuItem = MenuAction | "separator";

interface ContextMenuProps {
  items: MenuItem[];
  /** Extra classes on the "..." trigger button */
  triggerClass?: string;
  /** Override the trigger element (default: horizontal "..." icon) */
  trigger?: ReactNode;
  /** Alignment of the dropdown */
  align?: "left" | "right";
}

// ── Component ────────────────────────────────────────────────────────────────

export function ContextMenu({ items, triggerClass, trigger, align = "right" }: ContextMenuProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Position the dropdown relative to the trigger button in viewport coords.
  // Runs on open and on scroll/resize so the menu tracks correctly.
  const reposition = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuW = 180; // min-w-[180px]
    let left = align === "right" ? rect.right - menuW : rect.left;
    // Clamp to viewport so the dropdown doesn't overflow the right edge
    if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
    if (left < 8) left = 8;
    setPos({ top: rect.bottom + 4, left });
  }, [align]);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  // Reposition on scroll/resize so the dropdown follows the trigger
  useEffect(() => {
    if (!open) return;
    const handler = () => reposition();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, reposition]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function run(fn: () => void) {
    setOpen(false);
    try {
      fn();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[ContextMenu] action failed:", e);
    }
  }

  const visibleItems = items.filter((item) => item !== "separator" || true);

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        title="More actions"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={
          triggerClass ??
          "rounded p-0.5 text-[#656d76] hover:text-[#1f2328] hover:bg-[#eef1f6] transition-colors"
        }
      >
        {trigger ?? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM1.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM14.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
          </svg>
        )}
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] bg-white border border-[#d1d9e0] rounded-lg shadow-lg py-0.5 min-w-[180px]"
          style={{ top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {visibleItems.map((item, i) => {
            if (item === "separator") {
              return <div key={`sep-${i}`} className="border-t border-[#d8dee4] my-0.5" />;
            }
            return (
              <button
                key={item.label}
                onClick={() => {
                  if (!item.disabled) run(item.onClick);
                }}
                disabled={item.disabled}
                title={item.tooltip}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                  item.danger
                    ? "text-[#d1242f] hover:bg-[#ffebe9]"
                    : "text-[#1f2328] hover:bg-[#f6f8fa]"
                } ${item.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                {item.icon && (
                  <span className={`w-4 h-4 flex items-center justify-center shrink-0 ${
                    item.danger ? "text-[#d1242f]" : "text-[#656d76]"
                  }`}>
                    {item.icon}
                  </span>
                )}
                {item.label}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── Shared icons (grey, 16x16) ───────────────────────────────────────────────

const iconClass = "w-4 h-4";
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2 } as const;
const filled = { fill: "currentColor" } as const;

export const MenuIcons = {
  rename: (
    <svg className={iconClass} {...stroke} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
    </svg>
  ),
  trash: (
    <svg className={iconClass} {...stroke} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  ),
  folder: (
    <svg className={iconClass} {...filled} viewBox="0 0 20 20">
      <path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
    </svg>
  ),
  upload: (
    <svg className={iconClass} {...stroke} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
    </svg>
  ),
  sparkle: (
    <svg className={iconClass} {...stroke} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
    </svg>
  ),
  download: (
    <svg className={iconClass} {...stroke} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  ),
  check: (
    <svg className={iconClass} {...stroke} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  ),
  edit: (
    <svg className={iconClass} {...stroke} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
    </svg>
  ),
  remove: (
    <svg className={iconClass} {...stroke} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  ),
  link: (
    <svg className={iconClass} {...stroke} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
    </svg>
  ),
  sync: (
    <svg className={iconClass} {...stroke} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
    </svg>
  ),
  sortAZ: (
    <svg className={iconClass} {...stroke} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
    </svg>
  ),
  sortMethod: (
    <svg className={iconClass} {...stroke} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
    </svg>
  ),
  refresh: (
    <svg className={iconClass} {...stroke} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
    </svg>
  ),
  clipboard: (
    <svg className={iconClass} {...stroke} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
    </svg>
  ),
};
