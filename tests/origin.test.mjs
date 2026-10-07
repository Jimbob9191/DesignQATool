import assert from "node:assert/strict";
import test from "node:test";

import { resolveAppOrigin } from "../src/lib/origin.ts";

const prod = {
  forwardedProto: "https",
  siteUrl: "https://www.designparity.app",
  isDev: false,
};

test("an allowlisted site host keeps the site URL", () => {
  assert.equal(resolveAppOrigin({ ...prod, host: "www.designparity.app" }), "https://www.designparity.app");
  assert.equal(resolveAppOrigin({ ...prod, host: "WWW.DesignParity.app" }), "https://www.designparity.app");
});

test("a missing Host falls back to the site URL", () => {
  assert.equal(resolveAppOrigin({ ...prod, host: null }), "https://www.designparity.app");
  assert.equal(
    resolveAppOrigin({ ...prod, host: null, siteUrl: "https://www.designparity.app/" }),
    "https://www.designparity.app"
  );
});

test("Vercel preview hosts are honoured, always over https", () => {
  const preview = {
    ...prod,
    forwardedProto: "http",
    vercelUrl: "design-qa-tool-abc123.vercel.app",
    vercelBranchUrl: "design-qa-tool-git-feature.vercel.app",
  };
  assert.equal(
    resolveAppOrigin({ ...preview, host: "design-qa-tool-abc123.vercel.app" }),
    "https://design-qa-tool-abc123.vercel.app"
  );
  assert.equal(
    resolveAppOrigin({ ...preview, host: "design-qa-tool-git-feature.vercel.app" }),
    "https://design-qa-tool-git-feature.vercel.app"
  );
  assert.equal(resolveAppOrigin({ ...preview, host: "other-app.vercel.app" }), "https://www.designparity.app");
});

test("a spoofed Host gets the site URL, never itself", () => {
  assert.equal(resolveAppOrigin({ ...prod, host: "evil.example" }), "https://www.designparity.app");
  assert.equal(resolveAppOrigin({ ...prod, host: "www.designparity.app.evil.example" }), "https://www.designparity.app");
  assert.equal(resolveAppOrigin({ ...prod, host: "designparity.app" }), "https://www.designparity.app");
});

test("localhost is only trusted on a dev server", () => {
  assert.equal(resolveAppOrigin({ ...prod, host: "localhost:3000" }), "https://www.designparity.app");

  const dev = { host: "localhost:3000", forwardedProto: null, siteUrl: "http://localhost:3000", isDev: true };
  assert.equal(resolveAppOrigin(dev), "http://localhost:3000");
  assert.equal(resolveAppOrigin({ ...dev, host: "127.0.0.1:3001" }), "http://127.0.0.1:3001");
  assert.equal(resolveAppOrigin({ ...dev, host: "localhost:3443", forwardedProto: "https" }), "https://localhost:3443");
  assert.equal(resolveAppOrigin({ ...dev, host: "localhost.evil.example" }), "http://localhost:3000");
});
