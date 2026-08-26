import assert from "node:assert/strict";
import test from "node:test";

import { buildProjectCrumbs } from "../src/lib/navigation/crumbs.ts";

test("project crumbs stop at the project, which is the current page", () => {
  assert.deepEqual(buildProjectCrumbs({ projectName: "Acme", projectSlug: "acme" }), [
    { label: "Projects", href: "/projects" },
    { label: "Acme" },
  ]);
});

test("page crumbs link back to the project", () => {
  assert.deepEqual(
    buildProjectCrumbs({
      projectName: "Acme",
      projectSlug: "acme",
      pageName: "Checkout",
      pageId: "page-1",
    }),
    [
      { label: "Projects", href: "/projects" },
      { label: "Acme", href: "/projects/acme" },
      { label: "Checkout" },
    ]
  );
});

test("comparison crumbs link back to both the project and the page", () => {
  assert.deepEqual(
    buildProjectCrumbs({
      projectName: "Acme",
      projectSlug: "acme",
      pageName: "Checkout",
      pageId: "page-1",
      comparisonName: "v3 vs live",
    }),
    [
      { label: "Projects", href: "/projects" },
      { label: "Acme", href: "/projects/acme" },
      { label: "Checkout", href: "/projects/acme/page-1" },
      { label: "v3 vs live" },
    ]
  );
});

test("only the last crumb lacks an href", () => {
  const crumbs = buildProjectCrumbs({
    projectName: "Acme",
    projectSlug: "acme",
    pageName: "Checkout",
    pageId: "page-1",
    comparisonName: "v3 vs live",
  });

  assert.equal(crumbs.at(-1).href, undefined);
  assert.ok(crumbs.slice(0, -1).every((crumb) => typeof crumb.href === "string"));
});

test("a comparison name without a page is ignored rather than orphaned", () => {
  assert.deepEqual(
    buildProjectCrumbs({
      projectName: "Acme",
      projectSlug: "acme",
      comparisonName: "v3 vs live",
    }),
    [
      { label: "Projects", href: "/projects" },
      { label: "Acme" },
    ]
  );
});
