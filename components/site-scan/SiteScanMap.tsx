"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MapPin {
  lat: number;
  lng: number;
  label: string;
  parcelNumber: string;
  onClick?: () => void;
}

interface SiteScanMapProps {
  pins: MapPin[];
  center?: { lat: number; lng: number };
  className?: string;
}

export default function SiteScanMap({
  pins,
  center,
  className,
}: SiteScanMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const defaultCenter = center ??
      (pins.length > 0
        ? { lat: pins[0].lat, lng: pins[0].lng }
        : { lat: 41.4993, lng: -81.6944 }); // Cleveland default

    const map = L.map(mapRef.current).setView(
      [defaultCenter.lat, defaultCenter.lng],
      13,
    );

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });

    // Add pins
    const markers: L.Marker[] = [];
    for (const pin of pins) {
      const marker = L.marker([pin.lat, pin.lng])
        .addTo(map)
        .bindPopup(
          `<strong>${pin.label}</strong><br/>${pin.parcelNumber}`,
        );

      if (pin.onClick) {
        marker.on("click", pin.onClick);
      }
      markers.push(marker);
    }

    // Fit bounds if multiple pins
    if (markers.length > 1) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.1));
    }
  }, [pins]);

  return (
    <div
      ref={mapRef}
      className={`h-80 rounded-lg border border-[var(--edge)] ${className ?? ""}`}
    />
  );
}
