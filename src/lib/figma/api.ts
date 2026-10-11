import "server-only";

// A thin client for the few Figma REST endpoints we use. Figma rate-limits by
// endpoint tier and by the user's seat: rendering and reading nodes are Tier 1,
// which View and Collab seats get only a handful of times a month, while file
// metadata is Tier 3 and far cheaper. So change checks only ever use /meta,
// and an import or re-sync spends exactly two Tier 1 calls (nodes + images).
// https://developers.figma.com/docs/rest-api/rate-limits/

const API = "https://api.figma.com/v1";

/** An expected failure, with a message fit to show the user as-is. */
export class FigmaError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export type FigmaToken = { type: "pat" | "oauth"; value: string };

function authHeaders(token: FigmaToken): HeadersInit {
  return token.type === "pat"
    ? { "X-Figma-Token": token.value }
    : { Authorization: `Bearer ${token.value}` };
}

function messageFor(status: number, retryAfter: string | null): string {
  switch (status) {
    case 401:
    case 403:
      return "Figma refused access. Check that your token is still valid in Settings and that you can open this file in Figma.";
    case 404:
      return "Figma couldn't find that file or frame. Check the link, and that you can open it in Figma.";
    case 429: {
      const minutes = retryAfter ? Math.ceil(Number(retryAfter) / 60) : null;
      const when = minutes && Number.isFinite(minutes) ? ` Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.` : "";
      return `Figma's rate limit for your account was reached. View and Collab seats get very few renders a month; Full and Dev seats get many more.${when}`;
    }
    default:
      return `Figma returned an error (${status}). Try again in a moment.`;
  }
}

async function figmaGet<T>(token: FigmaToken, path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      headers: authHeaders(token),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new FigmaError("Couldn't reach Figma. Try again in a moment.", 0);
  }
  if (!response.ok) {
    throw new FigmaError(messageFor(response.status, response.headers.get("retry-after")), response.status);
  }
  return (await response.json()) as T;
}

export type FigmaUser = { id: string; handle: string; email: string | null };

export async function getMe(token: FigmaToken): Promise<FigmaUser> {
  const me = await figmaGet<{ id: string; handle: string; email?: string }>(token, "/me");
  return { id: me.id, handle: me.handle, email: me.email ?? null };
}

export type FigmaFileMeta = { name: string; version: string };

/** Tier 3: cheap enough to call whenever a comparison is opened. */
export async function getFileMeta(token: FigmaToken, fileKey: string): Promise<FigmaFileMeta> {
  const { file } = await figmaGet<{ file: { name: string; version: string } }>(
    token,
    `/files/${encodeURIComponent(fileKey)}/meta`
  );
  return { name: file.name, version: file.version };
}

export type FigmaFrame = { name: string; type: string; width: number; height: number };

/** Tier 1. The node's name, type and size at the given file version. */
export async function getFrame(
  token: FigmaToken,
  fileKey: string,
  nodeId: string,
  version: string
): Promise<FigmaFrame> {
  const params = new URLSearchParams({ ids: nodeId, depth: "1", version });
  const data = await figmaGet<{
    nodes: Record<
      string,
      {
        document: {
          name: string;
          type: string;
          absoluteBoundingBox: { width: number; height: number } | null;
        };
      } | null
    >;
  }>(token, `/files/${encodeURIComponent(fileKey)}/nodes?${params}`);

  const node = data.nodes[nodeId]?.document;
  if (!node) {
    throw new FigmaError("That frame no longer exists in the Figma file.", 404);
  }
  if (!node.absoluteBoundingBox) {
    throw new FigmaError("That layer can't be rendered. Link to a frame instead.", 400);
  }
  return {
    name: node.name,
    type: node.type,
    width: node.absoluteBoundingBox.width,
    height: node.absoluteBoundingBox.height,
  };
}

/**
 * Tier 1. Renders the node as a PNG and downloads it; Figma's own URL for the
 * render expires, so callers store the bytes. use_absolute_bounds crops to the
 * frame itself, not including drop shadows that spill past its edges, so the
 * image lines up with the page it's compared against.
 */
export async function renderPng(
  token: FigmaToken,
  fileKey: string,
  nodeId: string,
  { scale, version }: { scale: number; version: string }
): Promise<Uint8Array> {
  const params = new URLSearchParams({
    ids: nodeId,
    scale: String(scale),
    format: "png",
    use_absolute_bounds: "true",
    version,
  });
  const data = await figmaGet<{ err: string | null; images: Record<string, string | null> }>(
    token,
    `/images/${encodeURIComponent(fileKey)}?${params}`
  );
  const imageUrl = data.images?.[nodeId];
  if (data.err || !imageUrl) {
    throw new FigmaError("Figma couldn't render that frame. Try again, or check it isn't empty.", 500);
  }

  let image: Response;
  try {
    image = await fetch(imageUrl, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new FigmaError("Couldn't download the render from Figma. Try again in a moment.", 0);
  }
  if (!image.ok) {
    throw new FigmaError("Couldn't download the render from Figma. Try again in a moment.", image.status);
  }
  return new Uint8Array(await image.arrayBuffer());
}
