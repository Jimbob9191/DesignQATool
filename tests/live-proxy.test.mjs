import assert from "node:assert/strict";
import test from "node:test";

import { decodeHost, encodeHost, proxyLabelFor, targetFromLabel } from "../src/lib/live/proxy-label.ts";
import { siteOf } from "../live-proxy/src/handler.ts";

const SECRET = "test-secret-at-least-16";

test("host encoding round-trips hyphens, dots and punycode", () => {
  for (const host of ["acme.com", "www.acme-co.com", "a--b.example.org", "xn--bcher-kva.de", "my-site.co.uk"]) {
    assert.equal(decodeHost(encodeHost(host)), host);
  }
});

test("a label resolves back to the origin it was signed for", async () => {
  const label = await proxyLabelFor(SECRET, "https://www.acme-co.com/pricing?plan=pro");
  assert.match(label, /^s[0-9a-f]{10}-www-acme--co-com$/);
  assert.deepEqual(await targetFromLabel(SECRET, label), {
    scheme: "https",
    host: "www.acme-co.com",
    origin: "https://www.acme-co.com",
  });
});

test("http sites get their own scheme flag", async () => {
  const label = await proxyLabelFor(SECRET, "http://legacy.example.com/");
  assert.equal(label[0], "i");
  assert.equal((await targetFromLabel(SECRET, label)).origin, "http://legacy.example.com");
});

test("a tampered or foreign label is rejected", async () => {
  const label = await proxyLabelFor(SECRET, "https://acme.com");
  assert.equal(await targetFromLabel("another-secret-value", label), null);
  assert.equal(await targetFromLabel(SECRET, label.replace("acme", "evil")), null);
  assert.equal(await targetFromLabel(SECRET, `s0000000000-acme-com`), null);
  assert.equal(await targetFromLabel(SECRET, "not-a-label"), null);
});

test("hosts the proxy must never fetch can't get a label", async () => {
  for (const url of [
    "http://localhost/",
    "http://127.0.0.1/",
    "https://printer.local/",
    "https://db.internal/",
    "https://acme.com:8443/",
    "ftp://acme.com/",
    `https://${"a".repeat(60)}.com/`,
  ]) {
    assert.equal(await proxyLabelFor(SECRET, url), null, url);
  }
});

test("hosts are grouped by registrable domain", () => {
  assert.equal(siteOf("www.acme.com"), "acme.com");
  assert.equal(siteOf("cdn.assets.acme.com"), "acme.com");
  assert.equal(siteOf("shop.acme.co.uk"), "acme.co.uk");
  assert.equal(siteOf("acme.co.uk"), "acme.co.uk");
});
