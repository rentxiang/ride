import { supabase } from "./supabase";

export async function getFriends(userId: string) {
  const { data } = await supabase
    .from("friends")
    .select("friend_id")
    .eq("user_id", userId);

  return data;
}

export async function addFriend(userId: string, friendId: string) {
  await supabase.from("friends").insert([
    {
      user_id: userId,
      friend_id: friendId,
    },
  ]);
}
