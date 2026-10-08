"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { signOut } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

/** The signed-in user, the theme and sign out, pinned to the foot of the sidebar. */
export function SettingsMenu({
  userEmail,
  collapsed = false,
  onNavigate,
}: {
  userEmail: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const isActive = pathname === "/settings" || pathname.startsWith("/settings/");
  const initials = userEmail.slice(0, 2).toUpperCase();

  const trigger = (
    <DropdownMenuTrigger asChild>
      <button
        aria-label={collapsed ? "Settings" : undefined}
        className={cn(
          "flex w-full items-center rounded-md py-1.5 text-left text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent",
          collapsed ? "justify-center px-1" : "gap-2 px-2",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
      >
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate">{userEmail}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-foreground/60" />
          </>
        )}
      </button>
    </DropdownMenuTrigger>
  );

  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent side={collapsed ? "right" : "top"} align={collapsed ? "end" : "start"} className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{userEmail}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings" onClick={onNavigate}>
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun className="h-4 w-4 text-muted-foreground dark:hidden" />
            <Moon className="hidden h-4 w-4 text-muted-foreground dark:block" />
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <Sun className="h-4 w-4" />
                Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon className="h-4 w-4" />
                Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor className="h-4 w-4" />
                System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
