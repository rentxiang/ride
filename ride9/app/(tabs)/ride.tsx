import Mapbox, { MapView, Camera, LocationPuck } from "@rnmapbox/maps";
import { routes } from "../../constants/routes";
import RouteLayer from "../../components/RouteLayer";

export default function Ride() {
  const route = routes[0];

  return (
    <MapView style={{ flex: 1 }}>
      <Camera followUserLocation followZoomLevel={14} />

      <LocationPuck />

      <RouteLayer route={route} />
    </MapView>
  );
}
