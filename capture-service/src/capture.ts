import { chromium, type Browser, type BrowserContext } from "playwright";
import sharp from "sharp";

import {
  autoScrollToTriggerLazyLoad,
  buildElementMap,
  neutralizeFixedAndSticky,
  type ElementMapEntry,
} from "./browser-scripts.js";

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
  width: number;
  height: number;
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
  const image = await sharp(pngBuffer).webp({ quality: 82 }).toBuffer();

  return {
    image,
    width: request.viewportWidth,
    height: targetHeight,
    elementMap,
  };
}
