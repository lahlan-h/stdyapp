import useTheme from "@hooks/useTheme";
import { FlatList, StatusBar, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { createHomeStyles } from "assets/styles/home.styles";
import { SafeAreaView } from "react-native-safe-area-context";

import Header from "components/Header";
import PostCard from "components/PostCard";

import { useQuery } from "convex/react";
import { api, Doc, Id } from "@stdyapp/core";

// TODOs -
//  (1) - Loading spinner if waiting for incoming data - or skeleton page
//  (2) - Page if no posts we're retrieved

type Post = Doc<"posts">;

const Index = () => {
  const { colors, isDarkMode } = useTheme();
  const homeStyles = createHomeStyles(colors);

  const posts = useQuery(api.posts.getPosts);

  return (
    <LinearGradient colors={colors.gradients.background} style={homeStyles.container}>
      <StatusBar barStyle={colors.statusBarStyle}></StatusBar>
      {/* Home Page Content Here*/}
      <SafeAreaView style={homeStyles.safeArea} edges={["top", "left", "right"]}>
        {/* Enable Switching Between 'Feeds'*/}
        <Header />
        {/* FlatList -> PostCard */}
        {/* TODO - Implement page if no posts are retrieved ... */}
        <FlatList
          data={posts}
          keyExtractor={(post) => post._id}
          renderItem={({ item }: { item: Post }) => <PostCard post={item} />}
          style={homeStyles.postCardList}
          ListEmptyComponent={<View></View>}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 4, paddingTop: 8, gap: 10 }}
        />
      </SafeAreaView>
    </LinearGradient>
  );
};

export default Index;
