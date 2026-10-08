"use client";

import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The comparison's breadcrumb: its name, opening a list of the page's other comparisons. */
export function ComparisonSwitcher({
  comparisonId,
  pageName,
  basePath,
  comparisons,
}: {
  comparisonId: string;
  pageName: string;
  /** The page's path; each comparison is at `${basePath}/compare/${id}`. */
  basePath: string;
  comparisons: { id: string; name: string }[];
}) {
  const current = comparisons.find((c) => c.id === comparisonId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="-ml-1 min-w-0 shrink" title="Switch comparison" aria-current="page">
          <span className="truncate">{current?.name}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-96 w-64">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{pageName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {comparisons.map((c) => (
          <DropdownMenuItem key={c.id} asChild>
            <Link href={`${basePath}/compare/${c.id}`}>
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              {c.id === comparisonId ? <Check className="h-4 w-4" /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
