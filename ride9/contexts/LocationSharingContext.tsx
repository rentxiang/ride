import { createContext, useContext, useRef, useState, useEffect, ReactNode } from "react";
import { Alert, Linking, AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { startLocationTracking, updateSharingStatus, updateLocation } from "../services/location";
import { supabase } from "../services/supabase";
import { Room } from "../services/rooms";

const ROOM_KEY = "@crew/current_room";
const SHARING_INTRO_KEY = "@crew/sharing_intro_shown";
const SHARING_KEY = "@crew/sharing";

// One-time intro the first time a user turns on sharing. Tells them sharing
// keeps running until they turn it off (closing the app does NOT stop it),
// and nudges toward "Always" if not yet granted.
async function maybeShowSharingIntro() {
  if (await AsyncStorage.getItem(SHARING_INTRO_KEY)) return;
  await AsyncStorage.setItem(SHARING_INTRO_KEY, "1");
  const { status } = await Location.getBackgroundPermissionsAsync();
  const needsAlways = status !== "granted";
  const message =
    "You stay visible to your crew until you turn sharing OFF in the app — closing or killing the app does NOT stop sharing." +
    (needsAlways
      ? '\n\nFor reliable background sharing, allow "Always" in Settings.'
      : "");
  Alert.alert(
    "Sharing your location",
    message,
    needsAlways
      ? [
          { text: "Got it", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ]
      : [{ text: "Got it", style: "cancel" }]
  );
}

type Coords = { latitude: number; longitude: number };

type LocationSharingContextType = {
  isSharing: boolean;
  isTransitioning: boolean;
  coordsRef: React.MutableRefObject<Coords | null>;
  startSharing: (userId: string, opts?: { silent?: boolean }) => Promise<void>;
  stopSharing: () => Promise<void>;
  currentRoom: Room | null;
  setCurrentRoom: (room: Room | null) => void;
  focusCoords: Coords | null;
  setFocusCoords: (coords: Coords | null) => void;
  showRoute: boolean;
  setShowRoute: (v: boolean) => void;
};

const LocationSharingContext = createContext<LocationSharingContextType | null>(null);

export function LocationSharingProvider({ children }: { children: ReactNode }) {
  const [isSharing, setIsSharing] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentRoom, _setCurrentRoom] = useState<Room | null>(null);
  const [focusCoords, setFocusCoords] = useState<Coords | null>(null);
  const [showRoute, setShowRoute] = useState(true);
  const coordsRef = useRef<Coords | null>(null);
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  const userIdRef = useRef<string | null>(null);
  const busyRef = useRef(false); // guards against rapid start/stop taps overlapping

  // Restore room from storage on boot
  useEffect(() => {
    const restore = async () => {
      const raw = await AsyncStorage.getItem(ROOM_KEY);
      if (!raw) return;
      const saved: Room = JSON.parse(raw);
      const { data } = await supabase
        .from("rooms")
        .select("id, code, host_id, expires_at")
        .eq("id", saved.id)
        .single();
      if (data && (!data.expires_at || new Date(data.expires_at).getTime() > Date.now())) {
        _setCurrentRoom({ id: data.id, code: data.code, host_id: data.host_id });
      } else {
        await AsyncStorage.removeItem(ROOM_KEY);
      }
    };
    restore();
  }, []);

  const setCurrentRoom = (room: Room | null) => {
    _setCurrentRoom(room);
    if (room) {
      AsyncStorage.setItem(ROOM_KEY, JSON.stringify(room));
    } else {
      AsyncStorage.removeItem(ROOM_KEY);
    }
  };

  const startSharing = async (userId: string, opts?: { silent?: boolean }) => {
    if (busyRef.current || stopRef.current) return; // already on or mid-transition
    busyRef.current = true;
    setIsTransitioning(true);
    setIsSharing(true); // optimistic — instant UI
    try {
      userIdRef.current = userId;
      const stop = await startLocationTracking(userId, (coords) => {
        coordsRef.current = coords;
      });
      stopRef.current = stop;
      await AsyncStorage.setItem(SHARING_KEY, "1");
      if (!opts?.silent) maybeShowSharingIntro();
    } catch {
      // failed to start — roll back
      setIsSharing(false);
      stopRef.current = null;
    } finally {
      busyRef.current = false;
      setIsTransitioning(false);
    }
  };

  const stopSharing = async () => {
    if (busyRef.current) return; // mid-transition
    busyRef.current = true;
    setIsTransitioning(true);
    setIsSharing(false); // optimistic — instant UI
    try {
      if (stopRef.current) {
        await stopRef.current();
        stopRef.current = null;
      }
      await AsyncStorage.setItem(SHARING_KEY, "0");
      if (userIdRef.current) {
        await updateSharingStatus(userIdRef.current, false);
      }
    } finally {
      busyRef.current = false;
      setIsTransitioning(false);
    }
  };

  // On boot, restore sharing state. Use the local flag first (instant, no flash),
  // and only consult the DB when there's no local flag yet (legacy/first run).
  useEffect(() => {
    const restoreSharing = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const local = await AsyncStorage.getItem(SHARING_KEY);
      if (local === "1") {
        startSharing(user.id, { silent: true });
        return;
      }
      if (local === null) {
        const { data } = await supabase
          .from("locations")
          .select("is_sharing")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data?.is_sharing) startSharing(user.id, { silent: true });
      }
    };
    restoreSharing();
  }, []);

  // When returning to foreground while sharing, push a fresh location so friends
  // see us active again — watchPositionAsync won't fire if we haven't moved 20m.
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active" || !stopRef.current || !userIdRef.current) return;
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        coordsRef.current = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        await updateLocation(userIdRef.current, loc.coords.latitude, loc.coords.longitude);
      } catch {
        if (coordsRef.current) {
          await updateLocation(
            userIdRef.current,
            coordsRef.current.latitude,
            coordsRef.current.longitude
          );
        }
      }
    });
    return () => sub.remove();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRef.current?.();
    };
  }, []);

  return (
    <LocationSharingContext.Provider
      value={{ isSharing, isTransitioning, coordsRef, startSharing, stopSharing, currentRoom, setCurrentRoom, focusCoords, setFocusCoords, showRoute, setShowRoute }}
    >
      {children}
    </LocationSharingContext.Provider>
  );
}

export function useLocationSharing() {
  const ctx = useContext(LocationSharingContext);
  if (!ctx) throw new Error("useLocationSharing must be used inside LocationSharingProvider");
  return ctx;
}
