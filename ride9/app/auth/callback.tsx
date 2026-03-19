import { useEffect } from "react";
import { useRouter } from "expo-router";
import { supabase } from "../../services/supabase";
import { StyleSheet, Text, View } from "react-native";

export default function Callback() {
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const { data: session, error } = await supabase.auth.getSession();
      if (error || !session) {
        console.error("No active session found:", error?.message);
        return;
      }

      console.log("User session:", session);
      router.replace("/(tabs)/friends");
    };

    checkSession();
  }, []);

  return (
    <View style={styles.container}>
      <Text>Processing login...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
