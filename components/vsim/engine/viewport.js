/* Süreç tuvali viewport dönüşümleri — saf. view = { x, y, zoom }:
   x/y = pan piksel ofseti (ekran uzayı), zoom = ölçek. Ekran = canvas*zoom + pan. */
export const clampZoom = (z, min, max) => Math.min(max, Math.max(min, z));
export function screenToCanvas(view, sx, sy) {
  return { x: (sx - view.x) / view.zoom, y: (sy - view.y) / view.zoom };
}
export function canvasToScreen(view, cx, cy) {
  return { x: cx * view.zoom + view.x, y: cy * view.zoom + view.y };
}
/* İmleç (sx,sy) altındaki canvas noktasını sabit tutarak zoom uygula. */
export function zoomAt(view, sx, sy, factor, min, max) {
  const zoom = clampZoom(view.zoom * factor, min, max);
  const k = zoom / view.zoom;
  return { x: sx - (sx - view.x) * k, y: sy - (sy - view.y) * k, zoom };
}
export const pan = (view, dx, dy) => ({ ...view, x: view.x + dx, y: view.y + dy });

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 3;
