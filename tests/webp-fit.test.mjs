import assert from "node:assert/strict";
import test from "node:test";

import { fitWithinWebpLimits, WEBP_MAX_DIMENSION } from "../capture-service/src/image-fit.ts";

test("leaves an ordinary capture untouched", () => {
  assert.deepEqual(fitWithinWebpLimits({ width: 1440, height: 4200 }), {
    width: 1440,
    height: 4200,
    scale: 1,
  });
});

test("leaves an image sitting exactly on the limit untouched", () => {
  const result = fitWithinWebpLimits({ width: 1440, height: WEBP_MAX_DIMENSION });
  assert.equal(result.scale, 1);
  assert.equal(result.height, WEBP_MAX_DIMENSION);
});

test("shrinks a page taller than the WebP limit to fit", () => {
  // The tallest capture the service can produce: MAX_PAGE_HEIGHT_PX at the
  // widest preset viewport — the shape that failed on foundationhealth.com.
  const result = fitWithinWebpLimits({ width: 1440, height: 20_000 });
  assert.ok(result.height <= WEBP_MAX_DIMENSION, `height ${result.height} still over the limit`);
  assert.ok(result.width <= WEBP_MAX_DIMENSION);
  assert.equal(result.height, WEBP_MAX_DIMENSION);
  assert.ok(result.scale < 1);
  // Aspect ratio preserved to within the flooring of a single pixel.
  assert.ok(Math.abs(result.width / result.height - 1440 / 20_000) < 1e-4);
});

test("shrinks against the longest side when width is the one over", () => {
  const result = fitWithinWebpLimits({ width: 40_000, height: 800 });
  assert.equal(result.width, WEBP_MAX_DIMENSION);
  assert.ok(result.height <= WEBP_MAX_DIMENSION);
});

test("accounts for the device scale factor multiplying both dimensions", () => {
  // 1440x12000 CSS px at deviceScaleFactor 2 lands at 2880x24000 pixels.
  const result = fitWithinWebpLimits({ width: 2880, height: 24_000 });
  assert.ok(result.width <= WEBP_MAX_DIMENSION && result.height <= WEBP_MAX_DIMENSION);
});

test("never floors a dimension away to zero", () => {
  const result = fitWithinWebpLimits({ width: 1, height: 1_000_000 });
  assert.equal(result.width, 1);
  assert.ok(result.height <= WEBP_MAX_DIMENSION);
});
