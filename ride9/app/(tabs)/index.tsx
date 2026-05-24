import Mapbox, { Camera, LocationPuck, MapView } from "@rnmapbox/maps";
import { useEffect, useState, useRef } from "react";
import { StyleSheet, TouchableOpacity, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
} from "react-native-reanimated";
import { supabase } from "@/services/supabase";
import RiderMarker from "../../components/RiderMarker";
import { getFriendLocations } from "../../services/location";
import { subscribeLocations } from "../../services/realtime";
import { getFriends } from "../../services/friends";
import { getRoomMemberLocations, getRoomMembers } from "../../services/rooms";
import { useLocationSharing } from "../../contexts/LocationSharingContext";
import { avatarUrl, getProfile } from "../../services/profile";

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_KEY || "");

type ToastConfig = { message: string; sub: string; color: string };

export default function MapScreen() {
  const [friends, setFriends] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [roomMembers, setRoomMembers] = useState<any[]>([]);
  const [roomLocations, setRoomLocations] = useState<any[]>([]);
  const [authUser, setAuthUser] = useState<any>(null);
  const [selfProfile, setSelfProfile] = useState<any>(null);
  const [selfCoords, setSelfCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [centered, setCentered] = useState(false);
  const [toastConfig, setToastConfig] = useState<ToastConfig>({
    message: "",
    sub: "",
    color: "#00c46a",
  });

  const { coordsRef, isSharing, startSharing, stopSharing, currentRoom } =
    useLocationSharing();
  const cameraRef = useRef<Camera>(null);

  // Toast animation (slides down from above)
  const toastOpacity = useSharedValue(0);
  const toastY = useSharedValue(-40);
  const toastScale = useSharedValue(0.92);

  // Share button pulse
  const buttonScale = useSharedValue(1);

  const showToast = (config: ToastConfig) => {
    setToastConfig(config);
    toastOpacity.value = withSequence(
      withTiming(1, { duration: 260 }),
      withDelay(2000, withTiming(0, { duration: 380 }))
    );
    toastY.value = withSequence(
      withTiming(0, { duration: 260 }),
      withDelay(2000, withTiming(-40, { duration: 380 }))
    );
    toastScale.value = withSequence(
      withTiming(1, { duration: 260 }),
      withDelay(2000, withTiming(0.94, { duration: 380 }))
    );
  };

  const pulseButton = () => {
    buttonScale.value = withSequence(
      withTiming(1.3, { duration: 140 }),
      withTiming(1, { duration: 200 })
    );
  };

  const toastStyle = useAnimatedStyle(() => ({
    opacity: toastOpacity.value,
    transform: [{ translateY: toastY.value }, { scale: toastScale.value }],
  }));

  const buttonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setAuthUser(data.user);
        loadFriends(data.user.id);
        getProfile(data.user.id).then(setSelfProfile);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setAuthUser(session.user);
        loadFriends(session.user.id);
        getProfile(session.user.id).then(setSelfProfile);
      }
      if (event === "SIGNED_OUT") {
        setAuthUser(null);
        setFriends([]);
        setLocations([]);
      }
    });

    return () => sub?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser) return;
    getFriendLocations(authUser.id).then((data) => setLocations(data || []));
  }, [authUser]);

  const loadFriends = async (userId: string) => {
    const data = await getFriends(userId);
    setFriends(
      data.map((item: any) => ({
        user_id: item.friend_id,
        name: item.friend.name,
        email: item.friend.email,
        bike: item.friend.bike ?? null,
        avatarUrl: avatarUrl(item.friend.avatar_seed, item.friend.email),
      }))
    );
  };

  // Auto-center camera when sharing starts and first fix arrives
  useEffect(() => {
    if (!isSharing) { setCentered(false); return; }
    if (centered) return;

    const interval = setInterval(() => {
      if (coordsRef.current && cameraRef.current) {
        cameraRef.current.flyTo(
          [coordsRef.current.longitude, coordsRef.current.latitude],
          800
        );
        setCentered(true);
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isSharing]);

  // Track own coords for self marker
  useEffect(() => {
    if (!isSharing) {
      setSelfCoords(null);
      return;
    }
    if (coordsRef.current) {
      setSelfCoords({ latitude: coordsRef.current.latitude, longitude: coordsRef.current.longitude });
    }
    const interval = setInterval(() => {
      if (coordsRef.current) {
        setSelfCoords({ latitude: coordsRef.current.latitude, longitude: coordsRef.current.longitude });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isSharing]);

  // Reload friends when the friends table changes (e.g. new friend added from Crew tab)
  useEffect(() => {
    if (!authUser) return;
    const channel = supabase
      .channel("map-friends-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friends", filter: `user_id=eq.${authUser.id}` },
        () => loadFriends(authUser.id)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [authUser]);

  // Friend realtime locations
  useEffect(() => {
    if (!authUser || friends.length === 0) return;
    const friendIds = friends.map((f) => f.user_id);
    const sub = subscribeLocations(friendIds, setLocations);
    return () => { sub?.unsubscribe(); };
  }, [friends]);

  // Room member locations
  useEffect(() => {
    if (!currentRoom) {
      setRoomMembers([]);
      setRoomLocations([]);
      return;
    }

    const load = async () => {
      const [members, locs] = await Promise.all([
        getRoomMembers(currentRoom.id),
        getRoomMemberLocations(currentRoom.id),
      ]);
      setRoomMembers(
        members.map((m) => ({
          ...m,
          avatarUrl: avatarUrl(m.avatar_seed, m.email),
        }))
      );
      setRoomLocations(locs);
    };

    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [currentRoom?.id]);

  // Merge friends + room members, deduplicated, exclude self
  const selfId = authUser?.id;

  const allRiders = Object.values(
    [...friends, ...roomMembers]
      .filter((r) => r.user_id !== selfId)
      .reduce<Record<string, any>>((acc, r) => {
        acc[r.user_id] = r;
        return acc;
      }, {})
  ).map((r) => {
    const friendLoc = locations.find((l) => l.user_id === r.user_id);
    const roomLoc = roomLocations.find((l) => l.user_id === r.user_id);
    const loc = friendLoc ?? roomLoc;
    return {
      ...r,
      latitude: loc?.lat,
      longitude: loc?.lng,
      is_sharing: loc?.is_sharing ?? false,
    };
  }).filter((r) => r.is_sharing && r.latitude && r.longitude);

  const activeCount = allRiders.length;

  const centerOnUser = async () => {
    if (!cameraRef.current) return;

    if (coordsRef.current) {
      cameraRef.current.flyTo(
        [coordsRef.current.longitude, coordsRef.current.latitude],
        600
      );
      return;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      cameraRef.current.flyTo([loc.coords.longitude, loc.coords.latitude], 600);
    } catch (e) {
      console.error("Could not get location:", e);
    }
  };

  const toggleSharing = async () => {
    pulseButton();
    if (isSharing) {
      stopSharing();
      showToast({
        message: "Location sharing off",
        sub: "Your crew can no longer see you",
        color: "#555",
      });
    } else if (authUser) {
      await startSharing(authUser.id);
      showToast({
        message: "Sharing your location",
        sub: "Your crew can now see where you are",
        color: "#00c46a",
      });
    }
  };

  return (
    <View style={styles.container}>
      <MapView style={styles.map} styleURL="mapbox://styles/mapbox/dark-v11">
        <Camera
          ref={cameraRef}
          zoomLevel={15}
          followUserLocation={false}
          animationMode="flyTo"
        />
        {(!isSharing || !selfCoords) && (
          <LocationPuck
            puckBearing="heading"
            puckBearingEnabled
            pulsing={{ isEnabled: true }}
          />
        )}
        {allRiders.map((r) => (
          <RiderMarker key={r.user_id} rider={r} />
        ))}
        {isSharing && selfCoords && selfProfile && (
          <RiderMarker
            rider={{
              user_id: `self-${authUser?.id}`,
              name: selfProfile.name ?? "Me",
              bike: selfProfile.bike ?? null,
              avatarUrl: avatarUrl(selfProfile.avatar_seed, selfProfile.email),
              latitude: selfCoords.latitude,
              longitude: selfCoords.longitude,
              isSelf: true,
            }}
          />
        )}
      </MapView>

      {/* HUD */}
      {activeCount > 0 && (
        <View style={styles.hud} pointerEvents="none">
          <View style={styles.hudBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.hudText}>
              {activeCount} RIDER{activeCount > 1 ? "S" : ""} LIVE
            </Text>
          </View>
        </View>
      )}

      {/* Toast notification */}
      <Animated.View style={[styles.toast, toastStyle]} pointerEvents="none">
        <View style={[styles.toastDot, { backgroundColor: toastConfig.color }]} />
        <View>
          <Text style={styles.toastMessage}>{toastConfig.message}</Text>
          <Text style={styles.toastSub}>{toastConfig.sub}</Text>
        </View>
      </Animated.View>

      {/* Bottom-right controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.iconButton} onPress={centerOnUser}>
          <Ionicons name="locate" size={20} color="#fff" />
        </TouchableOpacity>

        <Animated.View style={buttonAnimStyle}>
          <TouchableOpacity
            style={[styles.iconButton, isSharing && styles.iconButtonActive]}
            onPress={toggleSharing}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isSharing ? "location" : "location-outline"}
              size={20}
              color={isSharing ? "#00c46a" : "#666"}
            />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  hud: {
    position: "absolute",
    top: 80,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  hudBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(8, 8, 8, 0.88)",
    borderWidth: 1,
    borderColor: "#1e1e1e",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 24,
    gap: 8,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#ff4500",
  },
  hudText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.5,
  },
  toast: {
    position: "absolute",
    top: 130,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(14, 14, 14, 0.96)",
    borderWidth: 1,
    borderColor: "#222",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 18,
  },
  toastDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  toastMessage: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  toastSub: {
    color: "#555",
    fontSize: 12,
    marginTop: 2,
  },
  controls: {
    position: "absolute",
    bottom: 90,
    right: 16,
    gap: 10,
  },
  iconButton: {
    backgroundColor: "rgba(10, 10, 10, 0.9)",
    borderWidth: 1,
    borderColor: "#222",
    padding: 13,
    borderRadius: 14,
  },
  iconButtonActive: {
    borderColor: "#00c46a33",
    backgroundColor: "rgba(0, 196, 106, 0.08)",
  },
});
