import React, { useState, useEffect, useRef } from 'react';
import LiveMap, { MapMarkerData } from '../components/LiveMap';
import { Search, MapPin, Loader2, Navigation, Activity } from 'lucide-react';
import { motion } from 'motion/react';
import { API_BASE_URL } from '../config';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export default function LocationAgentPage() {
  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [requestingLocation, setRequestingLocation] = useState(false);
  const [markers, setMarkers] = useState<MapMarkerData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const watchIdRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationFetchedRef = useRef(false);

  // Get user location on mount using watchPosition
  useEffect(() => {
    startWatchingLocation();
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const startWatchingLocation = () => {
    if (!('geolocation' in navigator)) {
      setErrorMsg('Geolocation not supported by your browser.');
      return;
    }
    setRequestingLocation(true);
    setErrorMsg('');

    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        retryCountRef.current = 0;
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        console.log(`[LIVE LOCATION] LocationAgent updated: lat=${lat.toFixed(5)}, lng=${lng.toFixed(5)}`);
        setUserLocation({ lat, lng });
        setRequestingLocation(false);
        // Fetch nearby hospitals only on first successful location fix
        if (!locationFetchedRef.current) {
          locationFetchedRef.current = true;
          fetchAgentResults('hospitals', lat, lng);
        }
      },
      (error) => {
        let msg = 'Failed to retrieve location.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Location permission denied. Defaulting to center.';
          setErrorMsg(msg);
          setRequestingLocation(false);
          return;
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Location position unavailable.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'Location request timed out.';
        }
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          console.warn(`[LIVE LOCATION] Error: ${msg}. Retry ${retryCountRef.current}/${MAX_RETRIES} in ${RETRY_DELAY_MS}ms...`);
          retryTimerRef.current = setTimeout(startWatchingLocation, RETRY_DELAY_MS);
        } else {
          console.error(`[LIVE LOCATION] All ${MAX_RETRIES} retries exhausted: ${msg}`);
          setErrorMsg(msg);
          setRequestingLocation(false);
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const requestLocation = () => {
    retryCountRef.current = 0;
    locationFetchedRef.current = false;
    startWatchingLocation();
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !userLocation) return;
    fetchAgentResults(searchQuery, userLocation.lat, userLocation.lng);
  };

  const fetchAgentResults = async (query: string, lat: number, lng: number) => {
    setIsSearching(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/agent/location-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, latitude: lat, longitude: lng })
      });
      const data = await response.json();
      
      if (data.results) {
        const newMarkers: MapMarkerData[] = data.results.map((r: any, idx: number) => ({
          id: r.place_id || r._id || `m_${idx}`,
          name: r.name,
          address: r.address || r.city,
          lat: r.latitude || r.lat,
          lng: r.longitude || r.lng,
          type: data.intent?.type || 'hospital',
          phone: r.phone,
          open24x7: r.open24x7
        }));
        setMarkers(newMarkers);
      }
    } catch (err) {
      console.error('Error fetching location agent results', err);
      setErrorMsg('Failed to fetch results.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50 text-slate-900 overflow-hidden">
      {/* Sidebar */}
      <div className="w-full md:w-96 bg-white border-r border-slate-200 shadow-sm flex flex-col h-full z-10">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
            <MapPin size={20} />
          </div>
          <div>
            <h1 className="font-bold text-lg">Location Intelligence</h1>
            <p className="text-xs text-slate-500">AI-powered medical directory</p>
          </div>
        </div>

        <div className="p-4 border-b border-slate-100 space-y-4">
          <form onSubmit={handleSearchSubmit} className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g. 'Nearest hospital', 'Blood bank'"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            <Search className="absolute left-3 top-3 text-slate-400" size={16} />
            <button 
              type="submit" 
              className="absolute right-2 top-1.5 bottom-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors"
              disabled={isSearching}
            >
              {isSearching ? <Loader2 size={14} className="animate-spin" /> : 'Find'}
            </button>
          </form>

          {/* Quick Filters */}
          <div className="flex flex-wrap gap-2">
             {['Hospitals', 'Clinics', 'Pharmacies', 'Blood Banks', 'Police', 'Ambulance'].map((tag) => (
               <button
                 key={tag}
                 onClick={() => {
                   setSearchQuery(tag);
                   if (userLocation) fetchAgentResults(tag, userLocation.lat, userLocation.lng);
                 }}
                 className="px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded-lg text-xs font-semibold transition-colors border border-transparent hover:border-blue-100"
               >
                 {tag}
               </button>
             ))}
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-semibold border border-red-100">
              {errorMsg}
            </div>
          )}

          {markers.length === 0 && !isSearching && !errorMsg ? (
            <div className="text-center p-8 text-slate-400">
              <Activity size={32} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">Ask the agent to find nearby healthcare facilities.</p>
            </div>
          ) : (
            markers.map((marker, idx) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                key={marker.id} 
                className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-300 transition-colors cursor-pointer"
              >
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-sm text-slate-800 pr-4">{marker.name}</h3>
                  <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                    <Navigation size={14} />
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{marker.address}</p>
                <div className="flex gap-2 mt-2">
                  {marker.open24x7 && <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded font-bold border border-emerald-100">24/7 OPEN</span>}
                  {marker.phone && marker.phone !== 'N/A' && <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-semibold border border-slate-200">📞 {marker.phone}</span>}
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Main Map Area */}
      <div className="flex-1 h-full p-2 sm:p-4 relative">
        <LiveMap 
          markers={markers} 
          userLocation={userLocation} 
          requestingLocation={requestingLocation}
        />
      </div>
    </div>
  );
}
