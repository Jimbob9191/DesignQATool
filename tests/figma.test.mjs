import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { decryptToken, encryptToken } from "../src/lib/figma/crypto.ts";
import { FIGMA_MAX_RENDER_PIXELS, pickRenderScale, pngSize } from "../src/lib/figma/image.ts";
import { figmaFrameUrl, parseFigmaLink } from "../src/lib/figma/links.ts";

test("a design link with a node-id gives the file key and an API node id", () => {
  assert.deepEqual(
    parseFigmaLink("https://www.figma.com/design/AbCdEf1234567890/Marketing-site?node-id=12-345&t=xyz-0"),
    { success: true, data: { fileKey: "AbCdEf1234567890", nodeId: "12:345" } }
  );
});

test("older /file/ links and encoded colons are accepted", () => {
  assert.deepEqual(parseFigmaLink("https://figma.com/file/AbCdEf1234567890/Site?node-id=1%3A2"), {
    success: true,
    data: { fileKey: "AbCdEf1234567890", nodeId: "1:2" },
  });
});

test("branch links point at the branch", () => {
  const result = parseFigmaLink(
    "https://www.figma.com/design/AbCdEf1234567890/branch/BrAnCh12345678/Site?node-id=3-4"
  );
  assert.deepEqual(result, { success: true, data: { fileKey: "BrAnCh12345678", nodeId: "3:4" } });
});

test("instance node ids keep their chain", () => {
  const result = parseFigmaLink("https://www.figma.com/design/AbCdEf1234567890/x?node-id=I1-2;3-4");
  assert.deepEqual(result, { success: true, data: { fileKey: "AbCdEf1234567890", nodeId: "I1:2;3:4" } });
});

test("links without a node-id, to other hosts, or malformed are refused", () => {
  assert.equal(parseFigmaLink("https://www.figma.com/design/AbCdEf1234567890/Site").success, false);
  assert.equal(parseFigmaLink("https://evil.example/design/AbCdEf1234567890/x?node-id=1-2").success, false);
  assert.equal(parseFigmaLink("https://www.figma.com/community/file/123?node-id=1-2").success, false);
  assert.equal(parseFigmaLink("https://www.figma.com/design/AbCdEf1234567890/x?node-id=abc").success, false);
  assert.equal(parseFigmaLink("not a url").success, false);
});

test("frame URLs round-trip through the parser", () => {
  const ref = { fileKey: "AbCdEf1234567890", nodeId: "12:345" };
  assert.deepEqual(parseFigmaLink(figmaFrameUrl(ref)), { success: true, data: ref });
});

test("renders at 2x unless that's over Figma's pixel cap", () => {
  assert.equal(pickRenderScale({ width: 1440, height: 5000 }), 2);
  assert.equal(pickRenderScale({ width: 1440, height: 9000 }), 1);
  assert.equal(pickRenderScale({ width: 1440, height: FIGMA_MAX_RENDER_PIXELS / 1440 + 1 }), null);
});

test("reads a PNG's size from its header", () => {
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000005a0000007d00806000000",
    "hex"
  );
  assert.deepEqual(pngSize(png), { width: 1440, height: 2000 });
  assert.equal(pngSize(Buffer.from("ffd8ffe000104a46494600010100000100010000", "hex")), null);
  assert.equal(pngSize(new Uint8Array(4)), null);
});

test("tokens decrypt with the right key only", () => {
  const key = randomBytes(32).toString("base64");
  const stored = encryptToken("figd_secret", key);
  assert.ok(!stored.includes("figd_secret"));
  assert.equal(decryptToken(stored, key), "figd_secret");
  assert.equal(decryptToken(stored, randomBytes(32).toString("base64")), null);

  const [version, iv, tag, ciphertext] = stored.split(".");
  const tampered = [version, iv, tag, Buffer.from("x" + ciphertext).toString("base64url")].join(".");
  assert.equal(decryptToken(tampered, key), null);
});
