import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { io, Socket } from 'socket.io-client';
import { ShieldAlert, Ambulance, Clock, Phone, MapPin, Navigation, Zap, Activity } from 'lucide-react';
import { motion } from 'motion/react';

const SOCKET_URL = (import.meta as any).env.VITE_API_URL || '/';

const makeIcon = (emoji: string, color: string, size = 28) => L.divIcon({
  className: '',
  html: `<div style="width:${size}px;height:${size}px;background:${color};border:2.5px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${size * 0.5}px;box-shadow:0 2px 8px rgba(0,0,0,0.3)">${emoji}</div>`,
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2]
});

const patientIcon = makeIcon('👤', '#3b82f6');
const ambulanceIcon = makeIcon('🚑', '#f59e0b', 32);
const hospitalIcon = makeIcon('🏥', '#ef4444');
const doctorIcon = makeIcon('👨‍⚕️', '#10b981');

// Fetch OSRM road-following route between two coordinates
async function fetchOsrmRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<L.LatLng[]> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes && data.routes[0]) {
      const coords = data.routes[0].geometry.coordinates as [number, number][];
      return coords.map(([lng, lat]) => L.latLng(lat, lng));
    }
  } catch (err) {
    console.warn('[OSRM] Route fetch failed, using direct line:', err);
  }
  return [L.latLng(from.lat, from.lng), L.latLng(to.lat, to.lng)];
}

