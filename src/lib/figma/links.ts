// Figma share links → the file key and node id the REST API wants, and back.
// Pure, so it can run on either side and be unit-tested.

export type FigmaFrameRef = { fileKey: string; nodeId: string };

export type ParseFigmaLinkResult =
  | { success: true; data: FigmaFrameRef }
  | { success: false; error: string };

const FILE_KEY = /^[A-Za-z0-9]{10,64}$/;
// API node ids are "1:23"; instances inside components chain them, e.g.
// "I1:23;4:56". Links write the colons as dashes.
const NODE_ID = /^I?\d+:\d+(;\d+:\d+)*$/;

/**
 * Parses links like figma.com/design/<key>/<name>?node-id=1-23. Branch links
 * (/design/<key>/branch/<branchKey>/…) point at the branch, whose key the API
 * treats as a file of its own. A link without a node-id names the whole file,
 * which we don't render: the design side is one frame.
 */
export function parseFigmaLink(input: string): ParseFigmaLinkResult {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { success: false, error: "That isn't a link. Paste a figma.com link to a frame." };
  }

  const host = url.hostname.toLowerCase();
  if (host !== "figma.com" && host !== "www.figma.com") {
    return { success: false, error: "That isn't a figma.com link." };
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (!["design", "file", "proto"].includes(segments[0] ?? "") || !segments[1]) {
    return { success: false, error: "That link doesn't point at a Figma design file." };
  }
  const fileKey = segments[2] === "branch" && segments[3] ? segments[3] : segments[1];
  if (!FILE_KEY.test(fileKey)) {
    return { success: false, error: "That link doesn't point at a Figma design file." };
  }

  const rawNodeId = url.searchParams.get("node-id");
  if (!rawNodeId) {
    return {
      success: false,
      error: "That link is to the whole file. In Figma, right-click the frame and choose Copy link to selection.",
    };
  }
  const nodeId = rawNodeId.replaceAll("-", ":");
  if (!NODE_ID.test(nodeId)) {
    return { success: false, error: "That link's node-id doesn't look right." };
  }

  return { success: true, data: { fileKey, nodeId } };
}

/** A link that opens the file in Figma with the frame selected. */
export function figmaFrameUrl({ fileKey, nodeId }: FigmaFrameRef): string {
  return `https://www.figma.com/design/${fileKey}?node-id=${encodeURIComponent(nodeId.replaceAll(":", "-"))}`;
}
