/** ==================================================================
 * scaleBox — Map natural image coordinates to displayed CSS pixels
 * ===================================================================
 * PURPOSE:
 * - Converts a rectangle defined in the original mosaic's native
 *   pixel resolution into scaled coordinates suitable for CSS overlay.
 *
 * SCIENTIFIC CONTEXT:
 * - Required when overlaying PAR component bounding boxes onto
 *   resized images in the browser.
 * - Preserves spatial proportion while adapting to current viewport.
 *
 * @param box       Bounding box in natural mosaic coordinates
 * @param natural   Original mosaic width/height
 * @param displayed Actual on-screen <img> size in pixels
 * @returns CSS pixel coordinates: {left, top, width, height}
 * ===================================================================
 */
export function scaleBox(
  box: { x:number; y:number; width:number; height:number },
  natural: { w:number; h:number },
  displayed: { w:number; h:number }
) {
  const sx = displayed.w / natural.w;
  const sy = displayed.h / natural.h;
  return {
    left  : box.x      * sx,
    top   : box.y      * sy,
    width : box.width  * sx,
    height: box.height * sy,
  };
}
