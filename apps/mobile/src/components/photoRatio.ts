/**
 * How tall and how wide a post photo's frame may get, as width / height.
 *
 * Instagram's 4:5 at the tall end, so one portrait photo cannot fill the
 * screen; 2:1 at the wide end, so a panorama does not shrink to a strip.
 * Anything in between - a 16:9 slide, a 4:3 photo - shows whole. The full-size
 * viewer shows everything, whatever its shape.
 *
 * Shared by the feed (PostPhoto) and the compose screen's preview, so what you
 * see before posting is the frame everyone else will see.
 */
export const TALLEST_PHOTO_RATIO = 4 / 5;
export const WIDEST_PHOTO_RATIO = 2;

/** A photo's own shape, held within the limits above. 1 when unknown. */
export const clampPhotoRatio = (width?: number, height?: number): number =>
  width && height
    ? Math.min(WIDEST_PHOTO_RATIO, Math.max(TALLEST_PHOTO_RATIO, width / height))
    : 1;
