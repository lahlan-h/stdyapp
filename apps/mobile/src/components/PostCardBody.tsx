import { View, Text } from "react-native";

import { useStyles } from "@theme";

interface PostCardBodyProps {
  title: string;
  caption?: string;
}

const PostCardBody = ({ title, caption }: PostCardBodyProps) => {
  const homeStyles = useStyles("home");

  return (
    <View style={homeStyles.postCardBody}>
      <Text style={homeStyles.bold}>{title}</Text>
      {caption ? <Text style={homeStyles.soft}>{caption}</Text> : null}
    </View>
  );
};

export default PostCardBody;
