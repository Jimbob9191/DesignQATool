import { cookies } from "next/headers";

import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";
import { SIDEBAR_COLLAPSED_COOKIE } from "@/config/nav";
import { getCurrentTeam, getUserTeams, requireUser } from "@/lib/auth/team";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { team } = await getCurrentTeam();
  const memberships = await getUserTeams();
  const teamOptions = memberships.map((m) => ({ id: m.team.id, name: m.team.name, role: m.role }));
  const sidebarCollapsed = (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE)?.value === "1";

  return (
    <div className="flex h-full min-h-screen w-full">
      <Sidebar currentTeamId={team.id} teams={teamOptions} defaultCollapsed={sidebarCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userEmail={user.email ?? "Unknown"} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
