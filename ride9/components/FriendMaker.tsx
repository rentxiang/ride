import Mapbox from "@rnmapbox/maps";

export default function FriendMarker({ friend }: any) {
  return (
    <Mapbox.PointAnnotation
      id={friend.user_id}
      coordinate={[friend.lng, friend.lat]}
    >
      {/* Add a default child element */}
      <Mapbox.Callout title={friend.user_name || "Friend"} />
    </Mapbox.PointAnnotation>
  );
}
