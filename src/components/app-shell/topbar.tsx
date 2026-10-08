"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Menu, ScanEye } from "lucide-react";

import { NavLinks } from "@/components/app-shell/nav-links";
import { SettingsMenu } from "@/components/app-shell/settings-menu";
import { TopbarSlot } from "@/components/app-shell/topbar-slot";
import { GlobalSearch } from "@/components/search/global-search";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function Topbar({ userEmail }: { userEmail: string }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();
  const backHref = backHrefFor(pathname);
  // The comparison page has no search.
  const showSearch = !isComparison(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 gap-0 p-0">
          <SheetHeader className="h-14 justify-center border-b border-border px-4">
            <SheetTitle asChild>
              <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
                <ScanEye className="h-5 w-5" />
                <span>DesignParity.app</span>
              </Link>
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-3">
            <NavLinks onNavigate={() => setMobileNavOpen(false)} />
          </div>
          <div className="border-t border-border p-3">
            <SettingsMenu userEmail={userEmail} onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {backHref ? (
        <Button variant="ghost" size="icon" asChild>
          <Link href={backHref} aria-label="Back" title="Back">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
      ) : null}

      <TopbarSlot name="start" className="flex min-w-0 items-center" />

      {/* Everything after this sits on the right. */}
      <div className="flex-1" />

      {/* Page actions, set apart from search by a rule. Hidden when the page has none. */}
      <TopbarSlot
        name="end"
        className={cn(
          "flex shrink-0 items-center gap-2 empty:hidden",
          showSearch && "border-r border-border pr-3",
        )}
      />

      {showSearch ? <GlobalSearch /> : null}
    </header>
  );
}

const COMPARISON_PATH = /^(\/projects\/[^/]+\/[^/]+)\/compare\/[^/]+\/?$/;

function isComparison(pathname: string): boolean {
  return COMPARISON_PATH.test(pathname);
}

/** Pages that get a back button in the top bar, and where it goes. */
function backHrefFor(pathname: string): string | null {
  // A comparison goes back to its page.
  const comparison = pathname.match(COMPARISON_PATH);
  return comparison ? comparison[1] : null;
}
