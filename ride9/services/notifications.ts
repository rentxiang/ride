import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabase";

const PROJECT_ID = "25ac9531-0cd3-4676-ad46-dcc3e5f3a126";

// Foreground notification behavior — show banner + play sound
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request notification permission, fetch the Expo push token, persist it on
 * the user's row. Returns the token (or null on permission denied / error).
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let granted = existing === "granted";
    if (!granted) {
      const { status } = await Notifications.requestPermissionsAsync();
      granted = status === "granted";
    }
    if (!granted) return null;

    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    const token = tokenResult.data;
    if (!token) return null;

    await supabase.from("users").update({ push_token: token }).eq("id", userId);
    return token;
  } catch (e) {
    console.error("Push registration failed:", (e as Error).message);
    return null;
  }
}

export async function clearPushToken(userId: string) {
  await supabase.from("users").update({ push_token: null }).eq("id", userId);
}

export async function setNotificationsEnabled(userId: string, enabled: boolean) {
  await supabase.from("users").update({ notifications_enabled: enabled }).eq("id", userId);
}

export async function getNotificationsEnabled(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("users")
    .select("notifications_enabled")
    .eq("id", userId)
    .maybeSingle();
  return data?.notifications_enabled !== false; // default true
}
