import React, { useState, useEffect } from "react";
import {
  Alert,
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import { AntDesign } from "@expo/vector-icons";
import { supabase } from "../services/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    GoogleSignin.configure({
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    });
  }, []);

  async function upsertUser(userId: string, email: string | null, name?: string | null) {
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (existing) return;

    const displayName = name || (email ? email.split("@")[0] : "Rider");
    const base = displayName.toLowerCase().replace(/[^a-z0-9_]/g, "") || "rider";

    const { error } = await supabase.from("users").insert({
      id: userId,
      email: email ?? "",
      name: displayName,
      username: base,
    });

    if (error?.code === "23505") {
      await supabase.from("users").insert({
        id: userId,
        email: email ?? "",
        name: displayName,
        username: `${base}${Math.floor(100 + Math.random() * 900)}`,
      });
    }
  }

  async function signInWithApple() {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        Alert.alert("Apple Sign In Failed", "No identity token returned.");
        return;
      }
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });
      if (error) { Alert.alert("Sign In Failed", error.message); return; }
      if (data.user) {
        const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
          .filter(Boolean).join(" ") || null;
        await upsertUser(data.user.id, data.user.email ?? null, fullName);
      }
    } catch (e: any) {
      if (e.code !== "ERR_REQUEST_CANCELED") {
        Alert.alert("Apple Sign In Failed", e.message);
      }
    }
  }

  async function signInWithGoogle() {
    setGoogleLoading(true);
    try {
      const response = await GoogleSignin.signIn();
      const idToken = (response as any)?.data?.idToken ?? (response as any)?.idToken;
      if (!idToken) {
        Alert.alert("Google Sign In Failed", "No token returned.");
        return;
      }
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
      });
      if (error) { Alert.alert("Sign In Failed", error.message); return; }
      if (data.user) {
        const name = (response as any)?.data?.user?.name ?? (response as any)?.user?.name ?? null;
        await upsertUser(data.user.id, data.user.email ?? null, name);
      }
    } catch (e: any) {
      if (e.code !== statusCodes.SIGN_IN_CANCELLED) {
        Alert.alert("Google Sign In Failed", e.message);
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  async function signInWithEmail() {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      Alert.alert("Sign In Failed", error.message);
    } else if (data?.user?.email) {
      await upsertUser(data.user.id, data.user.email);
    }
    setLoading(false);
  }

  async function signUpWithEmail() {
    setLoading(true);
    const { data: { user }, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      Alert.alert("Sign Up Failed", error.message);
    } else if (user?.email) {
      await upsertUser(user.id, user.email);
      Alert.alert("Check your inbox", "Verify your email to start riding.");
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        <View style={styles.logoWrapper}>
          <Image
            source={require("../assets/images/icon.png")}
            style={styles.logo}
            resizeMode="cover"
          />
        </View>
        <Text style={styles.title}>CREW</Text>
        <Text style={styles.subtitle}>live group ride tracking</Text>

        <View style={styles.socialRow}>
          {/* Apple Sign In — re-enable once Apple Developer Program ($99) is active
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={10}
            style={styles.socialButton}
            onPress={signInWithApple}
          />
          */}

          <TouchableOpacity
            style={styles.socialButton}
            onPress={signInWithGoogle}
            disabled={googleLoading}
            activeOpacity={0.85}
          >
            <View style={styles.googleInner}>
              <AntDesign name="google" size={18} color="#fff" />
              <Text style={styles.googleText}>
                {googleLoading ? "..." : "Sign in with Google"}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#444"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#444"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[styles.emailButton, loading && styles.buttonDisabled]}
            onPress={mode === "signin" ? signInWithEmail : signUpWithEmail}
            disabled={loading}
          >
            <Text style={styles.emailButtonText}>
              {loading ? "..." : mode === "signin" ? "RIDE IN" : "CREATE ACCOUNT"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.switchMode}
            onPress={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            <Text style={styles.switchText}>
              {mode === "signin" ? "New rider? Create account" : "Already have an account? Sign in"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#080808",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  logoWrapper: {
    width: 90,
    height: 90,
    borderRadius: 20,
    overflow: "hidden",
    alignSelf: "center",
    marginBottom: 16,
  },
  logo: {
    width: 90,
    height: 90,
  },
  title: {
    fontSize: 40,
    fontWeight: "900",
    color: "#ffffff",
    textAlign: "center",
    letterSpacing: 14,
  },
  subtitle: {
    color: "#444",
    textAlign: "center",
    marginBottom: 36,
    letterSpacing: 3,
    fontSize: 12,
    textTransform: "uppercase",
  },
  form: {
    gap: 12,
  },
  input: {
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#1e1e1e",
    borderRadius: 10,
    padding: 16,
    fontSize: 16,
    color: "#fff",
  },
  emailButton: {
    backgroundColor: "#ff4500",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  emailButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 3,
  },
  switchMode: {
    alignItems: "center",
    paddingVertical: 12,
  },
  switchText: {
    color: "#444",
    fontSize: 13,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#1e1e1e",
  },
  dividerText: {
    color: "#444",
    fontSize: 12,
    letterSpacing: 1,
  },
  socialRow: {
    gap: 12,
  },
  socialButton: {
    height: 52,
    width: "100%",
    backgroundColor: "#111",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1e1e1e",
    justifyContent: "center",
  },
  googleInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  googleText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
