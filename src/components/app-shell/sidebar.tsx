import Link from "next/link";
import { ScanEye } from "lucide-react";

import { NavLinks } from "@/components/app-shell/nav-links";
import { TeamSwitcher } from "@/components/app-shell/team-switcher";

export function Sidebar({
  currentTeamId,
  teams,
}: {
  currentTeamId: string;
  teams: { id: string; name: string; role: string }[];
}) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <ScanEye className="h-5 w-5" />
          <span>DesignParity.app</span>
        </Link>
      </div>
      <div className="border-b border-sidebar-border px-3 py-2">
        <TeamSwitcher currentTeamId={currentTeamId} teams={teams} />
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <NavLinks />
      </div>
    </aside>
  );
}
