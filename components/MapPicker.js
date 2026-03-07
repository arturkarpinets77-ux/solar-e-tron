// components/MapPicker.js
import { useEffect } from "react";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  useMapEvents,
  useMap,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

// фикс стандартных иконок leaflet для Next.js
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng);
    },
  });

  return null;
}

function Recenter({ lat, lng }) {
  const map = useMap();

  useEffect(() => {
    map.setView([lat, lng]);
  }, [lat, lng, map]);

  return null;
}

export default function MapPicker({ lat, lng, radiusMeters, onChange }) {
  return (
    <div style={{ width: "100%", height: 420, borderRadius: 14, overflow: "hidden" }}>
      <MapContainer
        center={[lat, lng]}
        zoom={14}
        style={{ width: "100%", height: "100%" }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Marker position={[lat, lng]} />
        <Circle center={[lat, lng]} radius={radiusMeters} />

        <ClickHandler
          onPick={(pos) =>
            onChange({
              lat: pos.lat,
              lng: pos.lng,
              radiusMeters,
            })
          }
        />

        <Recenter lat={lat} lng={lng} />
      </MapContainer>
    </div>
  );
}
