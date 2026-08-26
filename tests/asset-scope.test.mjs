import assert from "node:assert/strict";
import test from "node:test";

import { resolveAssetScope } from "../src/lib/assets/scope.ts";
import { confirmUploadSchema, requestUploadUrlSchema } from "../src/lib/validations/asset.ts";

const PAGE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const ASSET_ID = "44444444-4444-4444-8444-444444444444";

test("resolveAssetScope rejects a page that is not in the team", () => {
  const result = resolveAssetScope({
    pageId: PAGE_ID,
    projectId: PROJECT_ID,
    pageProjectId: null,
  });
  assert.deepEqual(result, { ok: false, error: "Page not found." });
});

test("resolveAssetScope rejects a page/project pair that disagrees", () => {
  const result = resolveAssetScope({
    pageId: PAGE_ID,
    projectId: OTHER_PROJECT_ID,
    pageProjectId: PROJECT_ID,
  });
  assert.deepEqual(result, {
    ok: false,
    error: "That page does not belong to the selected project.",
  });
});

test("resolveAssetScope derives the project from the page", () => {
  const result = resolveAssetScope({
    pageId: PAGE_ID,
    projectId: null,
    pageProjectId: PROJECT_ID,
  });
  assert.deepEqual(result, { ok: true, scope: { pageId: PAGE_ID, projectId: PROJECT_ID } });
});

test("resolveAssetScope lets a matching client projectId through unchanged", () => {
  const result = resolveAssetScope({
    pageId: PAGE_ID,
    projectId: PROJECT_ID,
    pageProjectId: PROJECT_ID,
  });
  assert.deepEqual(result, { ok: true, scope: { pageId: PAGE_ID, projectId: PROJECT_ID } });
});

test("resolveAssetScope keeps a project-only scope", () => {
  const result = resolveAssetScope({
    pageId: null,
    projectId: PROJECT_ID,
    pageProjectId: null,
  });
  assert.deepEqual(result, { ok: true, scope: { pageId: null, projectId: PROJECT_ID } });
});

test("resolveAssetScope keeps an unscoped asset unscoped", () => {
  const result = resolveAssetScope({ pageId: null, projectId: null, pageProjectId: null });
  assert.deepEqual(result, { ok: true, scope: { pageId: null, projectId: null } });
});

test("the page wins over a stale pageProjectId the client did not send", () => {
  // The client offered no project at all; the stored pair must still name one.
  const result = resolveAssetScope({
    pageId: PAGE_ID,
    projectId: null,
    pageProjectId: OTHER_PROJECT_ID,
  });
  assert.equal(result.ok, true);
  assert.equal(result.scope.projectId, OTHER_PROJECT_ID, "project always comes from the page row");
});

const requestUploadBase = {
  pageId: null,
  filename: "hero.png",
  mime: "image/png",
  size: 1024,
};

test("requestUploadUrlSchema accepts a null projectId", () => {
  const result = requestUploadUrlSchema.safeParse({ ...requestUploadBase, projectId: null });
  assert.equal(result.success, true);
  assert.equal(result.data.projectId, null);
});

test("requestUploadUrlSchema accepts a uuid projectId", () => {
  const result = requestUploadUrlSchema.safeParse({ ...requestUploadBase, projectId: PROJECT_ID });
  assert.equal(result.success, true);
  assert.equal(result.data.projectId, PROJECT_ID);
});

test("requestUploadUrlSchema rejects a non-uuid projectId", () => {
  const result = requestUploadUrlSchema.safeParse({ ...requestUploadBase, projectId: "abc" });
  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].path[0], "projectId");
});

const confirmUploadBase = {
  assetId: ASSET_ID,
  storagePath: "team/asset.png",
  pageId: null,
  mime: "image/png",
  width: 800,
  height: 600,
};

test("confirmUploadSchema accepts a null projectId", () => {
  const result = confirmUploadSchema.safeParse({ ...confirmUploadBase, projectId: null });
  assert.equal(result.success, true);
  assert.equal(result.data.projectId, null);
});

test("confirmUploadSchema accepts a uuid projectId", () => {
  const result = confirmUploadSchema.safeParse({ ...confirmUploadBase, projectId: PROJECT_ID });
  assert.equal(result.success, true);
  assert.equal(result.data.projectId, PROJECT_ID);
});

test("confirmUploadSchema rejects a non-uuid projectId", () => {
  const result = confirmUploadSchema.safeParse({ ...confirmUploadBase, projectId: "abc" });
  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].path[0], "projectId");
});
