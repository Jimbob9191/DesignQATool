"use client";

import { useState } from "react";
import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen, ScanEye } from "lucide-react";

import { NavLinks } from "@/components/app-shell/nav-links";
import { TeamSwitcher } from "@/components/app-shell/team-switcher";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SIDEBAR_COLLAPSED_COOKIE } from "@/config/nav";
import { cn } from "@/lib/utils";

export function Sidebar({
  currentTeamId,
  teams,
  defaultCollapsed,
}: {
  currentTeamId: string;
  teams: { id: string; name: string; role: string }[];
  defaultCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    // Read by the (app) layout on the server so the first paint matches.
    document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${next ? "1" : "0"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
        collapsed ? "w-14" : "w-64"
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center gap-2 border-b border-sidebar-border",
          collapsed ? "justify-center px-2" : "justify-between pl-4 pr-2"
        )}
      >
        {!collapsed && (
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2 font-semibold">
            <ScanEye className="h-5 w-5 shrink-0" />
            <span className="truncate">DesignParity.app</span>
          </Link>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={toggle}
              aria-label={toggleLabel}
            >
              <ToggleIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{toggleLabel}</TooltipContent>
        </Tooltip>
      </div>
      {!collapsed && (
        <div className="border-b border-sidebar-border px-3 py-2">
          <TeamSwitcher currentTeamId={currentTeamId} teams={teams} />
        </div>
      )}
      <div className={cn("flex-1 overflow-y-auto", collapsed ? "p-2" : "p-3")}>
        <NavLinks collapsed={collapsed} />
      </div>
    </aside>
  );
}
