import { supabase } from "./supabase";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";

const BUCKET = "voice-messages";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type VoiceMessage = {
  user_id: string;
  audio_path: string;
  duration: number | null;
  created_at: string;
};

export async function uploadVoiceMessage(userId: string, localUri: string, duration: number) {
  const path = `${userId}/voice.m4a`;
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: "base64" });
  const bytes = decode(base64);

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "audio/m4a", upsert: true });
  if (upErr) throw new Error(upErr.message);

  const { error: rowErr } = await supabase.from("voice_messages").upsert(
    {
      user_id: userId,
      audio_path: path,
      duration,
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (rowErr) throw new Error(rowErr.message);
}

export async function getVoiceMessages(userIds: string[]): Promise<Record<string, VoiceMessage>> {
  if (userIds.length === 0) return {};
  const { data, error } = await supabase
    .from("voice_messages")
    .select("user_id, audio_path, duration, created_at")
    .in("user_id", userIds);

  if (error) {
    console.error("Failed to fetch voice messages:", error.message);
    return {};
  }

  const cutoff = Date.now() - MAX_AGE_MS;
  const map: Record<string, VoiceMessage> = {};
  (data ?? []).forEach((m: any) => {
    if (new Date(m.created_at).getTime() >= cutoff) map[m.user_id] = m;
  });
  return map;
}

export function isVoiceFresh(msg: { created_at: string } | undefined | null): boolean {
  if (!msg?.created_at) return false;
  return Date.now() - new Date(msg.created_at).getTime() < MAX_AGE_MS;
}

export async function getVoiceSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error) {
    console.error("Failed to sign voice url:", error.message);
    return null;
  }
  return data.signedUrl;
}

export async function deleteOwnVoiceMessage(userId: string) {
  await supabase.from("voice_messages").delete().eq("user_id", userId);
  await supabase.storage.from(BUCKET).remove([`${userId}/voice.m4a`]);
}
