// Vertical 48px icon rail on the far left. Each button toggles a
// sidebar "view" and visually marks the active one with an accent
// border on its left edge — VS Code convention.

import Codicon, { type CodiconName } from "./Codicon";

// v0.3 added "languages" — a per-language filter pane that shrinks the
// graph to the user's chosen subset of detected languages.
export type ActivityView =
  | "pr"
  | "recent"
  | "bookmarks"
  | "languages"
  | "settings";

interface Props {
  active: ActivityView;
  collapsed: boolean;
  onSelect: (v: ActivityView) => void;
  onToggleSidebar: () => void;
}

interface Item {
  id: ActivityView;
  icon: CodiconName;
  label: string;
}

const ITEMS: Item[] = [
  { id: "pr", icon: "git-pull-request", label: "PR Explorer (Ctrl+Shift+E)" },
  { id: "recent", icon: "history", label: "Recent PRs (Ctrl+P)" },
  { id: "bookmarks", icon: "bookmark", label: "Bookmarks" },
  { id: "languages", icon: "languages", label: "Languages" },
  { id: "settings", icon: "gear", label: "Settings" },
];

export default function ActivityBar({ active, collapsed, onSelect, onToggleSidebar }: Props) {
  return (
    <nav
      className="flex w-12 shrink-0 flex-col items-center justify-between bg-activity-bar"
      aria-label="Activity bar"
    >
      <div className="flex flex-col items-center">
        {ITEMS.map((item) => {
          const isActive = !collapsed && active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (collapsed) {
                  onToggleSidebar();
                  onSelect(item.id);
                } else if (active === item.id) {
                  onToggleSidebar();
                } else {
                  onSelect(item.id);
                }
              }}
              data-tooltip={item.label}
              className={[
                "ide-tooltip relative flex h-12 w-12 items-center justify-center",
                "text-text-secondary hover:text-text-primary",
                isActive ? "text-text-primary" : "",
              ].join(" ")}
              aria-label={item.label}
              aria-pressed={isActive}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-0 bottom-0 w-[2px] bg-text-primary"
                />
              )}
              <Codicon name={item.icon} size={22} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
