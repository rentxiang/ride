import React, { useState } from "react";
import {
  Alert,
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { supabase } from "../services/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  async function upsertUser(userId: string, email: string) {
    // Don't overwrite username if user already exists
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("users")
        .update({ name: email.split("@")[0], email })
        .eq("id", userId);
      return;
    }

    // New user — derive a default username from email prefix
    const base = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "");
    const { error } = await supabase.from("users").insert({
      id: userId,
      email,
      name: email.split("@")[0],
      username: base,
    });

    // Username already taken — append random suffix
    if (error?.code === "23505") {
      await supabase.from("users").insert({
        id: userId,
        email,
        name: email.split("@")[0],
        username: `${base}${Math.floor(100 + Math.random() * 900)}`,
      });
    }
  }

  async function signInWithEmail() {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      Alert.alert("Sign In Failed", error.message);
    } else if (data?.user?.email) {
      await upsertUser(data.user.id, data.user.email);
    }
    setLoading(false);
  }

  async function signUpWithEmail() {
    setLoading(true);
    const {
      data: { user },
      error,
    } = await supabase.auth.signUp({ email, password });
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
        <Text style={styles.logo}>◎</Text>
        <Text style={styles.title}>CARVE</Text>
        <Text style={styles.subtitle}>live group ride tracking</Text>

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
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={mode === "signin" ? signInWithEmail : signUpWithEmail}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading
                ? "..."
                : mode === "signin"
                ? "RIDE IN"
                : "CREATE ACCOUNT"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchMode}
            onPress={() =>
              setMode(mode === "signin" ? "signup" : "signin")
            }
          >
            <Text style={styles.switchText}>
              {mode === "signin"
                ? "New rider? Create account"
                : "Already have an account? Sign in"}
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
  logo: {
    fontSize: 52,
    textAlign: "center",
    color: "#ff4500",
    marginBottom: 8,
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
    marginBottom: 52,
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
  button: {
    backgroundColor: "#ff4500",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 3,
  },
  switchMode: {
    alignItems: "center",
    paddingVertical: 14,
  },
  switchText: {
    color: "#444",
    fontSize: 14,
  },
});
