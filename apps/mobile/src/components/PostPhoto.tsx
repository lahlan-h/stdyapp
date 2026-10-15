import { useEffect, useState } from "react";
import { Image, Pressable, type ImageStyle, type StyleProp } from "react-native";

import PhotoViewer from "./PhotoViewer";
import { clampPhotoRatio } from "./photoRatio";

interface PostPhotoProps {
  uri: string;
  /** The post's title, for a screen reader. */
  title: string;
  /** The photo's frame - width, borders - which differ between feed and detail. */
  style: StyleProp<ImageStyle>;
}

/** Until the real shape is known. */
const DEFAULT_RATIO = 1;

/**
 * Each photo's shape, remembered for the session.
 *
 * A feed recycles its rows as they scroll, so without this every card would
 * open square and jump to its real height each time it came back into view.
 */
const ratios = new Map<string, number>();

/** The photo's frame shape: its own, within photoRatio.ts's limits. */
const usePhotoRatio = (uri: string): number => {
  const [ratio, setRatio] = useState(() => ratios.get(uri) ?? DEFAULT_RATIO);

  useEffect(() => {
    const known = ratios.get(uri);
    if (known) {
      setRatio(known);
      return;
    }

    let cancelled = false;
    Image.getSize(
      uri,
      (width, height) => {
        if (!width || !height) return;
        const next = clampPhotoRatio(width, height);
        ratios.set(uri, next);
        if (!cancelled) setRatio(next);
      },
      () => {
        /* unmeasurable: stay square, which is what every photo used to be */
      },
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);

  return ratio;
};

/**
 * A post's photo, in its own shape, which opens full size when tapped.
 *
 * Framed at the photo's own aspect ratio rather than a fixed square: a square
 * frame with "cover" cut the sides off every landscape photo - a 16:9 slide
 * lost almost half its width. Only beyond the limits in photoRatio.ts does
 * anything get cropped now.
 *
 * Its own Pressable, so on a feed card - where the whole card opens the post -
 * a tap on the photo opens the photo instead, as on Facebook and X.
 *
 * The viewer lives here rather than on the screen, unlike the report dialog
 * PostCard documents. That dialog had to survive its row scrolling out of the
 * FlatList's window; the viewer covers the whole screen, so nothing can scroll
 * while it is open.
 */
const PostPhoto = ({ uri, title, style }: PostPhotoProps) => {
  const [open, setOpen] = useState(false);
  const aspectRatio = usePhotoRatio(uri);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel={`Photo: ${title}. Open full size`}
      >
        <Image style={[style, { aspectRatio }]} source={{ uri }} resizeMode="cover" />
      </Pressable>
      {open ? <PhotoViewer uri={uri} label={title} onClose={() => setOpen(false)} /> : null}
    </>
  );
};

export default PostPhoto;
