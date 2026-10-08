import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { TopbarPortal } from "@/components/app-shell/topbar-slot";

export type Crumb = { label: string; href?: string };

/** Shows the trail in the top bar. The last crumb is the current page. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <TopbarPortal>
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <li key={index} className={cn("flex items-center gap-1.5", isLast ? "min-w-0" : "shrink-0")}>
                {item.href && !isLast ? (
                  <Link
                    href={item.href}
                    className="max-w-48 truncate text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className="truncate font-medium" aria-current={isLast ? "page" : undefined}>
                    {item.label}
                  </span>
                )}
                {isLast ? null : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              </li>
            );
          })}
        </ol>
      </nav>
    </TopbarPortal>
  );
}
