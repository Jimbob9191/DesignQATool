import type { LucideIcon } from "lucide-react";
import { FolderKanban, Images, LayoutDashboard, Settings, Users } from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Projects", href: "/projects", icon: FolderKanban },
  { title: "Assets", href: "/assets", icon: Images },
  { title: "Team", href: "/team", icon: Users },
  { title: "Settings", href: "/settings", icon: Settings },
];

export const SIDEBAR_COLLAPSED_COOKIE = "sidebar_collapsed";
