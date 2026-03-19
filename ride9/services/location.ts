import * as Location from "expo-location";
import { supabase } from "./supabase";

export async function startLocationTracking(callback: any) {
  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== "granted") return;

  await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      distanceInterval: 5,
    },
    (location) => {
      callback(location.coords);
    }
  );
}

export async function updateLocation(
  userId: number,
  userName: string,
  lat: number,
  lng: number
) {
  await supabase.from("locations").upsert({
    user_id: userId,
    user_name: userName,
    lat,
    lng,
    updated_at: new Date(),
  });
}

export async function getFriendLocations(friendIds: string[]) {
  const { data } = await supabase
    .from("locations")
    .select("*")
    .in("user_id", friendIds);

  return data;
}

export function subscribeLocations(setFriends: any) {
  return supabase
    .channel("locations")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "locations",
      },
      (payload) => {
        setFriends((prev: any) => {
          const others = prev.filter(
            (f: any) => f.user_id !== payload.new.user_id
          );

          return [...others, payload.new];
        });
      }
    )
    .subscribe();
}
