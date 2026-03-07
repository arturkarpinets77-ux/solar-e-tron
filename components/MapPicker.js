// components/MapPicker.js
import { useEffect, useMemo, useState } from "react";
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

function Recenter({ lat, lng, zoom = 14 }) {
  const map = useMap();

  useEffect(() => {
    map.setView([lat, lng], zoom);
  }, [lat, lng, zoom, map]);

  return null;
}

export default function MapPicker({ lat, lng, radiusMeters, onChange }) {
  const [searchText, setSearchText] = useState("");
  const [searchMsg, setSearchMsg] = useState("");
  const [searching, setSearching] = useState(false);
  const [zoom, setZoom] = useState(14);
  const [mapType, setMapType] = useState("satellite");

  const tileConfig = useMemo(() => {
    if (mapType === "satellite") {
      return {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attribution:
          "Tiles &copy; Esri",
      };
    }

    return {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "&copy; OpenStreetMap contributors",
    };
  }, [mapType]);

  async function handleSearch() {
    const q = searchText.trim();
    if (!q) {
      setSearchMsg("Введи название места.");
      return;
    }

    setSearching(true);
    setSearchMsg("");

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`
      );

      if (!res.ok) {
        throw new Error("Не удалось выполнить поиск.");
      }

      const data = await res.json();

      if (!Array.isArray(data) || data.length === 0) {
        setSearchMsg("Место не найдено.");
        return;
      }

      const item = data[0];
      const nextLat = Number(item.lat);
      const nextLng = Number(item.lon);

      if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
        setSearchMsg("Некорректные координаты из поиска.");
        return;
      }

      setZoom(13);

      onChange({
        lat: nextLat,
        lng: nextLng,
        radiusMeters,
      });
    } catch (e) {
      setSearchMsg(e?.message || "Ошибка поиска");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "1fr auto auto",
          alignItems: "center",
        }}
      >
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Например: Pori, Finland"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(120, 90, 20, 0.16)",
            background: "rgba(255,255,255,0.92)",
            outline: "none",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSearch();
            }
          }}
        />

        <button
          type="button"
          onClick={handleSearch}
          disabled={searching}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(120, 90, 20, 0.16)",
            background: "rgba(255,255,255,0.92)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            opacity: searching ? 0.6 : 1,
          }}
        >
          {searching ? "Поиск..." : "Найти"}
        </button>

        <select
          value={mapType}
          onChange={(e) => setMapType(e.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(120, 90, 20, 0.16)",
            background: "rgba(255,255,255,0.92)",
            outline: "none",
          }}
        >
          <option value="satellite">Спутник</option>
          <option value="map">Схема</option>
        </select>
      </div>

      {searchMsg ? (
        <div style={{ color: "#7f1d1d", fontSize: 14 }}>{searchMsg}</div>
      ) : null}

      <div style={{ width: "100%", height: 420, borderRadius: 14, overflow: "hidden" }}>
        <MapContainer
          center={[lat, lng]}
          zoom={zoom}
          style={{ width: "100%", height: "100%" }}
        >
          <TileLayer attribution={tileConfig.attribution} url={tileConfig.url} />

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

          <Recenter lat={lat} lng={lng} zoom={zoom} />
        </MapContainer>
      </div>
    </div>
  );
}
