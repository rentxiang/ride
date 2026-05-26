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
  onPlayVoice?: () => void;
  onPress?: () => void;
}

export default function RiderMarker({
  rider,
  showLabel = true,
  selected = false,
  voicePlaying = false,
  onPlayVoice,
  onPress,
}: Props) {
  const glowScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.18)).current;

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

  const lastSeen = getLastSeenText(rider.updated_at);
  const isStale = lastSeen !== null;

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
        {rider.voice && (
          <TouchableOpacity
            style={[styles.voiceBubble, voicePlaying && styles.voiceBubbleActive]}
            onPress={onPlayVoice}
            activeOpacity={0.7}
          >
            <Ionicons
              name={voicePlaying ? "volume-high" : "play"}
              size={11}
              color="#fff"
            />
            <Text style={styles.voiceDur}>
              {Math.max(1, Math.round(rider.voice.duration ?? 1))}&quot;
            </Text>
          </TouchableOpacity>
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
        </View>
        <View style={[styles.label, isStale && !selected && styles.labelStale]}>
          <Text style={[styles.name, isStale && !selected && styles.nameStale]}>
            {rider.name}
          </Text>
          {selected && isStale ? (
            <Text style={styles.lastSeen}>{lastSeen}</Text>
          ) : (showLabel || selected) && !isStale && rider.bike ? (
            <Text style={styles.bike}>{rider.bike}</Text>
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
  voiceBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ff4500",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 4,
    borderWidth: 2,
    borderColor: "#080808",
  },
  voiceBubbleActive: {
    backgroundColor: "#007aff",
  },
  voiceDur: {
    color: "#fff",
    fontSize: 10,
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
  lastSeen: {
    fontSize: 10,
    color: "#ff4500",
    marginTop: 1,
    letterSpacing: 0.2,
  },
});
