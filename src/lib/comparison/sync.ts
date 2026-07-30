import type { PanZoomState } from "@/hooks/use-pan-zoom";

// Design and capture images have different intrinsic sizes, so pan/zoom
// can't be synced as raw pixels — everything is normalized by each image's
// own width ("proportional position"), then re-expanded for the other pane.
export type NormalizedView = { zoom: number; txRatio: number; tyRatio: number };

export function normalizeView(state: PanZoomState, imageWidth: number): NormalizedView {
  return {
    zoom: state.scale * imageWidth,
    txRatio: state.tx / imageWidth,
    tyRatio: state.ty / imageWidth,
  };
}

export function denormalizeView(norm: NormalizedView, imageWidth: number): PanZoomState {
  return {
    scale: norm.zoom / imageWidth,
    tx: norm.txRatio * imageWidth,
    ty: norm.tyRatio * imageWidth,
  };
}
