"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AssetFilters({
  pageOptions,
  projectOptions,
}: {
  pageOptions: { id: string; label: string }[];
  projectOptions: { id: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: "page" | "kind" | "project", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    // A page filter is a narrower scope than a project filter, so the two can
    // contradict each other (page from project A + project B = always empty).
    // Choosing a project drops the stale page filter instead.
    if (key === "project") {
      params.delete("page");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-3">
      <Select
        value={searchParams.get("project") ?? "all"}
        onValueChange={(v) => updateParam("project", v)}
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder="All projects" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All projects</SelectItem>
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {projectOptions.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
