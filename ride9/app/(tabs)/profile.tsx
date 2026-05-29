import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Linking,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../services/supabase";
import { getProfile, updateProfile, avatarUrl, deleteAccount, UserProfile } from "../../services/profile";
import { getNotificationsEnabled, setNotificationsEnabled } from "../../services/notifications";
import { useLocationSharing } from "../../contexts/LocationSharingContext";

// TODO: replace with your hosted PRIVACY.md URL (e.g. GitHub Pages / Notion public page)
const PRIVACY_URL = "https://tianxiangren.github.io/crew-privacy/";

const AVATAR_SEEDS = [
  "canyon", "nightrider", "apex", "throttle",
  "ghost", "storm", "bolt", "hawk",
  "rider", "moto", "cruise", "drift",
];

export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bike, setBike] = useState("");
  const [selectedSeed, setSelectedSeed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(true);

  const { stopSharing } = useLocationSharing();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) return;
      const p = await getProfile(data.user.id);
      if (p) {
        setProfile(p);
        setName(p.name);
        setUsername(p.username ?? "");
        setBike(p.bike ?? "");
        setSelectedSeed(p.avatar_seed);
      }
      setNotifEnabled(await getNotificationsEnabled(data.user.id));
      setLoading(false);
    };
    load();
  }, []);

  const toggleNotifications = async (next: boolean) => {
    if (!profile) return;
    setNotifEnabled(next);
    await setNotificationsEnabled(profile.id, next);
  };

  const handleSave = async () => {
    if (!profile) return;
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter your name.");
      return;
    }
    const cleanUsername = username.replace(/^@/, "").toLowerCase().trim();
    if (cleanUsername && !/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      Alert.alert("Invalid tag", "Use 3–20 characters: letters, numbers, underscores only.");
      return;
    }
    setSaving(true);
    try {
      await updateProfile(profile.id, {
        name: name.trim(),
        username: cleanUsername || undefined,
        bike: bike.trim() || undefined,
        avatar_seed: selectedSeed ?? undefined,
      });
      setProfile({
        ...profile,
        name: name.trim(),
        username: cleanUsername || null,
        bike: bike.trim() || null,
        avatar_seed: selectedSeed,
      });
      Alert.alert("Saved", "Profile updated.");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
    setSaving(false);
  };

  const handleSignOut = async () => {
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await stopSharing();
          await supabase.auth.signOut();
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This permanently deletes your account, profile, friends, location and voice data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert("Are you sure?", "This is permanent.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete my account",
                style: "destructive",
                onPress: async () => {
                  try {
                    const { data } = await supabase.auth.getUser();
                    if (!data?.user) return;
                    await stopSharing();
                    await deleteAccount(data.user.id);
                  } catch (e: any) {
                    Alert.alert("Couldn't delete account", e.message);
                  }
                },
              },
            ]);
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#ff4500" />
      </View>
    );
  }

  const currentAvatarUrl = avatarUrl(selectedSeed, profile?.email ?? "");

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <Text style={styles.headerTitle}>PROFILE</Text>

      {/* Current avatar preview */}
      <View style={styles.avatarPreview}>
        <Image source={{ uri: currentAvatarUrl }} style={styles.avatarLarge} />
        <View style={styles.avatarGlow} />
      </View>

      {/* Avatar picker */}
      <Text style={styles.sectionLabel}>CHOOSE AVATAR</Text>
      <View style={styles.avatarGrid}>
        {AVATAR_SEEDS.map((seed) => {
          const isSelected = selectedSeed === seed;
          return (
            <TouchableOpacity
              key={seed}
              onPress={() => setSelectedSeed(seed)}
              style={[styles.avatarOption, isSelected && styles.avatarOptionSelected]}
              activeOpacity={0.75}
            >
              <Image
                source={{ uri: avatarUrl(seed, seed) }}
                style={styles.avatarThumb}
              />
              {isSelected && (
                <View style={styles.avatarCheckmark}>
                  <Ionicons name="checkmark" size={12} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Rider tag */}
      <Text style={styles.sectionLabel}>RIDER TAG</Text>
      <View style={styles.tagWrapper}>
        <Text style={styles.atSign}>@</Text>
        <TextInput
          style={styles.tagInput}
          value={username}
          onChangeText={(t) => setUsername(t.replace(/^@/, "").toLowerCase())}
          placeholder="yourtag"
          placeholderTextColor="#333"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
        />
      </View>
      <Text style={styles.inputHint}>Your crew adds you by this tag · 3–20 chars, no spaces</Text>

      {/* Name */}
      <Text style={styles.sectionLabel}>NAME</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor="#333"
      />

      {/* Bike */}
      <Text style={styles.sectionLabel}>MY BIKE</Text>
      <TextInput
        style={styles.input}
        value={bike}
        onChangeText={setBike}
        placeholder="e.g. 2023 Yamaha R6"
        placeholderTextColor="#333"
      />
      <Text style={styles.inputHint}>Shown on the map to your crew</Text>

      {/* Email (read-only) */}
      <Text style={styles.sectionLabel}>EMAIL</Text>
      <View style={styles.readOnlyField}>
        <Text style={styles.readOnlyText}>{profile?.email}</Text>
      </View>

      {/* Save */}
      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.85}
      >
        <Text style={styles.saveButtonText}>{saving ? "Saving..." : "Save Profile"}</Text>
      </TouchableOpacity>

      {/* Notifications toggle */}
      <View style={styles.notifRow}>
        <View>
          <Text style={styles.notifTitle}>Police alerts</Text>
          <Text style={styles.notifSub}>Push when a rider reports police nearby</Text>
        </View>
        <Switch
          value={notifEnabled}
          onValueChange={toggleNotifications}
          trackColor={{ false: "#222", true: "#ff450080" }}
          thumbColor={notifEnabled ? "#ff4500" : "#444"}
        />
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={18} color="#444" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      {/* Delete account */}
      <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
        <Text style={styles.deleteText}>Delete Account</Text>
      </TouchableOpacity>

      {/* Privacy policy */}
      <TouchableOpacity style={styles.privacyButton} onPress={() => Linking.openURL(PRIVACY_URL)}>
        <Text style={styles.privacyText}>Privacy Policy</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#080808",
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#080808",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 6,
    marginBottom: 28,
  },

  // Avatar preview
  avatarPreview: {
    alignSelf: "center",
    marginBottom: 28,
    position: "relative",
  },
  avatarLarge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: "#ff4500",
  },
  avatarGlow: {
    position: "absolute",
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: "rgba(255, 69, 0, 0.12)",
    top: -8,
    left: -8,
  },

  // Avatar grid
  avatarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 28,
  },
  avatarOption: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: "#1a1a1a",
    overflow: "hidden",
    position: "relative",
  },
  avatarOptionSelected: {
    borderColor: "#ff4500",
  },
  avatarThumb: {
    width: "100%",
    height: "100%",
  },
  avatarCheckmark: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#ff4500",
    borderRadius: 8,
    width: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
  },

  tagWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#1e1e1e",
    borderRadius: 10,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  atSign: {
    color: "#ff4500",
    fontSize: 16,
    fontWeight: "700",
    marginRight: 4,
  },
  tagInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: "#fff",
  },

  // Fields
  sectionLabel: {
    color: "#333",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 3,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#1e1e1e",
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: "#fff",
    marginBottom: 6,
  },
  inputHint: {
    color: "#2a2a2a",
    fontSize: 11,
    marginBottom: 24,
    letterSpacing: 0.3,
  },
  readOnlyField: {
    backgroundColor: "#0c0c0c",
    borderWidth: 1,
    borderColor: "#141414",
    borderRadius: 10,
    padding: 14,
    marginBottom: 28,
  },
  readOnlyText: {
    color: "#333",
    fontSize: 15,
  },

  // Buttons
  saveButton: {
    backgroundColor: "#ff4500",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 1,
  },
  notifRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
    marginTop: 24,
  },
  notifTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  notifSub: {
    color: "#555",
    fontSize: 12,
    marginTop: 2,
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  signOutText: {
    color: "#444",
    fontSize: 14,
  },
  deleteButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    marginBottom: 8,
  },
  deleteText: {
    color: "#5a2a2a",
    fontSize: 13,
  },
  privacyButton: {
    alignItems: "center",
    paddingVertical: 8,
    marginBottom: 24,
  },
  privacyText: {
    color: "#333",
    fontSize: 12,
    textDecorationLine: "underline",
  },
});
