import assert from "node:assert/strict";
import test from "node:test";

import { checkComparisonAssets } from "../src/lib/comparisons/eligibility.ts";

const PAGE_ID = "11111111-1111-4111-8111-111111111111";
const SIBLING_PAGE_ID = "1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const DESIGN_ID = "44444444-4444-4444-8444-444444444444";
const CAPTURE_ID = "55555555-5555-4555-8555-555555555555";

const pageCapture = {
  id: CAPTURE_ID,
  kind: "capture",
  pageId: PAGE_ID,
  projectId: PROJECT_ID,
};

function check(candidates, ids = {}) {
  return checkComparisonAssets({
    pageId: PAGE_ID,
    projectId: PROJECT_ID,
    designAssetId: ids.designAssetId ?? DESIGN_ID,
    captureAssetId: ids.captureAssetId ?? CAPTURE_ID,
    candidates,
  });
}

test("a design already filed on this page needs no assignment", () => {
  const result = check([
    { id: DESIGN_ID, kind: "design", pageId: PAGE_ID, projectId: PROJECT_ID },
    pageCapture,
  ]);
  assert.deepEqual(result, { ok: true, designNeedsPageAssignment: false });
});

test("a design in this project's library is accepted and flagged for assignment", () => {
  const result = check([
    { id: DESIGN_ID, kind: "design", pageId: null, projectId: PROJECT_ID },
    pageCapture,
  ]);
  assert.deepEqual(result, { ok: true, designNeedsPageAssignment: true });
});

test("a design filed on a sibling page in the same project is rejected", () => {
  const result = check([
    { id: DESIGN_ID, kind: "design", pageId: SIBLING_PAGE_ID, projectId: PROJECT_ID },
    pageCapture,
  ]);
  assert.deepEqual(result, { ok: false, error: "That design belongs to a different page." });
});

test("a design from another project is rejected", () => {
  const result = check([
    { id: DESIGN_ID, kind: "design", pageId: null, projectId: OTHER_PROJECT_ID },
    pageCapture,
  ]);
  assert.deepEqual(result, { ok: false, error: "That design belongs to a different page." });
});

test("an unfiled team-library design with no project is rejected", () => {
  // Reachable from the /assets library, where a design can sit in neither a
  // page nor a project — the picker must not let it in through the back door.
  const result = check([
    { id: DESIGN_ID, kind: "design", pageId: null, projectId: null },
    pageCapture,
  ]);
  assert.deepEqual(result, { ok: false, error: "That design belongs to a different page." });
});

test("a capture is never accepted from the project library", () => {
  const result = check([
    { id: DESIGN_ID, kind: "design", pageId: PAGE_ID, projectId: PROJECT_ID },
    { id: CAPTURE_ID, kind: "capture", pageId: null, projectId: PROJECT_ID },
  ]);
  assert.deepEqual(result, { ok: false, error: "That capture doesn't belong to this page." });
});

test("a capture passed as the design is rejected", () => {
  const result = check([
    { id: DESIGN_ID, kind: "capture", pageId: PAGE_ID, projectId: PROJECT_ID },
    pageCapture,
  ]);
  assert.deepEqual(result, { ok: false, error: "Select a design upload, not a capture." });
});

test("a design passed as the capture is rejected", () => {
  const result = check([
    { id: DESIGN_ID, kind: "design", pageId: PAGE_ID, projectId: PROJECT_ID },
    { id: CAPTURE_ID, kind: "design", pageId: PAGE_ID, projectId: PROJECT_ID },
  ]);
  assert.deepEqual(result, { ok: false, error: "That capture doesn't belong to this page." });
});

test("the same asset cannot be both sides of a comparison", () => {
  const result = check([{ id: DESIGN_ID, kind: "design", pageId: PAGE_ID, projectId: PROJECT_ID }], {
    captureAssetId: DESIGN_ID,
  });
  assert.deepEqual(result, { ok: false, error: "That capture doesn't belong to this page." });
});

test("a design id absent from the candidates is rejected", () => {
  const result = check([pageCapture]);
  assert.deepEqual(result, {
    ok: false,
    error: "That design upload isn't in your team's library.",
  });
});
