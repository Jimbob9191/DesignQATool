import { chromium, type Browser, type BrowserContext } from "playwright";
import sharp from "sharp";

import {
  autoScrollToTriggerLazyLoad,
  buildElementMap,
  neutralizeFixedAndSticky,
  type ElementMapEntry,
} from "./browser-scripts.js";
import { fitWithinWebpLimits } from "./image-fit.js";

export const PRESET_VIEWPORTS = [390, 768, 1440] as const;
export type PresetViewport = (typeof PRESET_VIEWPORTS)[number];

const CAPTURE_TIMEOUT_MS = 60_000;
const MAX_PAGE_HEIGHT_PX = 20_000;
const DEFAULT_VIEWPORT_HEIGHT = 900;

export type CaptureRequest = {
  url: string;
  viewportWidth: PresetViewport;
  deviceScaleFactor?: number;
};

export type CaptureResult = {
  image: Buffer;
  /** CSS pixels — the space element-map rects and annotation pins live in. */
  width: number;
  height: number;
  /**
   * Ratio of the encoded image's pixel size to the width/height above. 1 for an
   * ordinary page; below 1 when a tall page had to be shrunk to fit WebP's
   * 16383px limit. Reported for diagnostics only — consumers position against
   * width/height, never against the file's intrinsic pixels.
   */
  imageScale: number;
  elementMap: ElementMapEntry[];
};

let sharedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    sharedBrowser = await chromium.launch({ headless: true });
  }
  return sharedBrowser;
}

export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}

const PDF_TIMEOUT_MS = 30_000;

export async function runPdf(url: string): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext();

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void context.close();
  }, PDF_TIMEOUT_MS);

  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load", timeout: PDF_TIMEOUT_MS });
    return await page.pdf({ format: "A4", printBackground: true });
  } catch (error) {
    if (timedOut) {
      throw new Error(`PDF render timed out after ${PDF_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    await context.close().catch(() => {});
  }
}

export async function runCapture(request: CaptureRequest): Promise<CaptureResult> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: request.viewportWidth, height: DEFAULT_VIEWPORT_HEIGHT },
    deviceScaleFactor: request.deviceScaleFactor ?? 1,
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    // force-close so the in-flight Playwright call rejects instead of
    // leaking a context/page past the deadline
    void context.close();
  }, CAPTURE_TIMEOUT_MS);

  try {
    return await captureInContext(context, request);
  } catch (error) {
    if (timedOut) {
      throw new Error(`Capture timed out after ${CAPTURE_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    await context.close().catch(() => {});
  }
}

async function captureInContext(
  context: BrowserContext,
  request: CaptureRequest
): Promise<CaptureResult> {
  // `npm run dev` runs through tsx, whose esbuild transform wraps named inner
  // functions in a `__name(...)` helper. That helper doesn't exist inside the
  // page, so every page.evaluate(...) of browser-scripts.ts would throw
  // "__name is not defined". A no-op shim makes dev match the tsc build.
  await context.addInitScript("globalThis.__name ??= (fn) => fn;");
  const page = await context.newPage();
  await page.goto(request.url, { waitUntil: "load", timeout: CAPTURE_TIMEOUT_MS });

  await page.evaluate(autoScrollToTriggerLazyLoad);
  await page.waitForTimeout(500);
  await page.evaluate(neutralizeFixedAndSticky);

  const contentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const targetHeight = Math.min(contentHeight, MAX_PAGE_HEIGHT_PX);

  await page.setViewportSize({ width: request.viewportWidth, height: targetHeight });
  await page.waitForTimeout(200);

  const elementMap = await page.evaluate(buildElementMap);
  const pngBuffer = await page.screenshot({ type: "png" });

  // The screenshot is CSS pixels times the device scale factor, and a long
  // page overruns what WebP can encode. Shrink it to fit rather than failing
  // the capture: the reported width/height stay in CSS pixels either way, so
  // the element map and every pin drawn against it are unaffected.
  const png = sharp(pngBuffer);
  const metadata = await png.metadata();
  const fitted = fitWithinWebpLimits({ width: metadata.width, height: metadata.height });
  if (fitted.scale < 1) {
    png.resize({ width: fitted.width, height: fitted.height, fit: "fill" });
  }
  const image = await png.webp({ quality: 82 }).toBuffer();

  return {
    image,
    width: request.viewportWidth,
    height: targetHeight,
    imageScale: fitted.scale,
    elementMap,
  };
}
