import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { supabase } from "../../services/supabase";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Alert,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getFriends, addFriend, removeFriend } from "../../services/friends";
import { getProfile } from "../../services/profile";
import { useLocationSharing } from "../../contexts/LocationSharingContext";

type Friend = {
  friend_id: string;
  friend: { name: string; username: string | null; bike: string | null };
};

function isLive(loc: any): boolean {
  return !!loc?.is_sharing;
}

export default function Friends() {
  const router = useRouter();
  const { setFocusCoords } = useLocationSharing();

  const [user, setUser] = useState<any>(null);
  const [selfUsername, setSelfUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [locations, setLocations] = useState<Record<string, any>>({});
  const [tag, setTag] = useState("");

  useEffect(() => {
    const init = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) return;
      setUser(data.user);
      await fetchFriends(data.user.id);
      const profile = await getProfile(data.user.id);
      setSelfUsername(profile?.username ?? null);
      setLoading(false);
    };

    init();

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setUser(null);
    });

    return () => subscription?.subscription.unsubscribe();
  }, []);

  const fetchFriends = async (userId: string) => {
    const data = await getFriends(userId);
    const mapped = data.map((item: any) => ({
      friend_id: item.friend_id,
      friend: item.friend,
    }));
    setFriends(mapped);
    fetchLocations(mapped.map((f: Friend) => f.friend_id));
  };

  const fetchLocations = async (friendIds: string[]) => {
    if (friendIds.length === 0) { setLocations({}); return; }
    const { data } = await supabase
      .from("locations")
      .select("user_id, lat, lng, is_sharing, updated_at")
      .in("user_id", friendIds);
    const map: Record<string, any> = {};
    data?.forEach((loc: any) => { map[loc.user_id] = loc; });
    setLocations(map);
  };

  // Realtime location updates for friends
  useEffect(() => {
    if (!user || friends.length === 0) return;
    const friendIds = friends.map((f) => f.friend_id);
    const channel = supabase
      .channel("friends-page-locations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "locations" },
        (payload) => {
          const updated = payload.new as any;
          if (!friendIds.includes(updated.user_id)) return;
          setLocations((prev) => ({ ...prev, [updated.user_id]: updated }));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [friends, user]);

  const handleAddFriend = async () => {
    const cleanTag = tag.replace(/^@/, "").trim();
    if (!cleanTag) {
      Alert.alert("Enter a rider tag", "Type their @tag to add them.");
      return;
    }
    try {
      await addFriend(user.id, cleanTag);
      Alert.alert("Added!", `@${cleanTag} is now in your crew.`);
      setTag("");
      fetchFriends(user.id);
    } catch (e: any) {
      Alert.alert("Couldn't add rider", e.message);
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    Alert.alert("Remove Rider", "Remove this rider from your crew?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await removeFriend(user.id, friendId);
            fetchFriends(user.id);
          } catch {
            Alert.alert("Error", "Failed to remove rider");
          }
        },
      },
    ]);
  };

  const handleLocateFriend = (friendId: string) => {
    const loc = locations[friendId];
    if (!loc?.lat || !loc?.lng || !isLive(loc)) return;
    router.navigate("/");
    setTimeout(() => {
      setFocusCoords({ latitude: loc.lat, longitude: loc.lng });
    }, 350);
  };

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("friends-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friends", filter: `user_id=eq.${user.id}` },
        () => fetchFriends(user.id)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CREW</Text>
      <Text style={styles.subtitle}>{selfUsername ? `@${selfUsername}` : user?.email}</Text>

      <View style={styles.addContainer}>
        <View style={styles.inputWrapper}>
          <Text style={styles.atSign}>@</Text>
          <TextInput
            style={styles.input}
            placeholder="rider tag"
            placeholderTextColor="#333"
            value={tag}
            onChangeText={(t) => setTag(t.replace(/^@/, "").toLowerCase())}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <TouchableOpacity style={styles.addButton} onPress={handleAddFriend}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>RIDERS · {friends.length}</Text>

      <FlatList
        data={friends}
        keyExtractor={(item) => item.friend_id}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No crew yet</Text>
            <Text style={styles.emptySubText}>
              Add riders by their @tag — they can find theirs in the ME tab
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const live = isLive(locations[item.friend_id]);
          const hasLocation = !!locations[item.friend_id]?.lat;
          return (
            <View style={styles.friendItem}>
              <TouchableOpacity
                style={styles.friendInfo}
                onPress={() => handleLocateFriend(item.friend_id)}
                activeOpacity={hasLocation ? 0.6 : 1}
              >
                <View style={[styles.friendDot, live && styles.friendDotLive]} />
                <View>
                  <Text style={styles.name}>{item.friend.name}</Text>
                  {item.friend.username ? (
                    <Text style={styles.handle}>@{item.friend.username}</Text>
                  ) : null}
                  {item.friend.bike ? (
                    <Text style={styles.bike}>{item.friend.bike}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemoveFriend(item.friend_id)}
              >
                <Ionicons name="close" size={16} color="#444" />
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
    backgroundColor: "#080808",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#080808",
  },
  loadingText: {
    color: "#444",
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 6,
    marginBottom: 4,
  },
  subtitle: {
    color: "#444",
    fontSize: 12,
    marginBottom: 28,
  },
  addContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 28,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#1e1e1e",
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  atSign: {
    color: "#ff4500",
    fontSize: 16,
    fontWeight: "700",
    marginRight: 4,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: "#fff",
  },
  addButton: {
    backgroundColor: "#ff4500",
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
  },
  sectionLabel: {
    color: "#333",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 3,
    marginBottom: 12,
  },
  friendItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#111",
  },
  friendInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  friendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#222",
  },
  friendDotLive: {
    backgroundColor: "#ff4500",
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  handle: {
    color: "#444",
    fontSize: 12,
    marginTop: 2,
  },
  bike: {
    color: "#2a2a2a",
    fontSize: 11,
    marginTop: 2,
  },
  removeButton: {
    padding: 8,
  },
  emptyContainer: {
    paddingVertical: 32,
    alignItems: "center",
    gap: 8,
  },
  emptyText: {
    color: "#333",
    fontSize: 14,
    fontWeight: "600",
  },
  emptySubText: {
    color: "#222",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
});
