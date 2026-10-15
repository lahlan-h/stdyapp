import { useEffect, useState } from "react";
import {
  FlatList,
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
   * aspectRatio is replaced by the first photo's own.
   */
  style: StyleProp<ImageStyle>;
}

/** Until the real shape is known. */
const DEFAULT_RATIO = 1;

/**
 * Each measured photo's shape, remembered for the session.
 *
 * Only for photos uploaded before their dimensions were recorded - newer ones
 * carry width and height and are never measured. A feed recycles its rows as
 * they scroll, so without this an older card would open square and jump to
 * its real height each time it came back into view.
 */
const measured = new Map<string, number>();

/** The frame's shape: the photo's own, within photoRatio.ts's limits. */
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
 * One photo shows on its own; several become a swipeable row with dots, as on
 * Instagram. Every photo in the row shares the FIRST one's frame, so swiping
 * never changes the card's height under the finger - a photo of another shape
 * is cropped to fit here and shown whole in the viewer.
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
  const aspectRatio = usePhotoRatio(photos[0]);
  // The row's own width, for the pages. Measured, because the frame's width
  // comes from its container and differs between the feed and the post page.
  const [width, setWidth] = useState(0);
  const [current, setCurrent] = useState(0);
  const [openAt, setOpenAt] = useState<number | null>(null);

  if (photos.length === 0) return null;

  const photo = (item: FeedPhoto, index: number) => (
    <Pressable
      onPress={() => setOpenAt(index)}
      accessibilityRole="imagebutton"
      accessibilityLabel={
        photos.length > 1
          ? `Photo ${index + 1} of ${photos.length}: ${title}. Open full size`
          : `Photo: ${title}. Open full size`
      }
    >
      <Image
        // The row's measured width; "100%" stands in until the first layout,
        // which a lone photo needs and a paged row does not wait for.
        style={[styles.carouselPhoto, { width: width || "100%", aspectRatio }]}
        source={{ uri: item.url }}
        resizeMode="cover"
      />
    </Pressable>
  );

  return (
    <>
      <View
        style={[style as StyleProp<ViewStyle>, { aspectRatio }]}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {photos.length === 1 ? (
          photo(photos[0], 0)
        ) : (
          <FlatList
            data={photos}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => photo(item, index)}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            // onScroll rather than onMomentumScrollEnd: the latter never fires
            // on web, and the dots must follow there too.
            onScroll={(event) => {
              if (!width) return;
              const next = Math.round(event.nativeEvent.contentOffset.x / width);
              if (next !== current) setCurrent(next);
            }}
            scrollEventThrottle={32}
          />
        )}

        {photos.length > 1 ? (
          <View style={styles.carouselDots} pointerEvents="none">
            {photos.map((item, index) => (
              <View
                key={item.id}
                style={[styles.carouselDot, index === current && styles.carouselDotActive]}
              />
            ))}
          </View>
        ) : null}
      </View>

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
