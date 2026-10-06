import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Navigation, Hospital, Shield, ShoppingBag, Phone, Loader2, AlertTriangle, LocateFixed, RefreshCw, Compass, Crosshair, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';
import L from 'leaflet';
import { API_BASE_URL } from '../config';

// ─── Types ──────────────────────────────────────────────────────────────────
type GeoState = {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  address: string | null;
  status: 'idle' | 'loading' | 'success' | 'denied' | 'error';
  errorMessage: string;
};

type Facility = {
  name: string;
  address: string;
  phone: string;
  distanceKm: number;
  latitude: number;
  longitude: number;
  lat: number;
  lng: number;
  open24x7?: boolean;
};

type FacilityData = {
  hospitals: Facility[];
  medicalStores: Facility[];
  policeStations: Facility[];
  loading: boolean;
};

// ─── API Base ───────────────────────────────────────────────────────────────
const API_BASE = API_BASE_URL;

// ─── Facility Tab Config ────────────────────────────────────────────────────
const TABS = [
  {
    id: 'hospitals' as const,
    label: 'Hospitals',
    icon: Hospital,
    endpoint: '/api/nearby-hospitals',
    color: 'from-red-500 to-rose-600',
    lightBg: 'bg-red-50 dark:bg-red-950/30',
    textColor: 'text-red-600 dark:text-red-400',
    borderColor: 'border-red-100 dark:border-red-900/40',
    badgeColor: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    markerColor: '#ef4444',
  },
  {
    id: 'medicalStores' as const,
    label: 'Medical Stores',
    icon: ShoppingBag,
    endpoint: '/api/nearby-medicalstores',
    color: 'from-emerald-500 to-green-600',
    lightBg: 'bg-emerald-50 dark:bg-emerald-950/30',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    borderColor: 'border-emerald-100 dark:border-emerald-900/40',
    badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    markerColor: '#10b981',
  },
  {
    id: 'policeStations' as const,
    label: 'Police Stations',
    icon: Shield,
    endpoint: '/api/nearby-policestations',
    color: 'from-blue-500 to-indigo-600',
    lightBg: 'bg-blue-50 dark:bg-blue-950/30',
    textColor: 'text-blue-600 dark:text-blue-400',
    borderColor: 'border-blue-100 dark:border-blue-900/40',
    badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    markerColor: '#3b82f6',
  },
];

