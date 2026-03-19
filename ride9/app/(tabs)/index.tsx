import Mapbox, { Camera, LocationPuck, MapView } from "@rnmapbox/maps";
import { useEffect, useState } from "react";

import FriendMarker from "../../components/FriendMaker";
import { startLocationTracking } from "../../services/location";
import { updateLocation, getFriendLocations } from "../../services/location";
import { subscribeLocations } from "../../services/realtime";
import { StyleSheet, TouchableOpacity, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/services/supabase";
import { JwtPayload } from '@supabase/supabase-js'


Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_KEY || "");

export default function Map() {
  const [friends, setFriends] = useState<
    { user_id: number; [key: string]: any }[]
  >([]);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [user, setUser] = useState<any>(null);
  const [claims, setClaims] = useState<JwtPayload | null>(null)


  useEffect(() => {
    supabase.auth.getClaims().then(({ data }) => {
      if (data) {
        setClaims(data.claims);
      }
    })
    supabase.auth.onAuthStateChange(() => {
      supabase.auth.getClaims().then(({ data }) => {
        if (data) {
          setClaims(data.claims);
        }
      })
    })
  }, [])

  useEffect(() => {
    // watch login state
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN") {
          setUser(session?.user || null);
        } else if (event === "SIGNED_OUT") {
          setUser(null);
        }
      }
    );

    // fetch current user
    const fetchUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data?.user || null);
    };

    fetchUser();

    return () => {
      subscription?.subscription?.unsubscribe(); // Unsubscribe from auth state changes on cleanup
    };
  }, []);

  useEffect(() => {
    if (!user) {
      console.log("Anonymous user: Skipping location updates.");
      return;
    }

    const loadInitialFriends = async () => {
      const friendIds = ["user1", "user2", "user3"];
      const initialFriends = await getFriendLocations(friendIds);
      setFriends(initialFriends || []);
    };

    loadInitialFriends();

    startLocationTracking((coords: any) => {
      updateLocation(
        user.id,
        "User Name",
        coords.latitude,
        coords.longitude
      ).catch((error) => {
        console.error("Failed to update location:", error);
      });
    });

    const sub = subscribeLocations(setFriends);

    return () => {
      if (sub && typeof sub.unsubscribe === "function") {
        sub.unsubscribe();
      }
    };
  }, [user]);

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ flex: 1 }}
        styleURL={theme === "dark" ? "mapbox://styles/mapbox/dark-v11" : ""}
      >
        <Camera followUserLocation followZoomLevel={16} />
        <LocationPuck
          puckBearing="heading"
          puckBearingEnabled
          pulsing={{ isEnabled: true }}
        />

        {friends.map((f) => (
          <FriendMarker key={f.user_id} friend={f} />
        ))}
      </MapView>
      {!user && (
        <View style={{ position: "absolute", top: 10, left: 10 }}>
          <Text>You are viewing as a guest.</Text>
        </View>
      )}
      {claims && <Text>logged user: {claims.sub}</Text>}
      <TouchableOpacity
        style={styles.iconButton}
        onPress={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
      >
        <Ionicons
          name={theme === "dark" ? "sunny" : "moon"}
          size={24}
          color={theme === "dark" ? "black" : "black"}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    position: "absolute",
    top: 70,
    right: 15,
    zIndex: 1,
    backgroundColor: "white",
    padding: 6,
    borderRadius: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 5,
  },
});
