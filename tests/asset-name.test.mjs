import assert from "node:assert/strict";
import test from "node:test";

import { assetDisplayName } from "../src/lib/assets/name.ts";

test("a stored name is shown as-is", () => {
  assert.equal(assetDisplayName({ name: "Homepage v2.png", storagePath: "team/abc.png" }), "Homepage v2.png");
});

test("rows without a name fall back to the storage basename", () => {
  assert.equal(assetDisplayName({ name: null, storagePath: "team/abc.png" }), "abc.png");
});
