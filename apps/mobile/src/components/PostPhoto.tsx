import { useState } from "react";
import { Image, Pressable, type ImageStyle, type StyleProp } from "react-native";

import PhotoViewer from "./PhotoViewer";

interface PostPhotoProps {
  uri: string;
  /** The post's title, for a screen reader. */
  title: string;
  /** The photo's size and frame, which differ between the feed and detail. */
  style: StyleProp<ImageStyle>;
}

/**
 * A post's photo, which opens full size when tapped.
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

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel={`Photo: ${title}. Open full size`}
      >
        <Image style={style} source={{ uri }} resizeMode="cover" />
      </Pressable>
      {open ? <PhotoViewer uri={uri} label={title} onClose={() => setOpen(false)} /> : null}
    </>
  );
};

export default PostPhoto;