// ─── Custom map marker SVG creator ──────────────────────────────────────────
function createFacilityIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'custom-facility-marker',
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${color};border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function createUserIcon(): L.DivIcon {
  return L.divIcon({
    className: 'user-location-marker',
    html: `<div style="position:relative;width:20px;height:20px;">
      <div style="position:absolute;inset:0;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 0 0 3px rgba(37,99,235,0.3),0 2px 8px rgba(0,0,0,0.3);z-index:2;"></div>
      <div style="position:absolute;inset:-8px;border-radius:50%;background:rgba(37,99,235,0.15);animation:pulse 2s ease-in-out infinite;z-index:1;"></div>
    </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -14],
  });
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function MVPDashboard() {
  // Geo state
  const [geo, setGeo] = useState<GeoState>({
    latitude: null, longitude: null, accuracy: null, address: null,
    status: 'idle', errorMessage: '',
  });

  // Facility data
  const [facilities, setFacilities] = useState<FacilityData>({
    hospitals: [], medicalStores: [], policeStations: [], loading: false,
  });

  // Active tab
  const [activeTab, setActiveTab] = useState<'hospitals' | 'medicalStores' | 'policeStations'>('hospitals');

  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  // ─── Request Geolocation ──────────────────────────────────────────────────
  const requestGeolocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeo(prev => ({ ...prev, status: 'error', errorMessage: 'Geolocation is not supported by your browser.' }));
      return;
    }

    setGeo(prev => ({ ...prev, status: 'loading' }));

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setGeo(prev => ({
          ...prev,
          latitude, longitude, accuracy,
          status: 'success',
          errorMessage: '',
        }));

        // Reverse geocode
        try {
          const res = await fetch(`${API_BASE}/api/location/reverse-geocode?latitude=${latitude}&longitude=${longitude}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.location) {
              setGeo(prev => ({ ...prev, address: data.location.display_name }));
            }
          }
        } catch {
          // Silently fail – address is optional
        }
      },
      (error) => {
        let msg = 'Unable to retrieve your location.';
        if (error.code === 1) msg = 'Location permission was denied. Please allow location access in your browser settings.';
        else if (error.code === 2) msg = 'Position unavailable. Please try again.';
        else if (error.code === 3) msg = 'Location request timed out. Please try again.';
        setGeo(prev => ({ ...prev, status: 'denied', errorMessage: msg }));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }, []);

  // Auto-request on mount
  useEffect(() => {
    requestGeolocation();
  }, [requestGeolocation]);

  // ─── Fetch Nearby Facilities ──────────────────────────────────────────────
  useEffect(() => {
    if (geo.status !== 'success' || !geo.latitude || !geo.longitude) return;

    const fetchAllFacilities = async () => {
      setFacilities(prev => ({ ...prev, loading: true }));

      const fetchOne = async (endpoint: string): Promise<Facility[]> => {
        try {
          const res = await fetch(`${API_BASE}${endpoint}?latitude=${geo.latitude}&longitude=${geo.longitude}&radius=10000`);
          if (!res.ok) return [];
          const data = await res.json();
          return data.facilities || [];
        } catch {
          return [];
        }
      };

      const [hospitals, medicalStores, policeStations] = await Promise.all([
        fetchOne('/api/nearby-hospitals'),
        fetchOne('/api/nearby-medicalstores'),
        fetchOne('/api/nearby-policestations'),
      ]);

      setFacilities({ hospitals, medicalStores, policeStations, loading: false });
    };

    fetchAllFacilities();
  }, [geo.status, geo.latitude, geo.longitude]);

  // ─── Initialize Leaflet Map ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [20.5937, 78.9629], // Default India center
      zoom: 5,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Add zoom control to top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Add attribution
    L.control.attribution({ position: 'bottomright', prefix: false })
      .addAttribution('© <a href="https://osm.org/copyright">OSM</a>')
      .addTo(map);

    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;
    mapInstanceRef.current = map;

    // Fix Leaflet sizing issues
    setTimeout(() => map.invalidateSize(), 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // ─── Center map on user location ──────────────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || geo.status !== 'success' || !geo.latitude || !geo.longitude) return;

    const map = mapInstanceRef.current;
    map.setView([geo.latitude, geo.longitude], 14);

    // Remove old user marker
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
    }

    // Add user marker
    const userMarker = L.marker([geo.latitude, geo.longitude], { icon: createUserIcon() })
      .addTo(map)
      .bindPopup('<strong>📍 Your Location</strong>');

    userMarkerRef.current = userMarker;
  }, [geo.status, geo.latitude, geo.longitude]);

  // ─── Update facility markers on map ───────────────────────────────────────
  useEffect(() => {
    if (!markersLayerRef.current) return;

    const layer = markersLayerRef.current;
    layer.clearLayers();

    const tabConfig = TABS.find(t => t.id === activeTab);
    if (!tabConfig) return;

    const items = facilities[activeTab];
    items.forEach((f) => {
      const lat = f.latitude || f.lat;
      const lng = f.longitude || f.lng;
      if (!lat || !lng) return;

      L.marker([lat, lng], { icon: createFacilityIcon(tabConfig.markerColor) })
        .addTo(layer)
        .bindPopup(`
          <div style="font-family:Inter,sans-serif;min-width:180px;">
            <strong style="font-size:13px;">${f.name}</strong>
            <p style="font-size:11px;color:#666;margin:4px 0;">${f.address || 'N/A'}</p>
            ${f.phone && f.phone !== 'N/A' ? `<p style="font-size:11px;">📞 ${f.phone}</p>` : ''}
            <p style="font-size:11px;color:#2563eb;font-weight:600;">${f.distanceKm?.toFixed(1) || '?'} km away</p>
          </div>
        `);
    });
  }, [activeTab, facilities]);

  // ─── Format distance ─────────────────────────────────────────────────────
  const fmtDist = (km: number) => {
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1)} km`;
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div id="mvp-dashboard" className="space-y-4">
      {/* ── Location Card ─────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-800/60">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-200 dark:shadow-blue-900/30">
            <Compass size={18} strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Current Location</h2>
            <p className="text-[11px] text-gray-400 truncate">Real-time GPS tracking</p>
          </div>
          {geo.status === 'success' && (
            <button
              onClick={requestGeolocation}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all active:scale-90"
              title="Refresh location"
            >
              <RefreshCw size={14} />
            </button>
          )}
        </div>

        <div className="px-4 py-3">
          {geo.status === 'loading' && (
            <div className="flex items-center gap-3 py-4 justify-center">
              <Loader2 size={20} className="animate-spin text-blue-500" />
              <span className="text-sm text-gray-500">Acquiring GPS signal...</span>
            </div>
          )}

          {geo.status === 'idle' && (
            <button
              onClick={requestGeolocation}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold text-sm hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all active:scale-[0.98]"
            >
              <LocateFixed size={16} />
              Enable Location
            </button>
          )}

          {(geo.status === 'denied' || geo.status === 'error') && (
            <div className="flex items-start gap-3 py-2">
              <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Location Unavailable</p>
                <p className="text-xs text-gray-500 mt-0.5">{geo.errorMessage}</p>
                <button
                  onClick={requestGeolocation}
                  className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Try Again →
                </button>
              </div>
            </div>
          )}

          {geo.status === 'success' && geo.latitude && geo.longitude && (
            <div className="space-y-2.5">
              {/* Coordinate chips */}
              <div className="flex gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <Crosshair size={12} className="text-blue-500" />
                  <span className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-300">
                    {geo.latitude.toFixed(6)}
                  </span>
                  <span className="text-[10px] text-gray-400">LAT</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <Crosshair size={12} className="text-emerald-500" />
                  <span className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-300">
                    {geo.longitude.toFixed(6)}
                  </span>
                  <span className="text-[10px] text-gray-400">LNG</span>
                </div>
                {geo.accuracy && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <Navigation size={12} className="text-violet-500" />
                    <span className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-300">
                      ±{Math.round(geo.accuracy)}m
                    </span>
                  </div>
                )}
              </div>

              {/* Address */}
              {geo.address && (
                <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100/60 dark:border-blue-900/30">
                  <MapPin size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{geo.address}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Interactive Map ───────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-800/60">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-200 dark:shadow-emerald-900/30">
            <MapPin size={18} strokeWidth={2.5} />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Live Map</h2>
            <p className="text-[11px] text-gray-400">OpenStreetMap · Leaflet</p>
          </div>
        </div>
        <div
          ref={mapContainerRef}
          id="mvp-map-container"
          className="w-full"
          style={{ height: 320 }}
        />
      </div>

      {/* ── Facility Tabs ─────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        {/* Tab headers */}
        <div className="flex border-b border-gray-100 dark:border-gray-800">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const count = facilities[tab.id].length;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 flex flex-col items-center gap-1 py-3 px-2 text-xs font-bold transition-all relative",
                  isActive
                    ? `${tab.textColor}`
                    : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                )}
              >
                <Icon size={18} strokeWidth={isActive ? 2.5 : 1.5} />
                <span className="leading-none">{tab.label}</span>
                {count > 0 && (
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", tab.badgeColor)}>
                    {count}
                  </span>
                )}
                {isActive && (
                  <div className={cn("absolute bottom-0 left-2 right-2 h-[2.5px] rounded-full bg-gradient-to-r", tab.color)} />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
          {facilities.loading && (
            <div className="flex items-center justify-center gap-3 py-10">
              <Loader2 size={20} className="animate-spin text-blue-500" />
              <span className="text-sm text-gray-500">Searching nearby...</span>
            </div>
          )}

          {!facilities.loading && facilities[activeTab].length === 0 && geo.status === 'success' && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <AlertTriangle size={20} className="text-gray-400" />
              </div>
              <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">No {TABS.find(t => t.id === activeTab)?.label} Found</p>
              <p className="text-xs text-gray-400">No results within 10 km radius</p>
            </div>
          )}

          {!facilities.loading && geo.status !== 'success' && (
            <div className="flex flex-col items-center gap-2 py-10 text-center px-6">
              <LocateFixed size={24} className="text-gray-300" />
              <p className="text-sm text-gray-500">Enable location to see nearby facilities</p>
            </div>
          )}

          {!facilities.loading && facilities[activeTab].map((facility, index) => {
            const tabConfig = TABS.find(t => t.id === activeTab)!;
            const Icon = tabConfig.icon;
            return (
              <div
                key={`${facility.name}-${index}`}
                className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
              >
                {/* Icon */}
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", tabConfig.lightBg)}>
                  <Icon size={16} className={tabConfig.textColor} strokeWidth={2} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">{facility.name}</h3>
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate">{facility.address || 'Address not available'}</p>

                  <div className="flex items-center gap-3 mt-1.5">
                    {/* Distance badge */}
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", tabConfig.badgeColor)}>
                      {fmtDist(facility.distanceKm)}
                    </span>

                    {/* Open 24x7 badge */}
                    {facility.open24x7 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                        24/7
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  {facility.phone && facility.phone !== 'N/A' && (
                    <a
                      href={`tel:${facility.phone}`}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-all active:scale-90"
                      title={`Call ${facility.phone}`}
                    >
                      <Phone size={14} />
                    </a>
                  )}
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${facility.latitude || facility.lat},${facility.longitude || facility.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all active:scale-90"
                    title="Get Directions"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
