import React, { useEffect, useRef, useState } from "react";
import { Animated, View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MarkerView } from "@rnmapbox/maps";

function getLastSeenText(updatedAt: string | undefined): string | null {
  if (!updatedAt) return null;
  const diffMin = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60000);
  if (diffMin < 5) return null;
  if (diffMin < 60) return `Last seen ${diffMin}m ago`;
  return `Last seen ${Math.floor(diffMin / 60)}h ago`;
}

interface Props {
  rider: any;
  showLabel?: boolean;
  selected?: boolean;
  voicePlaying?: boolean;
  voiceRead?: boolean;
  onPlayVoice?: () => void;
  onDeleteVoice?: () => void;
  onPress?: () => void;
}

export default function RiderMarker({
  rider,
  showLabel = true,
  selected = false,
  voicePlaying = false,
  voiceRead = false,
  onPlayVoice,
  onDeleteVoice,
  onPress,
}: Props) {
  const glowScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.18)).current;
  const bubbleAnim = useRef(new Animated.Value(0)).current;
  const lastSeenAnim = useRef(new Animated.Value(0)).current;
  const bikeAnim = useRef(new Animated.Value(0)).current;
  const [bubbleMounted, setBubbleMounted] = useState(false);
  const [lastSeenMounted, setLastSeenMounted] = useState(false);
  const [bikeMounted, setBikeMounted] = useState(false);

  const hasVoice = !!rider.voice;

  const animCoords = useRef(
    new Animated.ValueXY({ x: rider.longitude, y: rider.latitude })
  ).current;
  const [displayCoords, setDisplayCoords] = useState<[number, number]>([
    rider.longitude,
    rider.latitude,
  ]);

  useEffect(() => {
    const id = animCoords.addListener(({ x, y }) => setDisplayCoords([x, y]));
    return () => animCoords.removeListener(id);
  }, []);

  useEffect(() => {
    Animated.timing(animCoords, {
      toValue: { x: rider.longitude, y: rider.latitude },
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, [rider.latitude, rider.longitude]);

  // Voice bubble grows/shrinks its layout height so the avatar slides smoothly
  useEffect(() => {
    if (selected && hasVoice) {
      setBubbleMounted(true);
      bubbleAnim.setValue(0);
      Animated.spring(bubbleAnim, {
        toValue: 1,
        friction: 7,
        tension: 80,
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(bubbleAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) setBubbleMounted(false);
      });
    }
  }, [selected, hasVoice]);

  const lastSeen = getLastSeenText(rider.updated_at);
  const isStale = lastSeen !== null;
  // Speed (m/s → mph). When fast, intermittently swap the info line with a
  // random vibe — sometimes the speed, sometimes a phrase, sometimes nothing.
  const FAST_MPH = 70;
  const speedMph =
    typeof rider.speed === "number" && rider.speed > 0 ? rider.speed * 2.23694 : null;
  const isFast = speedMph != null && speedMph >= FAST_MPH;

  const [flashText, setFlashText] = useState<string | null>(null);
  useEffect(() => {
    if (!isFast || selected || speedMph == null) {
      setFlashText(null);
      return;
    }
    const phrases: ((mph: number) => string)[] = [
      (m) => `${Math.round(m)} mph`,
      (m) => `racing at ${Math.round(m)}`,
      () => "flying...",
      () => "WSBK",
      () => "send it",
      () => "ripping it",
      () => "redline",
      () => "race mode",
      () => "full throttle",
    ];
    const flash = () => {
      if (Math.random() < 0.25) return; // sometimes skip — keeps it surprising
      const pick = phrases[Math.floor(Math.random() * phrases.length)](speedMph);
      setFlashText(pick);
      setTimeout(() => setFlashText(null), 4000);
    };
    flash();
    const interval = setInterval(flash, 12000);
    return () => clearInterval(interval);
  }, [isFast, selected, speedMph]);

  const showBike = (showLabel || selected) && !isStale && (!!rider.bike || isFast);

  // Grow/shrink + fade the bike line when it should show (zoom in or selected)
  useEffect(() => {
    if (showBike) {
      setBikeMounted(true);
      Animated.timing(bikeAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    } else {
      Animated.timing(bikeAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start(
        ({ finished }) => {
          if (finished) setBikeMounted(false);
        }
      );
    }
  }, [showBike]);

  // Grow/shrink + fade the "last seen" text when a stale rider is selected/deselected
  useEffect(() => {
    if (selected && isStale) {
      setLastSeenMounted(true);
      Animated.timing(lastSeenAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(lastSeenAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) setLastSeenMounted(false);
      });
    }
  }, [selected, isStale]);

  useEffect(() => {
    if (isStale) {
      glowOpacity.setValue(0);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowScale, { toValue: 1.5, duration: 1000, useNativeDriver: true }),
          Animated.timing(glowOpacity, { toValue: 0.04, duration: 1000, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(glowScale, { toValue: 1, duration: 1000, useNativeDriver: true }),
          Animated.timing(glowOpacity, { toValue: 0.18, duration: 1000, useNativeDriver: true }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [isStale]);

  // Self = theme orange; room members (incl. friends in room) = distinct amber; plain friends = blue
  let accentHex = "#007aff";
  let glowColor = "rgba(0, 122, 255,";
  if (rider.isSelf) {
    accentHex = "#ff4500";
    glowColor = "rgba(255, 69, 0,";
  } else if (rider.inRoom) {
    accentHex = "#ffa726";
    glowColor = "rgba(255, 167, 38,";
  }

  return (
    <MarkerView
      id={`rider-${rider.user_id}`}
      coordinate={displayCoords}
      allowOverlap={true}
      allowOverlapWithPuck={true}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={onPress ? 0.75 : 1}
        style={styles.container}
      >
        {hasVoice && bubbleMounted && (
          <Animated.View
            style={{
              height: bubbleAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 46] }),
              opacity: bubbleAnim,
              overflow: "hidden",
              justifyContent: "flex-end",
              alignItems: "center",
            }}
          >
            <View style={styles.voiceExpandRow}>
            <TouchableOpacity
              style={[
                styles.voiceBubble,
                voiceRead && styles.voiceRead,
                voicePlaying && styles.voiceBubbleActive,
              ]}
              onPress={onPlayVoice}
              activeOpacity={0.7}
            >
              <Ionicons
                name={voicePlaying ? "volume-high" : "play"}
                size={14}
                color="#fff"
              />
              <Text style={styles.voiceDur}>
                {Math.max(1, Math.round(rider.voice.duration ?? 1))}&quot;
              </Text>
            </TouchableOpacity>
            {onDeleteVoice && (
              <TouchableOpacity
                style={styles.voiceDeleteBubble}
                onPress={onDeleteVoice}
                activeOpacity={0.7}
              >
                <Ionicons name="trash" size={15} color="#ff5a52" />
              </TouchableOpacity>
            )}
            </View>
          </Animated.View>
        )}
        <View style={styles.avatarWrapper}>
          <Animated.View
            style={[
              styles.glow,
              {
                backgroundColor: glowColor + " 1)",
                opacity: glowOpacity,
                transform: [{ scale: glowScale }],
              },
            ]}
          />
          <Image
            source={{ uri: rider.avatarUrl }}
            style={[
              styles.avatar,
              { borderColor: accentHex },
              isStale && styles.avatarStale,
            ]}
          />
          {hasVoice && !bubbleMounted && (
            <View style={[styles.voiceBadge, voiceRead && styles.voiceRead]}>
              <Ionicons name="mic" size={10} color={voiceRead ? "#999" : "#fff"} />
            </View>
          )}
        </View>
        <View style={[styles.label, isStale && !lastSeenMounted && styles.labelStale]}>
          <Text style={[styles.name, isStale && !lastSeenMounted && styles.nameStale]}>
            {rider.name}
          </Text>
          {lastSeenMounted ? (
            <Animated.View
              style={{
                height: lastSeenAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }),
                opacity: lastSeenAnim,
                overflow: "hidden",
              }}
            >
              <Text style={styles.lastSeen}>{lastSeen}</Text>
            </Animated.View>
          ) : bikeMounted ? (
            <Animated.View
              style={{
                height: bikeAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }),
                opacity: bikeAnim,
                overflow: "hidden",
              }}
            >
              {!selected && flashText ? (
                <Text style={styles.speed}>{flashText}</Text>
              ) : rider.bike ? (
                <Text style={styles.bike}>{rider.bike}</Text>
              ) : null}
            </Animated.View>
          ) : null}
        </View>
      </TouchableOpacity>
    </MarkerView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  voiceBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#ff4500",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#080808",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  voiceExpandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 6,
  },
  voiceBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ff4500",
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: "#080808",
  },
  voiceBubbleActive: {
    backgroundColor: "#007aff",
  },
  voiceDeleteBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#1e1e1e",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#080808",
  },
  voiceRead: {
    backgroundColor: "#3a3a3a",
  },
  voiceDur: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  avatarWrapper: {
    width: 40,
    height: 40,
  },
  glow: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    top: -8,
    left: -8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#ff4500",
    backgroundColor: "#1a1a1a",
  },
  avatarStale: {
    borderColor: "#444",
    opacity: 0.5,
  },
  label: {
    marginTop: 5,
    alignItems: "center",
    backgroundColor: "rgba(8, 8, 8, 0.88)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
  labelStale: {
    backgroundColor: "rgba(8, 8, 8, 0.45)",
  },
  name: {
    fontSize: 11,
    color: "#fff",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  nameStale: {
    color: "#555",
  },
  bike: {
    fontSize: 10,
    color: "#888",
    marginTop: 1,
    letterSpacing: 0.2,
  },
  speed: {
    fontSize: 10,
    color: "#ff4500",
    fontWeight: "800",
    marginTop: 1,
    letterSpacing: 0.5,
  },
  lastSeen: {
    fontSize: 10,
    color: "#ff4500",
    marginTop: 1,
    letterSpacing: 0.2,
  },
});
