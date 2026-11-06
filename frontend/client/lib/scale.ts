/** ==================================================================
 * unscaleBox — Map displayed coordinates back to natural mosaic space
 * ===================================================================
 * PURPOSE:
 * - Inverse of scaleBox. Converts CSS pixel coordinates measured
 *   from the rendered image back into native mosaic coordinate space.
 *
 * SCIENTIFIC CONTEXT:
 * - Needed when user manipulates overlays (drag/resize) on scaled images
 *   and we must persist coordinates relative to the original resolution.
 *
 * @param box       Bounding box in displayed (CSS) coordinates
 * @param natural   Original mosaic width/height
 * @param displayed Current rendered image size
 * @returns Coordinates in original mosaic pixel space
 * ===================================================================
 */
export function unscaleBox(
  box: { x:number; y:number; width:number; height:number },
  natural : { w:number; h:number },
  displayed: { w:number; h:number }
) {
  const sx = natural.w / displayed.w;
  const sy = natural.h / displayed.h;
  return {
    x     : box.x      * sx,
    y     : box.y      * sy,
    width : box.width  * sx,
    height: box.height * sy,
  };
}
