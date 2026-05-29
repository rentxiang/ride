import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  TextInput,
  Share,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../../services/supabase";
import { useLocationSharing } from "../../contexts/LocationSharingContext";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  deleteRoom,
  getRoomMembers,
  subscribeRoomMembers,
  RoomMember,
} from "../../services/rooms";
import { getRoute, subscribeRoute, RoomRoute } from "../../services/routes";
import { addFriendById } from "../../services/friends";
import RouteEditor from "../../components/RouteEditor";

export default function RideScreen() {
  const router = useRouter();
  const { isSharing, startSharing, currentRoom, setCurrentRoom, coordsRef, showRoute, setShowRoute, setFocusCoords } =
    useLocationSharing();

  const [authUser, setAuthUser] = useState<any>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [isJoining, setIsJoining] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [route, setRoute] = useState<RoomRoute | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [friendSet, setFriendSet] = useState<Set<string>>(new Set()); // accepted friends
  const [pendingSet, setPendingSet] = useState<Set<string>>(new Set()); // outgoing requests

  const realtimeSubRef = useRef<any>(null);
  const routeSubRef = useRef<any>(null);

  const isHost = currentRoom?.host_id === authUser?.id;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setAuthUser(data.user);
    });
  }, []);

  // Load own friends/pending sets so member rows can show "+" or "Pending"
  const loadFriendSets = async (uid: string) => {
    const { data } = await supabase
      .from("friends")
      .select("user_id, friend_id, status")
      .or(`user_id.eq.${uid},friend_id.eq.${uid}`);
    const accepted = new Set<string>();
    const pending = new Set<string>();
    (data ?? []).forEach((r: any) => {
      const other = r.user_id === uid ? r.friend_id : r.user_id;
      if (r.status === "accepted") accepted.add(other);
      else if (r.status === "pending" && r.user_id === uid) pending.add(other);
    });
    setFriendSet(accepted);
    setPendingSet(pending);
  };

  useEffect(() => {
    if (!authUser) return;
    loadFriendSets(authUser.id);
    const channel = supabase
      .channel(`ride-friend-sets-${authUser.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "friends", filter: `user_id=eq.${authUser.id}` },
        () => loadFriendSets(authUser.id)
      )
      .on("postgres_changes",
        { event: "*", schema: "public", table: "friends", filter: `friend_id=eq.${authUser.id}` },
        () => loadFriendSets(authUser.id)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [authUser]);

  const handleLocateMember = async (member: RoomMember) => {
    if (member.user_id === authUser?.id) return; // don't locate self
    const { data } = await supabase
      .from("locations")
      .select("lat, lng, is_sharing, updated_at")
      .eq("user_id", member.user_id)
      .maybeSingle();
    if (!data?.lat || !data?.lng) {
      Alert.alert("No location", `${member.name} hasn't shared their location.`);
      return;
    }
    router.navigate("/");
    setTimeout(() => {
      setFocusCoords({ latitude: data.lat, longitude: data.lng });
    }, 350);
  };

  const handleAddRoommate = async (member: RoomMember) => {
    if (!authUser) return;
    try {
      const result = await addFriendById(authUser.id, member.user_id);
      setPendingSet((p) => new Set(p).add(member.user_id));
      if ((result as any)?.autoAccepted) {
        Alert.alert("Crew up!", `${member.name} is now in your crew.`);
      } else {
        Alert.alert("Request sent", `Waiting for ${member.name} to accept.`);
      }
    } catch (e: any) {
      Alert.alert("Couldn't add", e.message);
    }
  };

  // Load members + route whenever room changes
  useEffect(() => {
    if (!currentRoom) {
      setMembers([]);
      setRoute(null);
      realtimeSubRef.current?.unsubscribe();
      realtimeSubRef.current = null;
      routeSubRef.current?.unsubscribe();
      routeSubRef.current = null;
      return;
    }

    loadMembers();
    loadRoute();

    realtimeSubRef.current = subscribeRoomMembers(currentRoom.id, loadMembers);
    routeSubRef.current = subscribeRoute(currentRoom.id, loadRoute);

    return () => {
      realtimeSubRef.current?.unsubscribe();
      realtimeSubRef.current = null;
      routeSubRef.current?.unsubscribe();
      routeSubRef.current = null;
    };
  }, [currentRoom?.id]);

  const loadMembers = async () => {
    if (!currentRoom) return;
    const data = await getRoomMembers(currentRoom.id);
    // Empty = the room was closed by the host (members cascade-removed)
    if (data.length === 0) {
      setMembers([]);
      if (currentRoom.host_id !== authUser?.id) {
        Alert.alert("Ride ended", "The host ended this group ride.");
      }
      setCurrentRoom(null);
      return;
    }
    setMembers(data);
  };

  const loadRoute = async () => {
    if (!currentRoom) return;
    try {
      setRoute(await getRoute(currentRoom.id));
    } catch {
      /* transient error — keep current route */
    }
  };

  const handleStartRide = async () => {
    if (!authUser) return;
    setLoading(true);
    try {
      const room = await createRoom(authUser.id);
      setCurrentRoom(room);
      if (!isSharing) await startSharing(authUser.id);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
    setLoading(false);
  };

  const handleJoinRide = async () => {
    if (!authUser || !joinCode.trim()) return;
    setLoading(true);
    try {
      const room = await joinRoom(joinCode, authUser.id);
      setCurrentRoom(room);
      setIsJoining(false);
      setJoinCode("");
      if (!isSharing) await startSharing(authUser.id);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
    setLoading(false);
  };

  const handleEndRide = () => {
    Alert.alert("End Group Ride", "This will remove all riders from the room.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End Ride",
        style: "destructive",
        onPress: async () => {
          if (!currentRoom) return;
          await deleteRoom(currentRoom.id);
          setCurrentRoom(null);
          // stay online — leaving a room doesn't stop location sharing
        },
      },
    ]);
  };

  const handleLeaveRide = () => {
    Alert.alert("Leave Ride", "You'll stop seeing the group's location.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          if (!currentRoom || !authUser) return;
          await leaveRoom(currentRoom.id, authUser.id);
          setCurrentRoom(null);
          // stay online — leaving a room doesn't stop location sharing
        },
      },
    ]);
  };

  const handleShareCode = () => {
    if (!currentRoom) return;
    Share.share({
      message: `Join my group ride! Code: ${currentRoom.code}`,
    });
  };

  const openFullRoute = () => {
    const wps = route?.waypoints ?? [];
    if (wps.length === 0) return;
    const dest = wps[wps.length - 1];
    if (wps.length === 1) {
      Linking.openURL(
        `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`
      );
      return;
    }
    const origin = wps[0];
    const mids = wps.slice(1, -1).map((w) => `${w.lat},${w.lng}`).join("|");
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}&travelmode=driving`;
    if (mids) url += `&waypoints=${encodeURIComponent(mids)}`;
    Linking.openURL(url);
  };


  // ─── Idle ────────────────────────────────────────────────────────────────
  if (!currentRoom && !isJoining) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>GROUP RIDE</Text>
          <View style={{ width: 20 }} />
        </View>

        <View style={styles.idleContent}>
          <Text style={styles.idleIcon}>◎</Text>
          <Text style={styles.idleTitle}>Start or join a ride</Text>
          <Text style={styles.idleSubtitle}>
            Create a room and share the code with your crew — no friend requests needed
          </Text>
        </View>

        <View style={styles.idleActions}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleStartRide}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Ionicons name="radio-button-on" size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>
              {loading ? "Creating..." : "Start Group Ride"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setIsJoining(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>Join a Ride</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Join ────────────────────────────────────────────────────────────────
  if (!currentRoom && isJoining) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setIsJoining(false)}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>JOIN RIDE</Text>
          <View style={{ width: 22 }} />
        </View>

        <View style={styles.joinContent}>
          <Text style={styles.joinLabel}>ROOM CODE</Text>
          <TextInput
            style={styles.codeInput}
            placeholder="Enter 6-digit code"
            placeholderTextColor="#333"
            value={joinCode}
            onChangeText={setJoinCode}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />
          <TouchableOpacity
            style={[styles.primaryButton, !joinCode.trim() && styles.buttonDisabled]}
            onPress={handleJoinRide}
            disabled={loading || !joinCode.trim()}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? "Joining..." : "Join Ride"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Active Room ─────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>GROUP RIDE</Text>
        <View style={{ width: 20 }} />
      </View>

      {/* Room code card */}
      <TouchableOpacity
        style={styles.codeCard}
        onPress={handleShareCode}
        activeOpacity={0.8}
      >
        <View style={styles.codeCardTop}>
          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text style={styles.liveLabel}>LIVE · {isHost ? "HOSTING" : "JOINED"}</Text>
          </View>
          <Ionicons name="share-outline" size={18} color="#444" />
        </View>
        <Text style={styles.roomCode}>{currentRoom!.code}</Text>
        <Text style={styles.codeTap}>Tap to share with crew</Text>
      </TouchableOpacity>

      {/* Route card */}
      <View style={styles.routeCard}>
        <View style={styles.routeCardLeft}>
          <Ionicons name="map-outline" size={18} color="#ff4500" />
          <View>
            <Text style={styles.routeTitle}>ROUTE</Text>
            <Text style={styles.routeSub}>
              {route && route.waypoints.length > 0
                ? `${route.waypoints.length} stop${route.waypoints.length > 1 ? "s" : ""}`
                : "No route yet"}
            </Text>
          </View>
        </View>
        <View style={styles.routeActions}>
          {route && route.waypoints.length > 0 && (
            <>
              <TouchableOpacity style={styles.routeIconBtn} onPress={openFullRoute}>
                <Ionicons name="navigate" size={18} color="#ff4500" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.routeIconBtn, showRoute && styles.routeIconBtnActive]}
                onPress={() => {
                  const next = !showRoute;
                  setShowRoute(next);
                  if (next) router.navigate("/");
                }}
              >
                <Ionicons
                  name={showRoute ? "map" : "map-outline"}
                  size={18}
                  color={showRoute ? "#fff" : "#888"}
                />
              </TouchableOpacity>
            </>
          )}
          {isHost && (
            <TouchableOpacity style={styles.routePrimaryBtn} onPress={() => setEditorVisible(true)}>
              <Text style={styles.routePrimaryText}>
                {route && route.waypoints.length > 0 ? "Edit" : "Plan"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isHost && currentRoom && authUser && (
        <RouteEditor
          visible={editorVisible}
          roomId={currentRoom.id}
          userId={authUser.id}
          initialWaypoints={route?.waypoints ?? []}
          near={
            coordsRef.current
              ? { lat: coordsRef.current.latitude, lng: coordsRef.current.longitude }
              : null
          }
          onClose={() => {
            setEditorVisible(false);
            loadRoute();
          }}
        />
      )}

      {/* Members list */}
      <Text style={styles.sectionLabel}>RIDERS · {members.length}</Text>

      <FlatList
        data={members}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={styles.memberList}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Waiting for riders to join...</Text>
        }
        renderItem={({ item }) => {
          const isMe = item.user_id === authUser?.id;
          const isRoomHost = item.user_id === currentRoom?.host_id;
          const isFriend = friendSet.has(item.user_id);
          const isPending = pendingSet.has(item.user_id);
          return (
            <View style={styles.memberRow}>
              <TouchableOpacity
                style={styles.memberLeft}
                onPress={() => handleLocateMember(item)}
                disabled={isMe}
                activeOpacity={isMe ? 1 : 0.6}
              >
                <View style={[styles.memberDot, isMe && styles.memberDotMe]} />
                <View>
                  <Text style={styles.memberName}>
                    {item.name}
                    {isMe ? "  (you)" : ""}
                  </Text>
                  {isRoomHost && <Text style={styles.hostBadge}>host</Text>}
                </View>
              </TouchableOpacity>
              {isMe ? null : isFriend ? (
                <Ionicons name="checkmark" size={16} color="#555" />
              ) : isPending ? (
                <Text style={styles.pendingTag}>pending</Text>
              ) : (
                <TouchableOpacity
                  style={styles.addInline}
                  onPress={() => handleAddRoommate(item)}
                  hitSlop={8}
                >
                  <Ionicons name="person-add" size={16} color="#ff4500" />
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      {/* End / Leave button */}
      <TouchableOpacity
        style={styles.endButton}
        onPress={isHost ? handleEndRide : handleLeaveRide}
        activeOpacity={0.8}
      >
        <Text style={styles.endButtonText}>
          {isHost ? "End Group Ride" : "Leave Ride"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#080808",
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 6,
  },
  signOutButton: {
    padding: 4,
  },

  // Idle
  idleContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingBottom: 40,
  },
  idleIcon: {
    fontSize: 56,
    color: "#222",
    marginBottom: 8,
  },
  idleTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  idleSubtitle: {
    color: "#444",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 260,
  },
  idleActions: {
    gap: 10,
    paddingBottom: 32,
  },

  // Join
  joinContent: {
    flex: 1,
    gap: 16,
    paddingTop: 20,
  },
  joinLabel: {
    color: "#444",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 3,
  },
  codeInput: {
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#1e1e1e",
    borderRadius: 14,
    padding: 20,
    fontSize: 32,
    fontWeight: "300",
    color: "#fff",
    letterSpacing: 10,
    textAlign: "center",
  },

  // Buttons
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ff4500",
    borderRadius: 14,
    padding: 18,
    gap: 10,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 1,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#1e1e1e",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#666",
    fontSize: 15,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.4,
  },

  // Code card
  codeCard: {
    backgroundColor: "#0f0f0f",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#191919",
    padding: 24,
    marginBottom: 28,
    gap: 6,
  },
  codeCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ff4500",
  },
  liveLabel: {
    color: "#ff4500",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 3,
  },
  roomCode: {
    color: "#fff",
    fontSize: 48,
    fontWeight: "200",
    letterSpacing: 10,
  },
  codeTap: {
    color: "#333",
    fontSize: 12,
    letterSpacing: 1,
  },

  // Route card
  routeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0f0f0f",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#191919",
    padding: 16,
    marginBottom: 24,
  },
  routeCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  routeTitle: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
  },
  routeSub: {
    color: "#555",
    fontSize: 12,
    marginTop: 2,
  },
  routeActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  routeIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1e1e1e",
    alignItems: "center",
    justifyContent: "center",
  },
  routeIconBtnActive: {
    backgroundColor: "#1e1e1e",
    borderColor: "#333",
  },
  routePrimaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#ff4500",
  },
  routePrimaryText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },

  // Members
  sectionLabel: {
    color: "#333",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 3,
    marginBottom: 12,
  },
  memberList: {
    gap: 0,
    flexGrow: 1,
  },
  addInline: {
    padding: 6,
  },
  pendingTag: {
    color: "#555",
    fontSize: 11,
    letterSpacing: 1,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#111",
  },
  memberLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  memberDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ffa726",
  },
  memberDotMe: {
    backgroundColor: "#ff4500",
  },
  memberName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  hostBadge: {
    color: "#444",
    fontSize: 11,
    marginTop: 2,
    letterSpacing: 1,
  },
  emptyText: {
    color: "#333",
    textAlign: "center",
    paddingVertical: 32,
    fontSize: 14,
  },

  // End button
  endButton: {
    borderWidth: 1,
    borderColor: "#1e1e1e",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginTop: "auto",
    marginBottom: 24,
  },
  endButtonText: {
    color: "#555",
    fontSize: 14,
    fontWeight: "600",
  },
});