// Calculate distance in meters to ignore minor movements
function calculateDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function EmergencyTracker() {
  const { caseId } = useParams();
  const [socket, setSocket] = useState<Socket | null>(null);

  const [patientLoc, setPatientLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [ambLoc, setAmbLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [hospLoc, setHospLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [doctorLoc, setDoctorLoc] = useState<{ lat: number; lng: number } | null>(null);

  const [status, setStatus] = useState('Locating...');
  const [eta, setEta] = useState<number | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [liveStatus, setLiveStatus] = useState<string>('On Route');
  const [ambulanceDetails, setAmbulanceDetails] = useState<any | null>(null);
  const [hospitalDetails, setHospitalDetails] = useState<any | null>(null);
  const [connected, setConnected] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const patientMarkerRef = useRef<L.Marker | null>(null);
  const ambMarkerRef = useRef<L.Marker | null>(null);
  const hospMarkerRef = useRef<L.Marker | null>(null);
  const doctorMarkerRef = useRef<L.Marker | null>(null);
  const ambRouteRef = useRef<L.Polyline | null>(null);
  const docRouteRef = useRef<L.Polyline | null>(null);
  const hospRouteRef = useRef<L.Polyline | null>(null);
  const hasCenteredRef = useRef(false);

  // Draw OSRM route between two points
  const drawRoute = useCallback(async (
    from: { lat: number; lng: number } | null,
    to: { lat: number; lng: number } | null,
    polylineRef: React.MutableRefObject<L.Polyline | null>,
    color: string
  ) => {
    const map = mapRef.current;
    if (!map || !from || !to) return;
    const coords = await fetchOsrmRoute(from, to);
    if (polylineRef.current) {
      polylineRef.current.setLatLngs(coords);
    } else {
      polylineRef.current = L.polyline(coords, { color, weight: 4, opacity: 0.8, dashArray: color === '#3b82f6' ? undefined : '8 4' }).addTo(map);
    }
  }, []);

  // 1. Fetch initial status
  useEffect(() => {
    if (!caseId) return;
    const fetchInitialStatus = async () => {
      try {
        const res = await fetch(`${SOCKET_URL === '/' ? '' : SOCKET_URL}/api/sos/patient-status/${caseId}`);
        const data = await res.json();
        if (data.success) {
          setStatus(data.status);
          setEta(data.eta);
          setDistanceKm(data.distanceRemaining);
          setLiveStatus(data.liveStatus || 'On Route');
          setPatientLoc(data.patientLoc);
          setAmbLoc(data.ambulanceLoc);
          setHospLoc(data.hospitalLoc);
          setAmbulanceDetails(data.assignedAmbulance);
          setHospitalDetails(data.assignedHospital);
        }
      } catch (e) {
        console.warn('Failed to fetch initial status:', e);
      }
    };
    fetchInitialStatus();
    const interval = setInterval(fetchInitialStatus, 8000);
    return () => clearInterval(interval);
  }, [caseId]);

  // 2. Socket connection for real-time updates
  useEffect(() => {
    if (!caseId) return;

    const guestSessionId = localStorage.getItem('guestSessionId');
    const storedUser = localStorage.getItem('helpaid_user');
    let userId = '';
    if (storedUser) {
      try { userId = JSON.parse(storedUser).id || JSON.parse(storedUser).uid; } catch {}
    }

    const queryParams: any = {};
    if (userId) {
      queryParams.userId = userId;
    } else if (guestSessionId) {
      queryParams.guestSessionId = guestSessionId;
    }

    const newSocket = io(SOCKET_URL, { query: queryParams });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setConnected(true);
      console.log('[SOCKET CONNECTED] Client connected to live tracking socket');
      console.log('[SOCKET RECEIVED] connect');
      newSocket.emit('track_emergency', caseId);
      console.log('[SOCKET EMITTED] track_emergency:', caseId);

      if (userId) {
        newSocket.emit('user:online', { userId, role: 'user' });
      } else if (guestSessionId) {
        newSocket.emit('user:online', { guestSessionId });
      }
    });

    newSocket.on('reconnect', (attempt) => {
      console.log(`[SOCKET RECONNECTED] Socket reconnected successfully after ${attempt} attempts`);
      console.log('[SOCKET RECEIVED] reconnect');
      setConnected(true);
      newSocket.emit('track_emergency', caseId);
      console.log('[SOCKET EMITTED] track_emergency (on reconnect):', caseId);

      if (userId) {
        newSocket.emit('user:online', { userId, role: 'user' });
      } else if (guestSessionId) {
        newSocket.emit('user:online', { guestSessionId });
      }
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
      console.log('[SOCKET RECEIVED] disconnect');
      console.warn('[SOCKET DISCONNECTED] Socket connection closed, trying to reconnect...');
    });

    newSocket.on('ambulance:location_update', (data: any) => {
      console.log('[SOCKET RECEIVED] ambulance:location_update:', data);
      setAmbLoc({ lat: data.lat, lng: data.lng });
      setEta(data.eta);
      if (data.distanceRemaining) setDistanceKm(parseFloat(data.distanceRemaining));
      console.log('[AMBULANCE LOCATION UPDATED] Ambulance coordinates updated on tracker:', data);
      console.log('[ETA UPDATED] ETA updated:', data.eta);
      console.log('[ROUTE UPDATED] Distance to ambulance updated:', data.distanceRemaining);
    });

    newSocket.on('ambulance:location:update', (data: any) => {
      console.log('[SOCKET RECEIVED] ambulance:location:update:', data);
      setAmbLoc({ lat: data.latitude ?? data.lat, lng: data.longitude ?? data.lng });
      setEta(data.etaMinutes);
      setDistanceKm(data.distanceKm);
      setLiveStatus(data.liveStatus || 'On Route');
      console.log('[AMBULANCE LOCATION UPDATED] Ambulance coordinates updated on tracker:', data);
      console.log('[ETA UPDATED] ETA updated:', data.etaMinutes);
      console.log('[ROUTE UPDATED] Distance to ambulance updated:', data.distanceKm);
    });

    newSocket.on('patient:location:update', (data: any) => {
      console.log('[SOCKET RECEIVED] patient:location:update:', data);
      setPatientLoc({ lat: data.lat, lng: data.lng });
      console.log('[PATIENT LOCATION UPDATED] Patient coordinates updated on tracker:', data);
    });

    newSocket.on('doctor:location:update', (data: any) => {
      console.log('[SOCKET RECEIVED] doctor:location:update:', data);
      setDoctorLoc({ lat: data.lat, lng: data.lng });
      if (data.etaMinutes) {
        setEta(data.etaMinutes);
        console.log(`[ETA UPDATED] Doctor ETA updated: ${data.etaMinutes} mins`);
      }
      if (data.distanceKm) {
        setDistanceKm(data.distanceKm);
      }
      setLiveStatus('Doctor On Route');
      console.log('[DOCTOR LOCATION UPDATED] Doctor coordinates updated on tracker:', data);
      console.log('[ROUTE UPDATED] Distance to doctor updated:', data.distanceKm);
    });

    const handleDoctorAccepted = (data: any) => {
      console.log('[TRACKER RECEIVED] doctor_accepted:', data);
      setStatus('DOCTOR_ACCEPTED');
      setLiveStatus('Doctor Accepted');
      if (data.doctor) {
        setDoctorLoc({ lat: data.doctor.latitude || data.doctor.lat, lng: data.doctor.longitude || data.doctor.lng });
      }
      if (data.hospital) {
        setHospitalDetails(data.hospital);
        if (data.hospital.latitude || data.hospital.lat) {
          setHospLoc({ lat: data.hospital.latitude || data.hospital.lat, lng: data.hospital.longitude || data.hospital.lng });
        }
      }
      if (data.ambulance) {
        setAmbulanceDetails({
          driverName: data.ambulance.driver || data.ambulance.driverName,
          driverPhone: data.ambulance.phone || data.ambulance.driverPhone || '+91XXXXXXXXXX',
          vehicleNumber: data.ambulance.vehicle || data.ambulance.vehicleNumber
        });
      }
    };

    newSocket.on('doctor_accepted', handleDoctorAccepted);
    newSocket.on('doctor:accepted', handleDoctorAccepted);
    newSocket.on('doctor_request_accepted', handleDoctorAccepted);

    newSocket.on('sos:accepted', (data: any) => {
      console.log('[SOCKET RECEIVED] sos:accepted:', data);
      console.log('[PATIENT NOTIFIED] sos:accepted received on tracker:', data);
      setStatus('DOCTOR_ACCEPTED');
      if (data.hospitalDetails) {
        setHospitalDetails(data.hospitalDetails);
        if (data.hospitalDetails.lat && data.hospitalDetails.lng) {
          setHospLoc({ lat: data.hospitalDetails.lat, lng: data.hospitalDetails.lng });
        }
      }
    });

    const handleAmbulanceAssigned = (data: any) => {
      console.log('[TRACKER RECEIVED] ambulance_assigned:', data);
      setStatus('AMBULANCE_ASSIGNED');
      setLiveStatus('Ambulance Assigned');
      const amb = data.ambulance || data;
      if (amb) {
        if (amb.lat || amb.latitude) {
          setAmbLoc({ lat: amb.lat || amb.latitude, lng: amb.lng || amb.longitude });
        }
        if (amb.eta || amb.etaMinutes) setEta(amb.eta || amb.etaMinutes);
        setAmbulanceDetails({
          driverName: amb.driverName || amb.name,
          driverPhone: amb.driverPhone || amb.phone,
          vehicleNumber: amb.vehicleNumber
        });
      }
    };

    newSocket.on('ambulance_assigned', handleAmbulanceAssigned);
    newSocket.on('ambulance:assigned', handleAmbulanceAssigned);
    newSocket.on('sos:ambulance_assigned', handleAmbulanceAssigned);

    const handleHospitalAssigned = (data: any) => {
      console.log('[TRACKER RECEIVED] hospital_assigned:', data);
      const hosp = data.accepted_hospital || data.hospital;
      if (hosp) {
        if (hosp.lat || hosp.latitude) {
          setHospLoc({ lat: hosp.lat || hosp.latitude, lng: hosp.lng || hosp.longitude });
        }
        setHospitalDetails(hosp);
      }
    };

    newSocket.on('hospital_assigned', handleHospitalAssigned);
    newSocket.on('sos:hospital_assigned', handleHospitalAssigned);

    const handleAmbulanceArrived = () => {
      console.log('[TRACKER RECEIVED] ambulance_arrived');
      setLiveStatus('Arrived');
      console.log('[ROUTE UPDATED] Ambulance reached target patient coordinates');
    };

    newSocket.on('ambulance_arrived', handleAmbulanceArrived);
    newSocket.on('ambulance:arrived', handleAmbulanceArrived);

    const handleCaseCompleted = () => {
      console.log('[TRACKER RECEIVED] case_completed');
      setLiveStatus('Completed');
      setStatus('RESOLVED');
    };

    newSocket.on('case_completed', handleCaseCompleted);

    // New tracking system events
    newSocket.on('tracking:update', (data: any) => {
      console.log('[SOCKET RECEIVED] tracking:update:', data);
      if (data.liveStatus) setLiveStatus(data.liveStatus);
      if (data.status) setStatus(data.status);
      if (data.etaMinutes !== undefined) setEta(data.etaMinutes);
      if (data.distanceKm !== undefined) setDistanceKm(data.distanceKm);
      if (data.ambulanceLoc) {
        setAmbLoc(data.ambulanceLoc);
      }
      if (data.patientLoc) {
        setPatientLoc(data.patientLoc);
      }
    });

    newSocket.on('eta:update', (data: any) => {
      console.log('[SOCKET RECEIVED] eta:update:', data);
      if (data.eta !== undefined) setEta(data.eta);
    });

    newSocket.on('route:update', (data: any) => {
      console.log('[SOCKET RECEIVED] route:update:', data);
      if (data.patientLoc) setPatientLoc(data.patientLoc);
      if (data.ambulanceLoc) setAmbLoc(data.ambulanceLoc);
    });

    newSocket.on('tracking:completed', (data: any) => {
      console.log('[SOCKET RECEIVED] tracking:completed:', data);
      setLiveStatus('Completed');
      setStatus('RESOLVED');
      console.log('[TRACKING COMPLETED] The emergency case tracking session was completed successfully.');
    });

    // ── Patient Live Location Broadcast while tracking ──
    let patientWatchId: number | null = null;
    let lastLoc: { lat: number; lng: number } | null = null;

    if ('geolocation' in navigator) {
      console.log('[GPS STARTED] Geolocation watcher initiated on patient tracker');
      patientWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, heading, speed, accuracy } = pos.coords;
          
          if (lastLoc) {
            const delta = calculateDistanceInMeters(lastLoc.lat, lastLoc.lng, latitude, longitude);
            if (delta < 10) {
              console.log(`[PATIENT GPS THROTTLED] Ignored minor movement of ${delta.toFixed(1)} meters`);
              return;
            }
          }
          
          lastLoc = { lat: latitude, lng: longitude };

          if (newSocket.connected) {
            const payload = {
              caseId,
              lat: latitude,
              lng: longitude,
              heading,
              speed,
              accuracy,
              timestamp: Date.now()
            };
            console.log('[PATIENT LOCATION SENT] Patient emitting patient:location:update:', payload);
            newSocket.emit('patient:location:update', payload);
            setPatientLoc({ lat: latitude, lng: longitude });
          }
        },
        (err) => console.warn('[LIVE LOCATION] Patient location watch error:', err.message),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }

    return () => {
      newSocket.close();
      if (patientWatchId !== null) navigator.geolocation.clearWatch(patientWatchId);
    };
  }, [caseId]);

  // 3. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const mapInstance = L.map(mapContainerRef.current, { zoomControl: true, attributionControl: false })
      .setView([26.55, 80.49], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapInstance);
    mapRef.current = mapInstance;
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // 4. Update Markers & OSRM Routes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const group: L.LatLng[] = [];

    const updateMarker = (loc: { lat: number; lng: number } | null, ref: React.MutableRefObject<L.Marker | null>, icon: L.DivIcon, popup: string) => {
      if (!loc) return;
      const pos = L.latLng(loc.lat, loc.lng);
      group.push(pos);
      if (ref.current) {
        ref.current.setLatLng(pos);
      } else {
        ref.current = L.marker(pos, { icon }).addTo(map).bindPopup(popup);
      }
    };

    updateMarker(patientLoc, patientMarkerRef, patientIcon, '<b>Patient Location</b>');
    updateMarker(ambLoc, ambMarkerRef, ambulanceIcon, `<b>Ambulance: ${ambulanceDetails?.driverName || 'Assigned'}</b>`);
    updateMarker(hospLoc, hospMarkerRef, hospitalIcon, `<b>Hospital: ${hospitalDetails?.name || 'Destination'}</b>`);
    updateMarker(doctorLoc, doctorMarkerRef, doctorIcon, '<b>Doctor On Route</b>');

    // Draw routes
    drawRoute(ambLoc, patientLoc, ambRouteRef, '#f59e0b');
    if (doctorLoc) drawRoute(doctorLoc, patientLoc, docRouteRef, '#10b981');
    if (patientLoc && hospLoc) drawRoute(patientLoc, hospLoc, hospRouteRef, '#3b82f6');

    if (group.length > 0 && !hasCenteredRef.current) {
      map.fitBounds(L.latLngBounds(group), { padding: [50, 50] });
      hasCenteredRef.current = true;
      console.log('[MAP REFRESHED] Map camera centered on active emergency route');
    }
    console.log('[ROUTE UPDATED] Map markers and routes refreshed');
  }, [patientLoc, ambLoc, hospLoc, doctorLoc, ambulanceDetails, hospitalDetails, drawRoute]);

  const statusColor = liveStatus === 'Arrived' ? 'text-green-600' : liveStatus === 'Near Patient' ? 'text-amber-600' : 'text-blue-600';

  return (
    <div className="h-[100dvh] flex flex-col bg-slate-100">
      {/* HEADER */}
      <div className="bg-white px-4 py-3 shadow-sm z-10 relative flex justify-between items-center border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">
            <ShieldAlert size={18} />
          </div>
          <div>
            <h1 className="font-black text-slate-800 leading-none">Emergency SOS Active</h1>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Live Tracker</p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${connected ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className={`w-2 h-2 rounded-full animate-pulse ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className={`text-[11px] font-bold ${connected ? 'text-green-700' : 'text-red-600'}`}>{connected ? 'Live' : 'Connecting'}</span>
        </div>
      </div>

      {/* MAP */}
      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="w-full h-full" />
        {/* Route Legend */}
        <div className="absolute bottom-2 left-2 z-[999] bg-white/95 rounded-xl p-2.5 shadow-sm border border-slate-100 text-[10px] font-bold text-slate-600 space-y-1.5">
          <div className="flex items-center gap-1.5"><div className="w-5 h-1.5 bg-amber-400 rounded" /> Ambulance → Patient</div>
          <div className="flex items-center gap-1.5"><div className="w-5 h-1.5 bg-emerald-500 rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg,#10b981 0,#10b981 8px,transparent 8px,transparent 12px)' }} /> Doctor → Patient</div>
          <div className="flex items-center gap-1.5"><div className="w-5 h-1.5 bg-blue-500 rounded" /> Patient → Hospital</div>
        </div>
      </div>

      {/* BOTTOM INFO PANEL */}
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }}
        className="bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-20 px-5 py-5 pb-8"
      >
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4" />

        {/* ETA + Status Row */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className={`text-xl font-black tracking-tight capitalize ${statusColor}`}>
              {liveStatus}
            </h2>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              {eta !== null ? (
                <><span className="text-blue-600 font-black">{eta} min</span> ETA · {distanceKm !== null ? `${distanceKm} km away` : ''}</>
              ) : 'Locating responders...'}
            </p>
          </div>
          <div className="flex gap-2">
            <div className="bg-blue-50 rounded-xl px-3 py-2 text-center border border-blue-100">
              <Clock size={14} className="text-blue-600 mx-auto mb-0.5" />
              <p className="text-[11px] font-black text-blue-700">{eta !== null ? `${eta}m` : '--'}</p>
              <p className="text-[9px] text-slate-400 font-bold uppercase">ETA</p>
            </div>
            <div className="bg-slate-50 rounded-xl px-3 py-2 text-center border border-slate-100">
              <Navigation size={14} className="text-slate-500 mx-auto mb-0.5" />
              <p className="text-[11px] font-black text-slate-700">{distanceKm !== null ? `${distanceKm}` : '--'}</p>
              <p className="text-[9px] text-slate-400 font-bold uppercase">km</p>
            </div>
          </div>
        </div>

        {/* Ambulance Details */}
        <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100 mb-4 flex gap-3 items-center">
          <div className="w-11 h-11 bg-white rounded-full border border-slate-200 flex items-center justify-center shadow-sm text-amber-500">
            <Ambulance size={20} />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-slate-800 text-sm">
              {ambulanceDetails ? ambulanceDetails.vehicleNumber : 'Searching Ambulance...'}
            </h3>
            <p className="text-xs font-semibold text-slate-500">
              {ambulanceDetails ? `${ambulanceDetails.driverName} · ${ambulanceDetails.vehicleType || 'ALS'}` : 'Please stand by'}
            </p>
          </div>
          {ambulanceDetails?.driverPhone && (
            <a href={`tel:${ambulanceDetails.driverPhone}`} className="w-9 h-9 bg-green-100 hover:bg-green-200 text-green-700 rounded-full flex items-center justify-center transition-colors">
              <Phone size={16} />
            </a>
          )}
        </div>

        {/* Hospital Destination */}
        {hospitalDetails ? (
          <div className="w-full py-3 bg-emerald-50 text-emerald-700 font-bold rounded-2xl border border-emerald-100 flex justify-center items-center gap-2 text-sm">
            <MapPin size={16} /> Destination: {hospitalDetails.name}
          </div>
        ) : (
          <div className="w-full py-3 bg-slate-50 text-slate-500 font-bold rounded-2xl border border-slate-100 flex justify-center items-center gap-2 text-sm">
            <MapPin size={16} /> Awaiting hospital destination
          </div>
        )}
      </motion.div>
    </div>
  );
}
