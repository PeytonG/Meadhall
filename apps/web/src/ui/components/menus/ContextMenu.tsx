// SPDX-License-Identifier: AGPL-3.0-only
// A right-click menu like Discord's: items, separators, checkboxes, and submenus that open to the side. Keyboard:
// arrows move, Enter/Space choose, Right opens a submenu, Left/Escape go back. Kept inside the window.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export type ContextMenuItem =
    | { kind: "separator" }
    | {
          kind?: "item";
          label: string;
          hint?: string;
          danger?: boolean;
          disabled?: boolean;
          checked?: boolean;
          onSelect?: () => void;
          submenu?: ContextMenuItem[];
          testId?: string;
      };

interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    label: string;
    onClose: () => void;
}

function MenuList({
    items,
    label,
    onClose,
    style,
    autoFocus,
    onBack,
}: {
    items: ContextMenuItem[];
    label: string;
    onClose: () => void;
    style: React.CSSProperties;
    autoFocus: boolean;
    onBack?: () => void;
}): React.ReactElement {
    const listRef = useRef<HTMLDivElement | null>(null);
    const [openSubmenu, setOpenSubmenu] = useState<number | null>(null);
    const [submenuTop, setSubmenuTop] = useState(0);

    useEffect(() => {
        if (autoFocus) listRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    }, [autoFocus]);

    const buttons = (): HTMLButtonElement[] => Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>(":scope > button:not(:disabled)") ?? []);
    const onKeyDown = (event: React.KeyboardEvent): void => {
        const list = buttons();
        const index = list.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const next = event.key === "ArrowDown" ? (index + 1) % list.length : (index - 1 + list.length) % list.length;
            list[next]?.focus();
        } else if (event.key === "ArrowLeft" && onBack) {
            event.preventDefault();
            event.stopPropagation();
            onBack();
        }
    };

    return (
        <div ref={listRef} className="context-menu" role="menu" aria-label={label} style={style} onKeyDown={onKeyDown}>
            {items.map((item, index) => {
                if (item.kind === "separator") return <div key={`sep-${index}`} className="context-menu-separator" role="separator" />;
                const hasSubmenu = Boolean(item.submenu?.length);
                const open = (target: HTMLElement): void => {
                    setSubmenuTop(target.offsetTop);
                    setOpenSubmenu(index);
                };
                return (
                    <React.Fragment key={item.label}>
                        <button
                            type="button"
                            role={item.checked !== undefined ? "menuitemcheckbox" : "menuitem"}
                            aria-checked={item.checked}
                            aria-haspopup={hasSubmenu ? "menu" : undefined}
                            aria-expanded={hasSubmenu ? openSubmenu === index : undefined}
                            className={`context-menu-item${item.danger ? " is-danger" : ""}`}
                            disabled={item.disabled}
                            data-testid={item.testId}
                            onMouseEnter={(event) => (hasSubmenu ? open(event.currentTarget) : setOpenSubmenu(null))}
                            onKeyDown={(event) => {
                                if (hasSubmenu && event.key === "ArrowRight") {
                                    event.preventDefault();
                                    open(event.currentTarget);
                                }
                            }}
                            onClick={(event) => {
                                if (hasSubmenu) {
                                    open(event.currentTarget);
                                    return;
                                }
                                item.onSelect?.();
                                onClose();
                            }}
                        >
                            <span className="context-menu-label">
                                {item.label}
                                {item.hint ? <small>{item.hint}</small> : null}
                            </span>
                            {item.checked !== undefined ? (
                                <span className={`context-menu-check${item.checked ? " is-checked" : ""}`} aria-hidden="true">
                                    {item.checked ? "✓" : ""}
                                </span>
                            ) : hasSubmenu ? (
                                <span className="context-menu-arrow" aria-hidden="true">
                                    ›
                                </span>
                            ) : null}
                        </button>
                        {hasSubmenu && openSubmenu === index ? (
                            <MenuList
                                items={item.submenu!}
                                label={item.label}
                                onClose={onClose}
                                autoFocus
                                onBack={() => {
                                    setOpenSubmenu(null);
                                    buttons()[index]?.focus();
                                }}
                                style={{ position: "absolute", left: "100%", top: submenuTop }}
                            />
                        ) : null}
                    </React.Fragment>
                );
            })}
        </div>
    );
}

export function ContextMenu({ x, y, items, label, onClose }: ContextMenuProps): React.ReactElement {
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const [position, setPosition] = useState({ left: x, top: y });

    // Keep the menu inside the window (flip up or left near the edges).
    useLayoutEffect(() => {
        const box = wrapRef.current?.firstElementChild?.getBoundingClientRect();
        if (!box) return;
        const margin = 8;
        setPosition({
            left: Math.max(margin, Math.min(x, window.innerWidth - box.width - margin)),
            top: Math.max(margin, Math.min(y, window.innerHeight - box.height - margin)),
        });
    }, [x, y]);

    useEffect(() => {
        const onPointerDown = (event: PointerEvent): void => {
            if (!wrapRef.current?.contains(event.target as Node)) onClose();
        };
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "Escape") onClose();
        };
        const onBlur = (): void => onClose();
        window.addEventListener("pointerdown", onPointerDown, true);
        window.addEventListener("keydown", onKey);
        window.addEventListener("blur", onBlur);
        window.addEventListener("resize", onBlur);
        return () => {
            window.removeEventListener("pointerdown", onPointerDown, true);
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("blur", onBlur);
            window.removeEventListener("resize", onBlur);
        };
    }, [onClose]);

    return (
        <div ref={wrapRef} className="context-menu-layer" style={{ left: position.left, top: position.top }}>
            <MenuList items={items} label={label} onClose={onClose} style={{}} autoFocus />
        </div>
    );
}
