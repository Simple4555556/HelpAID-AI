import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Phone, Navigation, Search, Hospital, Shield, ShoppingBag, Filter, Droplets, Activity, Sparkles, LocateFixed, Loader2, AlertTriangle, Users } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '../lib/utils';
import { API_BASE_URL } from '../config';

type Facility = {
  id: string | number;
  name: string;
  type: 'hospital' | 'police' | 'pharmacy' | 'blood' | 'doctor' | 'ambulance';
  distanceKm: number;
  distanceLabel: string;
  address: string;
  phone: string;
  status: string;
  lat: number;
  lng: number;
  rating?: number;
  services?: string[];
};



const API_BASE = API_BASE_URL;

const TYPE_CONFIG = {
  hospital: { color: 'bg-red-500', light: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-600 dark:text-red-400', border: 'border-red-100 dark:border-red-900/40', label: 'Hospital' },
  police:   { color: 'bg-blue-600', light: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-100 dark:border-blue-900/40', label: 'Police' },
  pharmacy: { color: 'bg-green-600', light: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-600 dark:text-green-400', border: 'border-green-100 dark:border-green-900/40', label: 'Pharmacy' },
  blood:    { color: 'bg-rose-600', light: 'bg-rose-50 dark:bg-rose-900/20', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-100 dark:border-rose-900/40', label: 'Blood Bank' },
  doctor:   { color: 'bg-teal-600', light: 'bg-teal-50 dark:bg-teal-900/20', text: 'text-teal-600 dark:text-teal-400', border: 'border-teal-100 dark:border-teal-900/40', label: 'Doctor' },
  ambulance:{ color: 'bg-orange-500', light: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-100 dark:border-orange-900/40', label: 'Ambulance' },
};

const FILTER_TABS = [
  { id: 'all', label: 'All', icon: Filter },
  { id: 'hospital', label: 'Hospital', icon: Hospital },
  { id: 'police', label: 'Police', icon: Shield },
  { id: 'pharmacy', label: 'Pharmacy', icon: ShoppingBag },
  { id: 'blood', label: 'Blood', icon: Droplets },
  { id: 'doctor', label: 'Doctor', icon: Users },
  { id: 'ambulance', label: 'Ambulance', icon: Activity },
];

// Haversine distance formula (km)
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}



export default function NearbyHelp() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [, setLoading] = useState(true);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  // Dynamically load Leaflet CDN scripts
  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => {
        setLeafletLoaded(true);
      };
      document.head.appendChild(script);
    } else {
      if ((window as any).L) {
        setLeafletLoaded(true);
      }
    }
  }, []);

  const fetchNearby = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    try {
      const radius = 15000; // 15km search radius
      const endpoints = [
        { type: 'hospital', url: `/api/nearby-hospitals?latitude=${lat}&longitude=${lng}&radius=${radius}` },
        { type: 'police', url: `/api/nearby-policestations?latitude=${lat}&longitude=${lng}&radius=${radius}` },
        { type: 'pharmacy', url: `/api/nearby-medicalstores?latitude=${lat}&longitude=${lng}&radius=${radius}` },
        { type: 'blood', url: `/api/nearby-bloodbanks?latitude=${lat}&longitude=${lng}&radius=${radius}` },
        { type: 'doctor', url: `/api/nearby-doctors?latitude=${lat}&longitude=${lng}&radius=${radius}` },
        { type: 'ambulance', url: `/api/nearby-ambulances?latitude=${lat}&longitude=${lng}&radius=${radius}` }
      ];

      const responses = await Promise.all(
        endpoints.map(ep =>
          fetch(`${API_BASE}${ep.url}`)
            .then(r => r.json())
            .then(data => (data.facilities || []).map((f: any, idx: number) => ({
              id: `${ep.type}_${idx}_${f.name}`,
              name: f.name,
              type: ep.type as any,
              distanceKm: f.distanceKm || f.distance || 0,
              distanceLabel: (f.distanceKm || f.distance || 0) < 1 ? `${Math.round((f.distanceKm || f.distance || 0) * 1000)} m` : `${(f.distanceKm || f.distance || 0).toFixed(1)} km`,
              address: f.address || `${f.city || ''} ${f.district || ''}`,
              phone: f.phone || 'N/A',
              status: f.open24x7 ? 'Open 24/7' : 'Standard Hours',
              lat: f.latitude || f.lat || lat,
              lng: f.longitude || f.lng || lng,
              rating: f.rating || 4.5,
              services: f.specializations || f.availableBloodGroups || []
            })))
            .catch(() => [])
        )
      );

      const merged = responses.flat().sort((a, b) => a.distanceKm - b.distanceKm);

      if (merged.length === 0) {
        throw new Error('No facilities returned from backend');
      }

      // Store all fetched facilities and apply slice after filtering
      setFacilities(merged);
    } catch (err) {
      console.warn('Failed to fetch from backend:', err);
      setFacilities([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocError('Geolocation not supported by your browser.');
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        setUserLat(latitude);
        setUserLng(longitude);
        
        // Cache coordinates locally (1 hour)
        try {
          localStorage.setItem('help_aid_coords', JSON.stringify({
            lat: latitude,
            lng: longitude,
            timestamp: Date.now()
          }));
        } catch (e) {}

        fetchNearby(latitude, longitude);
        setLocating(false);
      },
      () => {
        setLocError('Could not get your location. Using default city (Unnao).');
        // Unnao Coordinates fallback
        const fallbackLat = 26.5500;
        const fallbackLng = 80.4900;
        setUserLat(fallbackLat);
        setUserLng(fallbackLng);
        fetchNearby(fallbackLat, fallbackLng);
        setLocating(false);
      },
      { timeout: 8000 }
    );
  }, [fetchNearby]);

  // Load cached coords on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem('help_aid_coords');
      if (cached) {
        const parsed = JSON.parse(cached);
        const age = Date.now() - parsed.timestamp;
        if (age < 3600000) { // 1 hour validity
          setUserLat(parsed.lat);
          setUserLng(parsed.lng);
          fetchNearby(parsed.lat, parsed.lng);
          return;
        }
      }
    } catch (e) {}
    detectLocation();
  }, [detectLocation, fetchNearby]);

  // 1. Initialize Leaflet Map Instance
  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    const centerLat = userLat ?? 26.5500;
    const centerLng = userLng ?? 80.4900;

    // Initialize map if not exists
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true
      }).setView([centerLat, centerLng], 13);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      mapInstanceRef.current = map;
    } else {
      mapInstanceRef.current.setView([centerLat, centerLng]);
    }

    // Clean up map instance on unmount
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [leafletLoaded, userLat, userLng]);

  // 2. Invalidate Map size when toggling to Map View to fix gray tile issues
  useEffect(() => {
    if (viewMode === 'map' && mapInstanceRef.current) {
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 100);
    }
  }, [viewMode]);

  // 3. Render Leaflet Map Markers dynamically based on filtered facilities
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!leafletLoaded || !map) return;
    const L = (window as any).L;
    if (!L) return;

    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // User location marker
    if (userLat && userLng) {
      const userIcon = L.divIcon({
        className: 'user-marker',
        html: `<div class="relative w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-md flex items-center justify-center">
                 <div class="absolute inset-0 bg-blue-600 rounded-full animate-ping opacity-75"></div>
               </div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      const userMarker = L.marker([userLat, userLng], { icon: userIcon }).addTo(map);
      userMarker.bindPopup('<b>You are here</b>');
      markersRef.current.push(userMarker);
    }

    // Filtered facility markers
    filtered.forEach(f => {
      if (!f.lat || !f.lng) return;
      const cfg = TYPE_CONFIG[f.type] || TYPE_CONFIG.hospital;

      const markerIcon = L.divIcon({
        className: `custom-marker-${f.id}`,
        html: `<div class="w-8 h-8 rounded-full ${cfg.color} border-2 border-white shadow-lg flex items-center justify-center text-white hover:scale-110 transition-transform cursor-pointer">
                 <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                   ${f.type === 'hospital' ? '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>' : ''}
                   ${f.type === 'police' ? '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' : ''}
                   ${f.type === 'pharmacy' ? '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="16" y1="10" x2="8" y2="10"/>' : ''}
                   ${f.type === 'blood' ? '<path d="M12 22a7 7 0 0 0 7-7c0-4.3-7-11-7-11S5 10.7 5 15a7 7 0 0 0 7 7z"/>' : ''}
                   ${f.type === 'doctor' ? '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' : ''}
                   ${f.type === 'ambulance' ? '<rect x="1" y="3" width="15" height="13" rx="2" ry="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>' : ''}
                 </svg>
               </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([f.lat, f.lng], { icon: markerIcon }).addTo(map);

      marker.on('click', () => {
        setSelectedId(f.id);
        map.setView([f.lat, f.lng], 15);
      });

      const popupHtml = `
        <div style="font-family: system-ui, sans-serif; font-size:12px; min-width: 140px;">
          <strong style="display:block; margin-bottom: 3px;">${f.name}</strong>
          <span style="color:#6B7280; display:block; margin-bottom: 5px;">${f.address}</span>
          <a href="tel:${f.phone}" style="display:inline-block; padding: 4px 8px; background-color:#1D58D8; color:white; font-weight:bold; border-radius:6px; text-decoration:none;">Call Now</a>
        </div>
      `;
      marker.bindPopup(popupHtml);
      markersRef.current.push(marker);
    });
  }, [leafletLoaded, userLat, userLng, facilities, filter, search]);

  // Google Maps Directions
  const directionsUrl = (f: Facility) => {
    const origin = userLat ? `${userLat},${userLng}` : '';
    const dest = encodeURIComponent(`${f.name}, ${f.address}`);
    return `https://www.google.com/maps/dir/${origin}/${dest}`;
  };

  const filtered = facilities
    .filter(f => filter === 'all' || f.type === filter)
    .filter(f => f.name.toLowerCase().includes(search.toLowerCase()) || f.address.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 10);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="w-full pb-8"
    >
      {/* ── VIEW MODE TOGGLE ── */}
      <div className="flex justify-center mb-6">
        <div className="flex bg-gray-100 dark:bg-gray-800 p-1.5 rounded-2xl w-fit shadow-inner">
          <button
            onClick={() => setViewMode('map')}
            className={cn(
              'px-6 py-2.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer',
              viewMode === 'map' ? 'bg-[#1D58D8] text-white shadow-md' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            Map View
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'px-6 py-2.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer',
              viewMode === 'list' ? 'bg-[#1D58D8] text-white shadow-md' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            List View
          </button>
        </div>
      </div>

      {/* ── MAP AREA ── */}
      <div className={cn("relative w-full h-[450px] rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-xl mb-6", viewMode !== 'map' && 'hidden')}>
        <div ref={mapContainerRef} className="w-full h-full" style={{ minHeight: '450px' }} />
        {/* GPS status pill */}
        <div className="absolute top-4 left-4 z-400 px-4 py-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-full shadow-md flex items-center gap-2 border border-gray-100 dark:border-gray-750">
          <div className={cn('w-2 h-2 rounded-full', userLat ? 'bg-green-500' : 'bg-gray-400')} />
          <span className="text-[10px] font-black text-gray-800 dark:text-gray-200 uppercase tracking-wider">
            {locating ? 'Detecting…' : userLat ? `GPS Active` : 'GPS Inactive'}
          </span>
        </div>

        {/* Locate button */}
        <div className="absolute right-4 bottom-4 z-400">
          <button
            onClick={detectLocation}
            disabled={locating}
            className="w-12 h-12 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform cursor-pointer border border-gray-100 dark:border-gray-750"
          >
            {locating ? <Loader2 size={20} className="text-[#1D58D8] animate-spin" /> : <LocateFixed size={20} className="text-[#1D58D8] dark:text-blue-400" />}
          </button>
        </div>
      </div>

      {/* Quick Emergency Call Pill Cards */}
      <div className="flex justify-center gap-4 mb-10 mt-4">
        {[
          { num: '108', label: 'Ambulance', icon: Hospital, color: 'bg-red-50 text-[#B91C1C] dark:bg-red-900/20 dark:text-red-400' },
          { num: '100', label: 'Police', icon: Shield, color: 'bg-blue-50 text-[#1D58D8] dark:bg-blue-900/20 dark:text-blue-400' },
          { num: '102', label: 'Medical Help', icon: Activity, color: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400' }
        ].map(item => (
          <a
            key={item.num}
            href={`tel:${item.num}`}
            className="bg-white dark:bg-gray-800 rounded-[28px] border border-gray-150 dark:border-gray-700 shadow-sm p-4 flex flex-col items-center gap-1.5 active:scale-95 transition-all w-[100px]"
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${item.color}`}>
              <item.icon size={18} />
            </div>
            <span className="text-xl font-black text-gray-900 dark:text-white mt-1">{item.num}</span>
            <span className="text-[10px] text-gray-450 dark:text-gray-400 font-bold uppercase tracking-wider">{item.label}</span>
          </a>
        ))}
      </div>

      {/* ── REST OF CONTENT ── */}
      <div className="space-y-4">
        {/* ── FILTER TABS ── */}
        <div className="flex gap-2.5 overflow-x-auto pb-2 px-1 no-scrollbar">
          {FILTER_TABS.map(tab => {
            const isActive = filter === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-5 py-3 rounded-full text-[13px] font-black whitespace-nowrap transition-all active:scale-95 cursor-pointer shadow-sm',
                  isActive
                    ? 'bg-[#1D58D8] text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-650 dark:text-gray-300 border border-gray-150 dark:border-gray-750 hover:bg-gray-50 dark:hover:bg-gray-700'
                )}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── SEARCH ── */}
        <div className="relative">
          <Search size={18} className="absolute left-4.5 top-1/2 -translate-y-1/2 text-gray-450 dark:text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search hospitals, clinics, doctors, pharmacies…"
            className="w-full pl-13 pr-4 py-4 bg-white dark:bg-gray-800 border border-gray-150 dark:border-gray-750 rounded-2xl text-[14px] font-bold text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1D58D8]/20 transition-all shadow-sm"
          />
        </div>

        {/* ── FACILITY LIST HEADER ── */}
        <div className="flex items-center justify-between mt-6">
          <h3 className="font-black text-gray-900 dark:text-white text-[16px] uppercase tracking-wider">Nearest Results</h3>
          <span className="text-xs text-gray-400 font-bold uppercase">Showing nearest 10 records</span>
        </div>

        {/* ── FACILITY CARDS ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((f) => {
              const cfg = TYPE_CONFIG[f.type] || TYPE_CONFIG.hospital;
              const isSelected = selectedId === f.id;
              return (
                <motion.div
                  layout
                  key={f.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={cn(
                    'bg-white dark:bg-gray-800 rounded-3xl border transition-all shadow-sm cursor-pointer hover:shadow-md flex flex-col justify-between overflow-hidden',
                    isSelected
                      ? 'border-blue-400 dark:border-blue-700 ring-2 ring-blue-500/10'
                      : 'border-gray-150 dark:border-gray-750'
                  )}
                  onClick={() => {
                    setSelectedId(isSelected ? null : f.id);
                    if (viewMode === 'map' && f.lat && f.lng) {
                      mapInstanceRef.current?.setView([f.lat, f.lng], 15);
                    }
                  }}
                >
                  <div className="flex items-start gap-4 p-5">
                    {/* Icon */}
                    <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner', cfg.light + ' ' + cfg.text)}>
                      {f.type === 'hospital' && <Hospital size={22} />}
                      {f.type === 'police'   && <Shield size={22} />}
                      {f.type === 'pharmacy' && <ShoppingBag size={22} />}
                      {f.type === 'blood'    && <Droplets size={22} />}
                      {f.type === 'doctor'   && <Users size={22} />}
                      {f.type === 'ambulance' && <Activity size={22} />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="font-extrabold text-gray-900 dark:text-white text-[15px] leading-tight truncate">{f.name}</p>
                        <span className="shrink-0 text-[8px] font-black bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md uppercase tracking-wider">
                          {f.status || 'Available'}
                        </span>
                      </div>
                      <p className="text-[12px] font-bold text-gray-450 dark:text-gray-450 capitalize mb-3">
                        {f.type === 'hospital' ? 'Emergency Care' : f.type.replace('_', ' ')}
                      </p>
                      
                      <div className="flex items-center gap-4 text-[11px] font-bold text-gray-500 dark:text-gray-450">
                        <span className="flex items-center gap-1">
                          <MapPin size={12} className="text-gray-400" /> {f.distanceLabel}
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-700"></span>
                        <span className="truncate max-w-[150px]">{f.address}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Area */}
                  <div className="px-5 pb-5 pt-1 grid grid-cols-3 gap-2">
                    <a
                      href={`tel:${f.phone}`}
                      onClick={e => e.stopPropagation()}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-150 dark:border-gray-700 hover:bg-gray-100 hover:dark:bg-gray-900 text-gray-700 dark:text-gray-300 font-bold text-xs transition-colors"
                    >
                      <Phone size={13} />
                      <span>Call</span>
                    </a>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(isSelected ? null : f.id);
                      }}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-150 dark:border-gray-700 hover:bg-gray-100 hover:dark:bg-gray-900 text-gray-700 dark:text-gray-300 font-bold text-xs transition-colors cursor-pointer"
                    >
                      <span>Details</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(directionsUrl(f), '_blank');
                      }}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#1D58D8] text-white font-bold text-xs transition-colors cursor-pointer shadow-sm shadow-blue-500/10"
                    >
                      <Navigation size={13} className="rotate-45" />
                      <span>Navigate</span>
                    </button>
                  </div>

                  {/* Collapsible Details */}
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-gray-50/50 dark:bg-gray-900/10 border-t border-gray-100 dark:border-gray-750"
                      >
                        <div className="p-5 space-y-3 text-xs leading-relaxed text-gray-650 dark:text-gray-300">
                          <div>
                            <span className="font-extrabold text-gray-900 dark:text-white uppercase tracking-wider text-[9px] block mb-1">Phone Contact</span>
                            <span className="font-mono text-[13px]">{f.phone || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="font-extrabold text-gray-900 dark:text-white uppercase tracking-wider text-[9px] block mb-1">Full Address</span>
                            <span>{f.address}</span>
                          </div>
                          {f.services && f.services.length > 0 && (
                            <div>
                              <span className="font-extrabold text-gray-900 dark:text-white uppercase tracking-wider text-[9px] block mb-1">Specialties / Available Groups</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {f.services.map((srv, sidx) => (
                                  <span key={sidx} className="px-2.5 py-1 bg-white dark:bg-gray-800 rounded-lg text-[10px] font-bold border border-gray-150 dark:border-gray-700">
                                    {srv}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-16 space-y-3">
              <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto border border-gray-100 dark:border-gray-750">
                <Search size={28} className="text-gray-350" />
              </div>
              <p className="font-black text-gray-905 dark:text-white uppercase tracking-wider text-sm">No facilities found</p>
              <p className="text-xs text-gray-400 font-bold">Try selecting another filter category or adjusting your search term.</p>
            </div>
          )}
        </div>

        {/* ── AI TIP CARD ── */}
        <div className="bg-linear-to-br from-gray-900 to-gray-800 rounded-3xl p-6 text-white relative overflow-hidden shadow-xl mt-6">
          <div className="absolute top-0 right-0 w-40 h-40 bg-blue-600/10 blur-3xl rounded-full -mr-10 -mt-10 pointer-events-none" />
          <div className="relative flex items-start gap-4">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Sparkles size={18} className="text-white" />
            </div>
            <div>
              <h4 className="font-black text-sm uppercase tracking-wider mb-1">Golden Hour Guideline</h4>
              <p className="text-gray-450 text-xs leading-relaxed font-bold">
                In severe medical emergencies, the first 60 minutes are critical. Call <strong className="text-white">108 (Ambulance)</strong> immediately. Do not attempt self-transport if cardiac or severe spinal injury is suspected.
              </p>
            </div>
          </div>
          <div className="relative mt-4.5 flex gap-2">
            <a href="tel:108" className="flex items-center gap-1.5 bg-red-650 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-xs font-black transition-all active:scale-95 shadow-md shadow-red-500/10">
              <Phone size={13} />
              <span>108 Ambulance</span>
            </a>
            <button
              onClick={() => {
                if (facilities.length > 0) {
                  window.open(directionsUrl(facilities[0]), '_blank');
                } else {
                  window.open(`https://www.google.com/maps/search/hospital+near+me`, '_blank');
                }
              }}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer"
            >
              <Navigation size={13} className="rotate-45" />
              <span>Find Nearest Hospital</span>
            </button>
          </div>
        </div>

        {/* Emergency Numbers reference */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 border border-gray-150 dark:border-gray-750 shadow-sm mt-6">
          <h4 className="font-black text-gray-900 dark:text-white text-xs uppercase tracking-wide mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-orange-500" />
            <span>Emergency Helplines</span>
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: '🚑 Ambulance', number: '108' },
              { label: '🚔 Police', number: '100' },
              { label: '🚒 Fire Brigade', number: '101' },
              { label: '🏥 Medical Help', number: '102' },
              { label: '👩 Women Helpline', number: '1091' },
              { label: '👶 Child Helpline', number: '1098' },
            ].map(item => (
              <a
                key={item.number}
                href={`tel:${item.number}`}
                className="flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-900 px-4 py-3 rounded-xl transition-all active:scale-95 border border-gray-100 dark:border-gray-750"
              >
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{item.label}</span>
                <span className="text-xs font-black text-blue-600 dark:text-blue-400">{item.number}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
