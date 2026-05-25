import React, { useEffect, useRef, useState } from "react";
import { Animated, View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";
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
  onPress?: () => void;
}

export default function RiderMarker({ rider, showLabel = true, selected = false, onPress }: Props) {
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

  const glowColor = rider.isSelf ? "rgba(0, 122, 255," : "rgba(255, 69, 0,";

  return (
    <MarkerView
      id={`rider-${rider.user_id}`}
      coordinate={displayCoords}
      allowOverlap={true}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={onPress ? 0.75 : 1}
        style={styles.container}
      >
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
              rider.isSelf && styles.avatarSelf,
              isStale && styles.avatarStale,
            ]}
          />
        </View>
        <View style={[styles.label, isStale && !selected && styles.labelStale]}>
          <Text style={[styles.name, isStale && !selected && styles.nameStale]}>
            {rider.name}
          </Text>
          {selected && isStale && showLabel ? (
            <Text style={styles.lastSeen}>{lastSeen}</Text>
          ) : !isStale && showLabel && rider.bike ? (
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
  avatarSelf: {
    borderColor: "#007aff",
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
