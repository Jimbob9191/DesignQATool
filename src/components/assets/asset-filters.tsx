"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AssetFilters({ pageOptions }: { pageOptions: { id: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: "page" | "kind", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-3">
      <Select value={searchParams.get("page") ?? "all"} onValueChange={(v) => updateParam("page", v)}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder="All pages" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All pages</SelectItem>
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {pageOptions.map((page) => (
            <SelectItem key={page.id} value={page.id}>
              {page.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("kind") ?? "all"} onValueChange={(v) => updateParam("kind", v)}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="All kinds" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All kinds</SelectItem>
          <SelectItem value="design">Design</SelectItem>
          <SelectItem value="capture">Capture</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
