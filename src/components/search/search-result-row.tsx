import { FileText, FolderKanban, MessageSquare, SplitSquareHorizontal, type LucideIcon } from "lucide-react";

import { COMMENT_STATUS_LABELS, type SearchItem } from "@/lib/search/items";
import { highlightSegments, type SearchType } from "@/lib/search/text";
import { cn } from "@/lib/utils";

export const SEARCH_TYPE_ICONS: Record<SearchType, LucideIcon> = {
  projects: FolderKanban,
  pages: FileText,
  comparisons: SplitSquareHorizontal,
  comments: MessageSquare,
};

const STATUS_DOT_CLASSES: Record<NonNullable<SearchItem["status"]>, string> = {
  open: "bg-status-open",
  resolved: "bg-status-resolved",
  wont_fix: "bg-status-wont-fix",
  needs_review: "bg-status-needs-review",
};

export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlightSegments(text, terms).map((segment, index) =>
        segment.match ? (
          <mark key={index} className="rounded-sm bg-yellow-200/70 text-inherit dark:bg-yellow-500/30">
            {segment.text}
          </mark>
        ) : (
          segment.text
        )
      )}
    </>
  );
}

// The inside of a result link; callers supply the <Link> so the dropdown
// and the results page can style hover / keyboard-active states their way.
export function SearchResultRow({
  item,
  terms,
  className,
}: {
  item: SearchItem;
  terms: string[];
  className?: string;
}) {
  const Icon = SEARCH_TYPE_ICONS[item.type];

  return (
    <span className={cn("flex min-w-0 items-start gap-2.5", className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">
          <Highlight text={item.title} terms={terms} />
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {item.status ? (
            <span
              className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT_CLASSES[item.status])}
              title={COMMENT_STATUS_LABELS[item.status]}
            />
          ) : null}
          <span className="truncate">
            <Highlight text={item.context} terms={terms} />
            {item.detail ? (
              <>
                {" · "}
                <Highlight text={item.detail} terms={terms} />
              </>
            ) : null}
          </span>
        </span>
      </span>
    </span>
  );
}
