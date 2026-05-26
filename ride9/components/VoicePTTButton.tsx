import React, { useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  PanResponder,
  Animated,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import { uploadVoiceMessage } from "../services/voice";

const MAX_SECONDS = 10;
const MIN_SECONDS = 1;
const CANCEL_DY = -80;

interface Props {
  userId: string;
  avatarUri: string;
  onSent?: () => void;
}

export default function VoicePTTButton({ userId, avatarUri, onSent }: Props) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [isRecording, setIsRecording] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const recordingRef = useRef(false);
  const cancelArmedRef = useRef(false);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scale = useRef(new Animated.Value(1)).current;

  const startRecording = async () => {
    if (recordingRef.current) return;
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Microphone needed", "Enable mic access in Settings to send voice messages.");
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

    cancelArmedRef.current = false;
    setCancelArmed(false);
    setElapsed(0);

    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      Alert.alert("Recording failed", "Couldn't start recording.");
      return;
    }

    recordingRef.current = true;
    setIsRecording(true);
    startTimeRef.current = Date.now();
    Animated.spring(scale, { toValue: 1.25, useNativeDriver: true }).start();

    timerRef.current = setInterval(() => {
      const s = (Date.now() - startTimeRef.current) / 1000;
      setElapsed(s);
      if (s >= MAX_SECONDS) endRecording();
    }, 100);
  };

  const handleMove = (dy: number) => {
    const armed = dy < CANCEL_DY;
    if (armed !== cancelArmedRef.current) {
      cancelArmedRef.current = armed;
      setCancelArmed(armed);
    }
  };

  const endRecording = async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setIsRecording(false);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const duration = (Date.now() - startTimeRef.current) / 1000;
    const cancelled = cancelArmedRef.current;
    setElapsed(0);

    try {
      await recorder.stop();
    } catch {}
    const uri = recorder.uri;

    if (cancelled || !uri || duration < MIN_SECONDS) return;

    try {
      await uploadVoiceMessage(userId, uri, Math.min(duration, MAX_SECONDS));
      onSent?.();
    } catch {
      Alert.alert("Couldn't send", "Voice message failed to send.");
    }
  };

  // Stable PanResponder that always calls the latest handlers
  const startRef = useRef(startRecording);
  const moveRef = useRef(handleMove);
  const endRef = useRef(endRecording);
  startRef.current = startRecording;
  moveRef.current = handleMove;
  endRef.current = endRecording;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => startRef.current(),
      onPanResponderMove: (_, g) => moveRef.current(g.dy),
      onPanResponderRelease: () => endRef.current(),
      onPanResponderTerminate: () => endRef.current(),
    })
  ).current;

  const remaining = Math.max(0, MAX_SECONDS - elapsed);

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      {isRecording && (
        <View style={styles.overlay}>
          <View style={[styles.bubble, cancelArmed && styles.bubbleCancel]}>
            <Ionicons
              name={cancelArmed ? "trash" : "mic"}
              size={22}
              color={cancelArmed ? "#ff3b30" : "#ff4500"}
            />
            <Text style={styles.timer}>{elapsed.toFixed(1)}s</Text>
            <Text style={[styles.hint, cancelArmed && styles.hintCancel]}>
              {cancelArmed ? "Release to cancel" : "Slide up to cancel"}
            </Text>
            {remaining <= 3 && !cancelArmed ? (
              <Text style={styles.countdown}>{Math.ceil(remaining)}s left</Text>
            ) : null}
          </View>
        </View>
      )}

      <Animated.View style={[styles.buttonWrap, { transform: [{ scale }] }]} {...pan.panHandlers}>
        <View style={[styles.ring, isRecording && styles.ringActive]}>
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
          {!isRecording && (
            <View style={styles.micBadge}>
              <Ionicons name="mic" size={14} color="#fff" />
            </View>
          )}
        </View>
        {!isRecording && <Text style={styles.label}>HOLD TO TALK</Text>}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    bottom: 28,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  buttonWrap: {
    alignItems: "center",
  },
  ring: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: "#ff4500",
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  ringActive: {
    borderColor: "#ff3b30",
    borderWidth: 4,
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 34,
  },
  micBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#ff4500",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#080808",
  },
  label: {
    marginTop: 6,
    color: "#666",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2,
  },
  overlay: {
    position: "absolute",
    bottom: 90,
    alignItems: "center",
  },
  bubble: {
    backgroundColor: "rgba(8, 8, 8, 0.95)",
    borderWidth: 1,
    borderColor: "#1e1e1e",
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: "center",
    minWidth: 160,
  },
  bubbleCancel: {
    borderColor: "#ff3b30",
  },
  timer: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 6,
    letterSpacing: 1,
  },
  hint: {
    color: "#666",
    fontSize: 11,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  hintCancel: {
    color: "#ff3b30",
    fontWeight: "700",
  },
  countdown: {
    color: "#ff4500",
    fontSize: 10,
    marginTop: 2,
    fontWeight: "700",
  },
});
