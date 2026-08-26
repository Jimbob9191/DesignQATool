import * as React from "react";
import Link from "next/link";

import type { Crumb } from "@/lib/navigation/crumbs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export type { Crumb };

export function PageBreadcrumb({ items }: { items: Crumb[] }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, index) => {
          // The trailing crumb is the current page: rendered as text, not a link.
          const isLast = index === items.length - 1;

          return (
            <React.Fragment key={`${index}-${item.label}`}>
              <BreadcrumbItem>
                {isLast || !item.href ? (
                  <BreadcrumbPage className="max-w-60 truncate">{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild className="max-w-60 truncate">
                    <Link href={item.href}>{item.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {isLast ? null : <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
