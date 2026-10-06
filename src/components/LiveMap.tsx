import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2 } from 'lucide-react';

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

const defaultCenter = {
  lat: 26.8467,
  lng: 80.9462 // default center
};

export interface MapMarkerData {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: string;
  phone?: string;
  open24x7?: boolean;
}

interface LiveMapProps {
  markers: MapMarkerData[];
  onMarkerClick?: (marker: MapMarkerData) => void;
  userLocation: { lat: number; lng: number } | null;
  requestingLocation: boolean;
}

// Custom DivIcons for styling without depending on Leaflet local image files
const userIcon = L.divIcon({
  className: 'custom-user-location-marker',
  html: `<div style="
    width: 16px;
    height: 16px;
    background-color: #3b82f6;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 0 8px rgba(59, 130, 246, 0.8);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const getMarkerIcon = (type: string) => {
  let color = '#3b82f6'; // default blue
  const t = type.toLowerCase();
  if (t.includes('hospital') || t.includes('trauma')) color = '#ef4444'; // red
  else if (t.includes('pharmacy') || t.includes('store')) color = '#10b981'; // green
  else if (t.includes('police')) color = '#8b5cf6'; // purple
  else if (t.includes('blood')) color = '#b91c1c'; // dark red
  else if (t.includes('ambulance')) color = '#f59e0b'; // orange

  return L.divIcon({
    className: 'custom-facility-marker',
    html: `<div style="
      width: 14px;
      height: 14px;
      background-color: ${color};
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 0 6px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
};

export default function LiveMap({ markers, onMarkerClick, userLocation, requestingLocation }: LiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const markersGroupRef = useRef<L.FeatureGroup | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialCenter = userLocation || defaultCenter;
    const initialZoom = userLocation ? 14 : 12;

    const mapInstance = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: true
    }).setView([initialCenter.lat, initialCenter.lng], initialZoom);

    // OpenStreetMap tile layer (Free / Open-Source)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(mapInstance);

    // Create a group for hospital/facility markers
    const group = L.featureGroup().addTo(mapInstance);
    markersGroupRef.current = group;

    mapRef.current = mapInstance;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update user location marker & center
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
    } else {
      const marker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
        .addTo(map)
        .bindPopup('<b>You are here</b>');
      userMarkerRef.current = marker;
    }

    map.setView([userLocation.lat, userLocation.lng], 14);
  }, [userLocation]);

  // Update markers
  useEffect(() => {
    const map = mapRef.current;
    const group = markersGroupRef.current;
    if (!map || !group) return;

    // Clear old markers
    group.clearLayers();
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }

    markers.forEach(m => {
      if (!m.lat || !m.lng) return;

      const marker = L.marker([m.lat, m.lng], { icon: getMarkerIcon(m.type) })
        .addTo(group);

      const popupHtml = `
        <div style="font-family: sans-serif; padding: 4px; min-width: 140px;">
          <h4 style="margin: 0 0 4px 0; font-size: 12px; font-weight: bold; color: #1e293b;">${m.name}</h4>
          <p style="margin: 0 0 6px 0; font-size: 10px; color: #64748b; line-height: 1.3;">${m.address}</p>
          ${m.phone && m.phone !== 'N/A' ? `<p style="margin: 0 0 4px 0; font-size: 10px; font-weight: 600; color: #0f172a;">📞 ${m.phone}</p>` : ''}
          ${m.open24x7 ? `<p style="margin: 0; font-size: 10px; color: #10b981; font-weight: bold;">Open 24/7</p>` : ''}
        </div>
      `;

      marker.bindPopup(popupHtml);

      marker.on('click', () => {
        if (onMarkerClick) {
          onMarkerClick(m);
        }

        // Draw dotted routing line to user
        if (userLocation) {
          if (routeLineRef.current) {
            routeLineRef.current.remove();
          }
          const polyline = L.polyline([
            [userLocation.lat, userLocation.lng],
            [m.lat, m.lng]
          ], { color: '#3b82f6', weight: 3, dashArray: '5, 5' }).addTo(map);
          routeLineRef.current = polyline;
        }
      });
    });
  }, [markers, userLocation, onMarkerClick]);

  return (
    <div className="w-full h-full rounded-2xl overflow-hidden shadow-sm border border-slate-200 relative">
      <div ref={mapContainerRef} style={mapContainerStyle} />
      
      {/* Overlay Status */}
      {requestingLocation && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-blue-100 flex items-center gap-2 text-sm font-semibold text-blue-700 z-9999">
          <Loader2 size={16} className="animate-spin" /> Locating you...
        </div>
      )}
    </div>
  );
}
