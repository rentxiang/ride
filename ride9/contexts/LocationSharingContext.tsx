import { createContext, useContext, useRef, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { startLocationTracking, updateLocation, updateSharingStatus } from "../services/location";
import { supabase } from "../services/supabase";
import { Room } from "../services/rooms";

const ROOM_KEY = "@crew/current_room";

type Coords = { latitude: number; longitude: number };

type LocationSharingContextType = {
  isSharing: boolean;
  coordsRef: React.MutableRefObject<Coords | null>;
  startSharing: (userId: string) => Promise<void>;
  stopSharing: () => void;
  currentRoom: Room | null;
  setCurrentRoom: (room: Room | null) => void;
  focusCoords: Coords | null;
  setFocusCoords: (coords: Coords | null) => void;
};

const LocationSharingContext = createContext<LocationSharingContextType | null>(null);

export function LocationSharingProvider({ children }: { children: ReactNode }) {
  const [isSharing, setIsSharing] = useState(false);
  const [currentRoom, _setCurrentRoom] = useState<Room | null>(null);
  const [focusCoords, setFocusCoords] = useState<Coords | null>(null);
  const coordsRef = useRef<Coords | null>(null);
  const subRef = useRef<any>(null);
  const userIdRef = useRef<string | null>(null);

  // Restore room from storage on boot
  useEffect(() => {
    const restore = async () => {
      const raw = await AsyncStorage.getItem(ROOM_KEY);
      if (!raw) return;
      const saved: Room = JSON.parse(raw);
      const { data } = await supabase
        .from("rooms")
        .select("id, code, host_id")
        .eq("id", saved.id)
        .single();
      if (data) {
        _setCurrentRoom(data as Room);
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

  const startSharing = async (userId: string) => {
    if (subRef.current) return;
    userIdRef.current = userId;
    const sub = await startLocationTracking((coords) => {
      coordsRef.current = coords;
      updateLocation(userId, coords.latitude, coords.longitude);
    });
    subRef.current = sub;
    setIsSharing(true);
  };

  const stopSharing = () => {
    subRef.current?.remove();
    subRef.current = null;
    setIsSharing(false);
    if (userIdRef.current) {
      updateSharingStatus(userIdRef.current, false);
    }
  };

  useEffect(() => () => { subRef.current?.remove(); }, []);

  return (
    <LocationSharingContext.Provider
      value={{ isSharing, coordsRef, startSharing, stopSharing, currentRoom, setCurrentRoom, focusCoords, setFocusCoords }}
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
