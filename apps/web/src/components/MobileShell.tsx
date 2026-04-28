import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CalendarDays, CreditCard, Home, UserRound, Users } from "lucide-react";

export type TabId = "home" | "agenda" | "family" | "billing" | "account";

const tabs: { id: TabId; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "family", label: "Family", icon: Users },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "account", label: "Account", icon: UserRound },
];

type MobileShellProps = {
  title: string;
  active: TabId;
  onTabChange: (id: TabId) => void;
  children: ReactNode;
};

export function MobileShell({
  title,
  active,
  onTabChange,
  children,
}: MobileShellProps) {
  return (
    <div className="flex min-h-dvh justify-center bg-muted/40">
      <div
        className="flex w-full max-w-md flex-col bg-background shadow-[0_0_40px_-12px_rgba(0,0,0,0.25)]"
        style={{ minHeight: "100dvh" }}
      >
        <header className="flex h-14 shrink-0 items-center border-b border-border px-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {title}
          </h1>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {children}
        </main>

        <nav
          className="shrink-0 border-t border-border bg-background/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md"
          aria-label="Main navigation"
        >
          <div className="grid grid-cols-5 gap-1 px-1 pt-1">
            {tabs.map(({ id, label, icon: Icon }) => {
              const isActive = active === id;
              return (
                <Button
                  key={id}
                  type="button"
                  variant="ghost"
                  className={cn(
                    "flex h-14 flex-col gap-0.5 rounded-xl px-1 py-2 text-[11px] font-medium text-muted-foreground",
                    isActive && "bg-primary/10 text-primary"
                  )}
                  onClick={() => onTabChange(id)}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon
                    className={cn(
                      "size-6 shrink-0",
                      isActive && "text-primary"
                    )}
                    aria-hidden
                  />
                  <span className="leading-none">{label}</span>
                </Button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
