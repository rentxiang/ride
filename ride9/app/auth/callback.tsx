import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { supabase } from "@/services/supabase";

function parseSupabaseUrl(url: string) {
  const fragment = url.split("#")[1] ?? url.split("?")[1] ?? "";
  return Object.fromEntries(new URLSearchParams(fragment));
}

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    Linking.getInitialURL().then(async (url) => {
      if (!url) {
        router.replace("/login");
        return;
      }

      const params = parseSupabaseUrl(url);

      try {
        if (params.access_token && params.refresh_token) {
          await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
        } else if (params.code) {
          await supabase.auth.exchangeCodeForSession(params.code);
        } else {
          router.replace("/login");
          return;
        }
        router.replace("/(tabs)");
      } catch {
        router.replace("/login");
      }
    });
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#ff4500" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#080808",
    justifyContent: "center",
    alignItems: "center",
  },
});
