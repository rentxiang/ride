import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import "react-native-reanimated";
import * as Linking from "expo-linking";
import { supabase } from "@/services/supabase";
import { LocationSharingProvider } from "@/contexts/LocationSharingContext";

function parseSupabaseUrl(url: string) {
  // Tokens can be in fragment (#) or query string (?)
  const fragment = url.split("#")[1] ?? url.split("?")[1] ?? "";
  const params = Object.fromEntries(new URLSearchParams(fragment));
  return params;
}

async function handleAuthUrl(url: string) {
  const params = parseSupabaseUrl(url);
  if (params.access_token && params.refresh_token) {
    await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
  } else if (params.code) {
    await supabase.auth.exchangeCodeForSession(params.code);
  }
}

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const [session, setSession] = useState<any>(undefined);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Handle deep link when app is already open
    const linkingSub = Linking.addEventListener("url", ({ url }) => {
      handleAuthUrl(url);
    });

    // Handle deep link that launched the app
    Linking.getInitialURL().then((url) => {
      if (url) handleAuthUrl(url);
    });

    return () => {
      subscription.unsubscribe();
      linkingSub.remove();
    };
  }, []);

  useEffect(() => {
    if (session === undefined) return;

    const inLogin = segments[0] === "login";

    if (!session && !inLogin) {
      router.replace("/login");
    } else if (session && inLogin) {
      router.replace("/(tabs)");
    }
  }, [session, segments]);

  if (session === undefined) return null;

  return (
    <ThemeProvider value={DarkTheme}>
      <LocationSharingProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="light" />
      </LocationSharingProvider>
    </ThemeProvider>
  );
}
