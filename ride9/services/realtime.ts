import { supabase } from "./supabase";

export function subscribeLocations(setFriends: any) {
  return supabase
    .channel("locations-channel")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "locations" },
      (payload) => {
        setFriends((prev: { user_id: number }[]) => {
          const others = prev.filter(
            (f: { user_id: number }) =>
              f.user_id !== (payload.new as { user_id: number }).user_id
          );
          return [...others, payload.new as { user_id: number }];
        });
      }
    )
    .subscribe();
}
