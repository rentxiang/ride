import Mapbox from "@rnmapbox/maps";

export default function RouteLayer({ route }: any) {
  return (
    <Mapbox.ShapeSource
      id="route"
      shape={{
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: route.coordinates,
        },
        properties: {},
      }}
    >
      <Mapbox.LineLayer
        id="routeLine"
        style={{
          lineColor: "#ff0000",
          lineWidth: 4,
        }}
      />
    </Mapbox.ShapeSource>
  );
}
