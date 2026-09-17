import { View, Text } from "react-native";

import { useHomeStyles } from "@theme";

interface PostCardBodyProps {
  caption: string;
}

/**
 * The post's text.
 *
 * One field, not two: the old backend carried a separate title and caption, but
 * a Post has only a caption, so the bold line renders that.
 */
const PostCardBody = ({ caption }: PostCardBodyProps) => {
  const homeStyles = useHomeStyles();

  return (
    <View style={homeStyles.postCardBody}>
      <Text style={homeStyles.bold}>{caption}</Text>
    </View>
  );
};

export default PostCardBody;
