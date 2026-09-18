import { View, Text } from "react-native";

import { useHomeStyles } from "@theme";

interface PostCardBodyProps {
  title: string;
  caption?: string;
}

/**
 * The post's text: a headline, and supporting text when there is any.
 *
 * The caption is the optional half. A post is complete with a title and a
 * photo, so the second Text is dropped entirely rather than rendered empty -
 * an empty Text still takes the container's gap and leaves a ragged space
 * under the title.
 */
const PostCardBody = ({ title, caption }: PostCardBodyProps) => {
  const homeStyles = useHomeStyles();

  return (
    <View style={homeStyles.postCardBody}>
      <Text style={homeStyles.bold}>{title}</Text>
      {caption ? <Text style={homeStyles.soft}>{caption}</Text> : null}
    </View>
  );
};

export default PostCardBody;
