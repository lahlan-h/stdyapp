import { View, Text } from "react-native";
import React from "react";
import useTheme from "@hooks/useTheme";
import { createHomeStyles } from "assets/styles/home.styles";

interface PostCardBodyProps {
  title: string;
  caption?: string | undefined;
}

const PostCardBody = ({ title, caption }: PostCardBodyProps) => {
  const { colors } = useTheme();
  const homeStyles = createHomeStyles(colors);

  return (
    <View style={homeStyles.postCardBody}>
      <Text style={homeStyles.bold}>{title}</Text>
      <Text style={homeStyles.soft}>{caption}</Text>
    </View>
  );
};

export default PostCardBody;
