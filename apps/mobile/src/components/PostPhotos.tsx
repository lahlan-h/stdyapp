import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useStyles } from "@theme";
import type { FeedPhoto } from "@data";

import PhotoViewer from "./PhotoViewer";
import { clampPhotoRatio } from "./photoRatio";

interface PostPhotosProps {
  photos: FeedPhoto[];
  /** The post's title, for a screen reader. */
  title: string;
  /**
   * The frame - width, borders - which differs between feed and detail. Its
   * aspectRatio is replaced: by a lone photo's own shape, or by the grid's.
   */
  style: StyleProp<ImageStyle>;
}

/** Until a lone photo's real shape is known. */
const DEFAULT_RATIO = 1;

/**
 * Facebook's post grids, by photo count: which photos sit in which row, and
 * how tall each row is relative to the others.
 *
 *   2  side by side
 *   3  one wide on top, two below
 *   4  two by two
 *   5  two on top, three below
 *
 * The 3:2 rows make the top tiles the feature and keep every tile in the
 * five-photo grid the same shape (0.5 x 0.6 above, 0.33 x 0.4 below).
 */
const GRIDS: Record<number, { rows: number[][]; heights: number[] }> = {
  2: { rows: [[0, 1]], heights: [1] },
  3: { rows: [[0], [1, 2]], heights: [3, 2] },
  4: { rows: [[0, 1], [2, 3]], heights: [1, 1] },
  5: { rows: [[0, 1], [2, 3, 4]], heights: [3, 2] },
};

/**
 * A grid is always square. Its photos are cropped to their tiles anyway, so
 * their own shapes would not survive - and a fixed frame keeps every
 * several-photo card the same height in the feed. The viewer shows each whole.
 */
const GRID_RATIO = 1;

/**
 * Each measured photo's shape, remembered for the session.
 *
 * Only for lone photos uploaded before their dimensions were recorded - newer
 * ones carry width and height and are never measured. A feed recycles its rows
 * as they scroll, so without this an older card would open square and jump to
 * its real height each time it came back into view.
 */
const measured = new Map<string, number>();

/** A lone photo's frame: its own shape, within photoRatio.ts's limits. */
const usePhotoRatio = (photo: FeedPhoto | undefined): number => {
  const known =
    photo?.width && photo?.height ? clampPhotoRatio(photo.width, photo.height) : undefined;
  const [ratio, setRatio] = useState(
    () => known ?? (photo ? measured.get(photo.url) : undefined) ?? DEFAULT_RATIO,
  );

  useEffect(() => {
    if (!photo) return;
    if (known) {
      setRatio(known);
      return;
    }
    const cached = measured.get(photo.url);
    if (cached) {
      setRatio(cached);
      return;
    }

    let cancelled = false;
    Image.getSize(
      photo.url,
      (width, height) => {
        if (!width || !height) return;
        const next = clampPhotoRatio(width, height);
        measured.set(photo.url, next);
        if (!cancelled) setRatio(next);
      },
      () => {
        /* unmeasurable: stay square, which is what every photo used to be */
      },
    );
    return () => {
      cancelled = true;
    };
  }, [photo, known]);

  return ratio;
};

/**
 * A post's photos, which open full size when tapped.
 *
 * One photo shows on its own, in its own shape. Two to five are laid out in
 * one of Facebook's grids (GRIDS), every photo visible at once, each cropped to
 * its tile - tapping any opens the viewer on that photo, where they can all be
 * swiped through whole.
 *
 * Its own Pressable per photo, so on a feed card - where the whole card opens
 * the post - a tap on a photo opens the photo instead, as on Facebook and X.
 *
 * The viewer lives here rather than on the screen, unlike the report dialog
 * PostCard documents. That dialog had to survive its row scrolling out of the
 * FlatList's window; the viewer covers the whole screen, so nothing can scroll
 * while it is open.
 */
const PostPhotos = ({ photos, title, style }: PostPhotosProps) => {
  const styles = useStyles("home");
  const loneRatio = usePhotoRatio(photos.length === 1 ? photos[0] : undefined);
  const [openAt, setOpenAt] = useState<number | null>(null);

  if (photos.length === 0) return null;

  const grid = GRIDS[photos.length];
  const frame = style as StyleProp<ViewStyle>;

  const tile = (index: number) => (
    <Pressable
      key={photos[index].id}
      style={styles.photoGridTile}
      onPress={() => setOpenAt(index)}
      accessibilityRole="imagebutton"
      accessibilityLabel={
        photos.length > 1
          ? `Photo ${index + 1} of ${photos.length}: ${title}. Open full size`
          : `Photo: ${title}. Open full size`
      }
    >
      <Image style={styles.photoGridImage} source={{ uri: photos[index].url }} resizeMode="cover" />
    </Pressable>
  );

  return (
    <>
      {grid ? (
        <View style={[frame, styles.photoGrid, { aspectRatio: GRID_RATIO }]}>
          {grid.rows.map((row, rowIndex) => (
            <View key={rowIndex} style={[styles.photoGridRow, { flex: grid.heights[rowIndex] }]}>
              {row.map(tile)}
            </View>
          ))}
        </View>
      ) : (
        <View style={[frame, { aspectRatio: loneRatio }]}>{tile(0)}</View>
      )}

      {openAt !== null ? (
        <PhotoViewer
          photos={photos}
          initialIndex={openAt}
          label={title}
          onClose={() => setOpenAt(null)}
        />
      ) : null}
    </>
  );
};

export default PostPhotos;
