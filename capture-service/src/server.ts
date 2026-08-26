import Fastify from "fastify";
import { z } from "zod";

import { closeBrowser, PRESET_VIEWPORTS, runCapture, runPdf } from "./capture.js";

const PORT = Number(process.env.PORT ?? 8787);
const CAPTURE_SERVICE_SECRET = process.env.CAPTURE_SERVICE_SECRET;

if (!CAPTURE_SERVICE_SECRET) {
  throw new Error("CAPTURE_SERVICE_SECRET is not set.");
}

const captureRequestSchema = z.object({
  url: z.string().url(),
  viewportWidth: z.union([
    z.literal(PRESET_VIEWPORTS[0]),
    z.literal(PRESET_VIEWPORTS[1]),
    z.literal(PRESET_VIEWPORTS[2]),
  ]),
  deviceScaleFactor: z.number().min(1).max(3).optional(),
});

const pdfRequestSchema = z.object({
  url: z.string().url(),
});

const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });

app.get("/health", async () => ({ ok: true }));

app.post("/capture", async (request, reply) => {
  const authHeader = request.headers.authorization;
  if (authHeader !== `Bearer ${CAPTURE_SERVICE_SECRET}`) {
    return reply.code(401).send({ error: "Unauthorized" });
  }

  const parsed = captureRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }

  try {
    const result = await runCapture(parsed.data);
    return reply.send({
      image: result.image.toString("base64"),
      mime: "image/webp",
      width: result.width,
      height: result.height,
      imageScale: result.imageScale,
      elementMap: result.elementMap,
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(502).send({
      error: error instanceof Error ? error.message : "Capture failed",
    });
  }
});

app.post("/pdf", async (request, reply) => {
  const authHeader = request.headers.authorization;
  if (authHeader !== `Bearer ${CAPTURE_SERVICE_SECRET}`) {
    return reply.code(401).send({ error: "Unauthorized" });
  }

  const parsed = pdfRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }

  try {
    const pdf = await runPdf(parsed.data.url);
    return reply.send({ pdf: pdf.toString("base64") });
  } catch (error) {
    request.log.error(error);
    return reply.code(502).send({
      error: error instanceof Error ? error.message : "PDF render failed",
    });
  }
});

async function shutdown() {
  await closeBrowser();
  await app.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

app
  .listen({ port: PORT, host: "0.0.0.0" })
  .then(() => app.log.info(`capture-service listening on :${PORT}`))
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
