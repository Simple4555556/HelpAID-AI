import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Truck, MapPin, CheckCircle, XCircle, Activity, Navigation, Phone, 
  ShieldAlert, FileText, Stethoscope, Loader2, Building2, Clock, User, 
  Power, Filter, Calendar, ChevronRight, TrendingUp, History, Sparkles 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { API_BASE_URL } from '../config';

const SOCKET_URL = (import.meta as any).env.VITE_API_URL || '/';
const API_BASE = API_BASE_URL;

// Custom DivIcons for map rendering
const makeIcon = (emoji: string, color: string, size = 30) => L.divIcon({
  className: '',
  html: `<div style="width:${size}px;height:${size}px;background:${color};border:2.5px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${size * 0.5}px;box-shadow:0 2px 8px rgba(0,0,0,0.3)">${emoji}</div>`,
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2]
});

const patientIcon = makeIcon('👤', '#3b82f6');
const ambulanceIcon = makeIcon('🚑', '#f59e0b', 34);
const hospitalIcon = makeIcon('🏥', '#ef4444');

// Calculate distance in meters to ignore movement under 10 meters
function calculateDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

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

export default function AmbulanceDashboard({ user }: { user: any }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [rideRequests, setRideRequests] = useState<any[]>([]);
  const [activeRide, setActiveRide] = useState<any | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  // Driver Profile & Availability State
  const stored = JSON.parse(localStorage.getItem('helpaid_user') || '{}');
  const userId = user?.uid || user?.id || stored.id;
  const ambulanceId = stored.ambulanceProfileId || stored.ambulanceId || user?.ambulanceId || 'ambulance_0';
  const driverName = stored.displayName || stored.name || user?.displayName || 'Raj Kumar';
  const driverPhone = stored.phone || user?.phone || '+919999999999';
  const vehicleNumber = stored.vehicleNumber || 'ALS-101';
  const vehicleType = stored.vehicleType || 'ICU';
  
  const [isOnline, setIsOnline] = useState(true);
  const [isAvailable, setIsAvailable] = useState(true);

  // Filtering & History States
  const [filter, setFilter] = useState<'all' | 'critical' | 'nearest'>('all');
  const [historyPeriod, setHistoryPeriod] = useState<'today' | 'weekly'>('today');
  const [historicalCases, setHistoricalCases] = useState<any[]>([
    {
      caseId: 'hist-1',
      patientName: 'Aarav Mehta',
      injuryType: 'Fractured Leg',
      severity: 'Medium',
      completedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      distanceKm: 4.2,
      etaMinutes: 12,
      resolved: true
    },
    {
      caseId: 'hist-2',
      patientName: 'Priya Sharma',
      injuryType: 'Cardiac Arrest',
      severity: 'Critical',
      completedAt: new Date(Date.now() - 3600000 * 6).toISOString(),
      distanceKm: 2.1,
      etaMinutes: 6,
      resolved: true
    }
  ]);

  // Leaflet Map Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const patientMarkerRef = useRef<L.Marker | null>(null);
  const ambulanceMarkerRef = useRef<L.Marker | null>(null);
  const hospitalMarkerRef = useRef<L.Marker | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const mapInitializedRef = useRef(false);

  // Live GPS tracking watch variables
  const watchIdRef = useRef<number | null>(null);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const offlineQueueRef = useRef<{ lat: number; lng: number; timestamp: number }[]>([]);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isGpsActive, setIsGpsActive] = useState(false);

  const getToken = () => localStorage.getItem('helpaid_token') || '';

  // Get distance in Havesine for direct estimation
  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Sync historical cases / active case on mount
  const syncActiveAndHistory = useCallback(async () => {
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/sos/active`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.cases) {
        // If there's an active ambulance case assigned to this driver, mount it
        const myActive = data.cases.find((c: any) => 
          c.assignedAmbulanceId === ambulanceId && 
          (c.status === 'AMBULANCE_ASSIGNED' || c.status === 'DOCTOR_ACCEPTED' || c.status === 'ACCEPTED' || c.status === 'HOSPITAL_ACCEPTED')
        );
        if (myActive) {
          const formattedActive = {
            caseId: myActive._id,
            patientName: myActive.patientName,
            patient_phone: myActive.patient_phone || myActive.patientContact,
            severity: myActive.severity,
            injuryType: myActive.injuryType,
            emergencyDescription: myActive.emergencyDescription,
            imageUrl: myActive.imageUrl,
            pdfReportUrl: myActive.pdfReportUrl || myActive.pdfUrl,
            lat: myActive.lat,
            lng: myActive.lng,
            patient_location_address: myActive.patient_location_address,
            distanceKm: myActive.distanceKm || haversineDistance(myActive.lat, myActive.lng, 26.8467, 80.9462).toFixed(1),
            doctorDetails: myActive.accepted_doctor ? {
              name: myActive.accepted_doctor.name,
              phone: myActive.accepted_doctor.phone,
              specialization: myActive.accepted_doctor.specialization
            } : null,
            hospitalDetails: myActive.accepted_hospital ? {
              name: myActive.accepted_hospital.name,
              phone: myActive.accepted_hospital.phone,
              address: myActive.accepted_hospital.address
            } : null,
            liveStatus: myActive.reportData?.liveStatus || 'Accepted'
          };
          setActiveRide(formattedActive);
        }

        // Deliver pending dispatches immediately after login/on mount
        const pending = data.cases.filter((c: any) => 
          (c.assignedAmbulanceId === ambulanceId || 
           c.notifiedAmbulanceIds?.includes(ambulanceId) || 
           c.accepted_ambulance?.ambulanceId === ambulanceId) && 
          (c.status === 'AMBULANCE_ASSIGNED' || c.status === 'DOCTOR_ACCEPTED' || c.status === 'PENDING' || c.status === 'ESCALATED') &&
          !c.myResponse
        ).map((c: any) => ({
          caseId: c._id,
          patientName: c.patientName,
          patient_phone: c.patient_phone || c.patientContact,
          severity: c.severity,
          injuryType: c.injuryType,
          emergencyDescription: c.emergencyDescription,
          imageUrl: c.imageUrl,
          pdfUrl: c.pdfReportUrl || c.pdfUrl,
          lat: c.lat,
          lng: c.lng,
          patient_location_address: c.patient_location_address,
          distanceKm: c.distanceKm || haversineDistance(c.lat, c.lng, 26.8467, 80.9462).toFixed(1),
          doctorDetails: c.accepted_doctor ? {
            name: c.accepted_doctor.name,
            phone: c.accepted_doctor.phone,
            specialization: c.accepted_doctor.specialization
          } : null
        }));
        setRideRequests(pending);
        console.log(`[PENDING REQUESTS LOADED] Loaded ${pending.length} pending assigned request(s) from MongoDB for ambulanceProfileId: ${ambulanceId}`);

        // Filter and update historical completed cases
        const completed = data.cases.filter((c: any) => c.status === 'RESOLVED' && (c.assignedAmbulanceId === ambulanceId || c.accepted_ambulance?.ambulanceId === ambulanceId));
        if (completed.length > 0) {
          setHistoricalCases(completed.map((c: any) => ({
            caseId: c._id,
            patientName: c.patientName,
            injuryType: c.injuryType,
            severity: c.severity,
            completedAt: c.updatedAt || new Date().toISOString(),
            distanceKm: c.distanceKm || 3.5,
            etaMinutes: c.etaMinutes || 10,
            resolved: true
          })));
        }
      }
    } catch (e) {
      console.warn('Failed to sync cases on mount:', e);
    }
  }, [ambulanceId]);

  useEffect(() => {
    syncActiveAndHistory();
  }, [syncActiveAndHistory]);

  // Handle Socket.IO connection
  useEffect(() => {
    if (!userId) return;

    // Pass userId in query so server auto-joins user_${userId} on handshake
    const newSocket = io(SOCKET_URL, { reconnection: true, query: { userId } });
    setSocket(newSocket);

    const connectOnline = (lat?: number, lng?: number) => {
      newSocket.emit('user:online', { 
        userId, 
        role: 'ambulance_driver', 
        profileId: ambulanceId, 
        lat, 
        lng 
      });
      // Explicitly join the ambulance profile room
      if (ambulanceId) {
        newSocket.emit('join_ambulance_room', ambulanceId);
        console.log(`[AMBULANCE ROOM] Explicitly joined ambulance_${ambulanceId}`);
      }
      console.log(`[AMBULANCE ROOM] Server auto-joined user_${userId} via handshake`);
    };

    newSocket.on('connect', () => {
      console.log('[SOCKET CONNECTED] Ambulance dashboard connected, socketId:', newSocket.id);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => connectOnline(pos.coords.latitude, pos.coords.longitude),
          () => connectOnline(),
          { enableHighAccuracy: true, timeout: 5000 }
        );
      } else {
        connectOnline();
      }
    });

    newSocket.on('ambulance:profile_resolved', (resolved: any) => {
      console.log('[SOCKET RECEIVED] ambulance:profile_resolved:', resolved);
      if (resolved?.profileId && resolved.profileId !== ambulanceId) {
        try {
          const storedUser = JSON.parse(localStorage.getItem('helpaid_user') || '{}');
          storedUser.ambulanceProfileId = resolved.profileId;
          storedUser.ambulanceId = resolved.profileId;
          localStorage.setItem('helpaid_user', JSON.stringify(storedUser));
        } catch {}
      }
    });

    // Offline / Reconnect events
    newSocket.on('reconnect', () => {
      console.log('[SOCKET] Reconnected. Re-binding rooms and online states.');
      connectOnline();
      syncActiveAndHistory();
      syncOfflineQueue(newSocket);
    });

    const handleIncomingRequest = (eventName: string, data: any) => {
      console.log(`[SOCKET RECEIVED] ${eventName} received for ambulance ${ambulanceId}:`, data);
      setRideRequests(prev => {
        if (prev.find(r => r.caseId === data.caseId)) return prev;
        return [data, ...prev];
      });
      try { new Audio('/alert.mp3').play().catch(() => {}); } catch {}
    };

    // Listeners for dispatches
    newSocket.on('ambulance:request', (data: any) => handleIncomingRequest('ambulance:request', data));
    newSocket.on('ambulance_request_created', (data: any) => handleIncomingRequest('ambulance_request_created', data));
    newSocket.on('ambulance:assigned', (data: any) => handleIncomingRequest('ambulance:assigned', data));

    newSocket.on('sos:new', (data: any) => {
      console.log('[AMBULANCE REQUEST RECEIVED] sos:new event received:', data);
      setRideRequests(prev => {
        if (prev.find(r => r.caseId === data.caseId)) return prev;
        return [data, ...prev];
      });
    });

    return () => {
      newSocket.emit('user:offline', { userId, role: 'ambulance_driver', profileId: ambulanceId });
      newSocket.close();
    };
  }, [userId, ambulanceId]);

  // Sync offline GPS queue once socket reconnects
  const syncOfflineQueue = (sock: Socket) => {
    if (offlineQueueRef.current && offlineQueueRef.current.length > 0) {
      console.log(`[GPS SYNC] Syncing ${offlineQueueRef.current.length} offline queued locations`);
      offlineQueueRef.current.forEach(queued => {
        sock.emit('ambulance:location:update', {
          caseId: activeRide?.caseId,
          lat: queued.lat,
          lng: queued.lng,
          timestamp: queued.timestamp
        });
      });
      offlineQueueRef.current = [];
    }
  };

  // Start watchPosition for Live Tracking
  const startLiveGPSTracking = useCallback((caseId: string) => {
    if (!('geolocation' in navigator)) {
      setGpsError('Geolocation is not supported by your browser');
      return;
    }

    if (watchIdRef.current !== null) return; // Already watching

    console.log('[GPS STARTED] Geolocation watcher initiated on Ambulance Dashboard for caseId:', caseId);
    setGpsError(null);
    setIsGpsActive(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, speed, heading, accuracy } = pos.coords;
        
        // Ignore movement under 10 meters
        if (lastPositionRef.current) {
          const delta = calculateDistanceInMeters(
            lastPositionRef.current.lat,
            lastPositionRef.current.lng,
            latitude,
            longitude
          );
          if (delta < 10) {
            console.log(`[GPS THROTTLED] Ignored minor movement of ${delta.toFixed(1)} meters`);
            return;
          }
        }

        lastPositionRef.current = { lat: latitude, lng: longitude };

        if (activeRide && (activeRide.status === 'COMPLETED' || activeRide.status === 'RESOLVED')) {
          stopLiveGPSTracking();
          return;
        }

        const payload = {
          caseId,
          lat: latitude,
          lng: longitude,
          speed,
          heading,
          accuracy,
          timestamp: Date.now()
        };

        if (socket && socket.connected) {
          console.log('[AMBULANCE LOCATION SENT] Emitting ambulance:location:update:', payload);
          socket.emit('ambulance:location:update', payload);
        } else {
          console.warn('[GPS QUEUED] Network offline, queuing GPS coordinate update');
          if (!offlineQueueRef.current) offlineQueueRef.current = [];
          offlineQueueRef.current.push({ lat: latitude, lng: longitude, timestamp: Date.now() });
        }
      },
      (err) => {
        console.error('[GPS ERROR] watchPosition failed:', err.message);
        setGpsError(err.message);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  }, [socket]);

  // Stop watchPosition
  const stopLiveGPSTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      console.log('[GPS STOPPED] Geolocation watcher terminated on case completion');
    }
    setIsGpsActive(false);
  }, []);

  // Accept Ride Action
  const handleAccept = async (request: any) => {
    console.log('[AMBULANCE ACCEPTED] Accept clicked for caseId:', request.caseId);
    setAccepting(request.caseId);
    try {
      const res = await fetch(`${API_BASE}/api/sos/accept-ambulance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ caseId: request.caseId })
      });
      const data = await res.json();
      if (data.success) {
        console.log('[AMBULANCE ACCEPTED] Server confirmed acceptance for caseId:', request.caseId);
        const ride = { ...request, liveStatus: 'Accepted' };
        setActiveRide(ride);
        setRideRequests(prev => prev.filter(r => r.caseId !== request.caseId));
        
        // Join case room for tracking updates
        if (socket) {
          socket.emit('track_emergency', request.caseId);
          console.log('[TRACKING UPDATED] Joined case room: case_' + request.caseId);
        }

        // Start Geolocation
        console.log('[GPS STARTED] Initiating watchPosition for caseId:', request.caseId);
        startLiveGPSTracking(request.caseId);
      } else {
        alert(data.error || 'Failed to accept run.');
      }
    } catch {
      alert('Failed to accept ambulance run.');
    }
    setAccepting(null);
  };

  // Reject Ride Action
  const handleReject = async (caseId: string) => {
    try {
      await fetch(`${API_BASE}/api/sos/reject-ambulance-dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ caseId })
      });
      setRideRequests(prev => prev.filter(r => r.caseId !== caseId));
    } catch {
      alert('Failed to reject ambulance dispatch request.');
    }
  };

  // Change Status Action
  const handleStatusChange = async (nextStatus: string) => {
    if (!activeRide) return;
    setUpdatingStatus(nextStatus);

    try {
      const res = await fetch(`${API_BASE}/api/sos/update-ambulance-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ caseId: activeRide.caseId, status: nextStatus })
      });
      const data = await res.json();
      if (data.success) {
        setActiveRide(prev => ({ ...prev, liveStatus: nextStatus }));

        // If completed, move to historical array, clear active, and stop GPS
        if (nextStatus === 'COMPLETED') {
          stopLiveGPSTracking();
          setHistoricalCases(prev => [
            {
              caseId: activeRide.caseId,
              patientName: activeRide.patientName,
              injuryType: activeRide.injuryType,
              severity: activeRide.severity,
              completedAt: new Date().toISOString(),
              distanceKm: activeRide.distanceKm,
              etaMinutes: activeRide.etaMinutes || 0,
              resolved: true
            },
            ...prev
          ]);
          setActiveRide(null);
          mapInitializedRef.current = false;
        }
      } else {
        alert(data.error || 'Failed to update status.');
      }
    } catch {
      alert('Failed to connect to status updates endpoint.');
    } finally {
      setUpdatingStatus(null);
    }
  };

  // Initialize Map in active mode
  useEffect(() => {
    if (!activeRide || !mapContainerRef.current) return;
    if (mapRef.current) return; // Map already exists

    // Standard center coordinates
    const patientCoords = [activeRide.lat || 26.8467, activeRide.lng || 80.9462] as [number, number];

    const mapInstance = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false
    }).setView(patientCoords, 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(mapInstance);

    mapRef.current = mapInstance;

    // Create markers
    patientMarkerRef.current = L.marker(patientCoords, { icon: patientIcon })
      .addTo(mapInstance)
      .bindPopup(`<b>Patient: ${activeRide.patientName}</b>`);

    // Fetch and render routes
    const setupMapData = async () => {
      // Find initial ambulance location (fallback to patient + offset)
      let ambulanceLat = (activeRide.lat || 26.8467) + 0.015;
      let ambulanceLng = (activeRide.lng || 80.9462) + 0.015;

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
          ambulanceLat = pos.coords.latitude;
          ambulanceLng = pos.coords.longitude;
          updateAmbulanceMarker(ambulanceLat, ambulanceLng);
        });
      } else {
        updateAmbulanceMarker(ambulanceLat, ambulanceLng);
      }

      function updateAmbulanceMarker(lat: number, lng: number) {
        if (!mapRef.current) return;
        const coords = [lat, lng] as [number, number];
        if (ambulanceMarkerRef.current) {
          ambulanceMarkerRef.current.setLatLng(coords);
        } else {
          ambulanceMarkerRef.current = L.marker(coords, { icon: ambulanceIcon })
            .addTo(mapRef.current)
            .bindPopup('<b>Ambulance Service</b>');
        }

        // Draw polyline
        fetchOsrmRoute({ lat, lng }, { lat: activeRide.lat, lng: activeRide.lng }).then(points => {
          if (!mapRef.current) return;
          if (routePolylineRef.current) {
            routePolylineRef.current.setLatLngs(points);
          } else {
            routePolylineRef.current = L.polyline(points, { color: '#f59e0b', weight: 4, opacity: 0.85 }).addTo(mapRef.current);
          }
          // Fit bounds
          const bounds = L.latLngBounds([coords, patientCoords]);
          mapRef.current.fitBounds(bounds, { padding: [40, 40] });
        });
      }
    };

    setupMapData();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        patientMarkerRef.current = null;
        ambulanceMarkerRef.current = null;
        hospitalMarkerRef.current = null;
        routePolylineRef.current = null;
      }
    };
  }, [activeRide]);

  // Update map ambulance marker on live GPS position changes
  useEffect(() => {
    if (!activeRide || !mapRef.current || !lastPositionRef.current) return;
    const ambPos = [lastPositionRef.current.lat, lastPositionRef.current.lng] as [number, number];

    if (ambulanceMarkerRef.current) {
      ambulanceMarkerRef.current.setLatLng(ambPos);
    } else {
      ambulanceMarkerRef.current = L.marker(ambPos, { icon: ambulanceIcon })
        .addTo(mapRef.current)
        .bindPopup('<b>Ambulance (Live)</b>');
    }

    // Recalculate OSRM Polyline Route
    fetchOsrmRoute(lastPositionRef.current, { lat: activeRide.lat, lng: activeRide.lng }).then(points => {
      if (routePolylineRef.current) {
        routePolylineRef.current.setLatLngs(points);
      }
    });
  }, [activeRide, lastPositionRef.current]);

  // Availability / Online handlers
  const handleAvailabilityToggle = () => {
    setIsAvailable(!isAvailable);
    if (socket) {
      socket.emit('ambulance:status_update', {
        ambulanceId,
        is_available: !isAvailable,
        is_online: isOnline
      });
    }
  };

  const handleOnlineToggle = () => {
    setIsOnline(!isOnline);
    if (!isOnline) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => socket?.emit('user:online', { userId, role: 'ambulance_driver', profileId: ambulanceId, lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => socket?.emit('user:online', { userId, role: 'ambulance_driver', profileId: ambulanceId })
        );
      } else {
        socket?.emit('user:online', { userId, role: 'ambulance_driver', profileId: ambulanceId });
      }
    } else {
      socket?.emit('user:offline', { userId, role: 'ambulance_driver', profileId: ambulanceId });
    }
  };

  // Helper arrays for filtering requests
  const filteredRequests = rideRequests.filter(req => {
    if (filter === 'critical') return req.severity?.toUpperCase() === 'CRITICAL';
    return true;
  });

  if (filter === 'nearest') {
    filteredRequests.sort((a, b) => parseFloat(a.distanceKm) - parseFloat(b.distanceKm));
  }

  // Stats calculation
  const livesAssistedCount = historicalCases.length;
  const avgResponseTime = livesAssistedCount > 0 ? Math.ceil(historicalCases.reduce((acc, c) => acc + (c.etaMinutes || 8), 0) / livesAssistedCount) : 8;
  const avgEta = livesAssistedCount > 0 ? Math.ceil(historicalCases.reduce((acc, c) => acc + (c.etaMinutes || 10), 0) / livesAssistedCount) : 10;

  return (
    <div className="min-h-screen bg-slate-955 text-slate-100 font-sans pb-16">
      {/* ── HEADER ── */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 shadow-lg px-4 sm:px-6 py-4 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
            <Truck size={22} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-white leading-none">Ambulance Portal</h1>
            <p className="text-[10px] font-bold text-slate-500 mt-0.5 tracking-wider">Unit: {vehicleNumber} • {vehicleType}</p>
          </div>
        </div>

        {/* Toggles */}
        <div className="flex items-center gap-2">
          {/* Availability Toggle */}
          <button onClick={handleAvailabilityToggle}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              isAvailable 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}>
            <Power size={13} />
            {isAvailable ? 'Available' : 'Busy'}
          </button>

          {/* Online status indicator */}
          <button onClick={handleOnlineToggle}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              isOnline 
                ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' 
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-blue-400 animate-pulse' : 'bg-slate-500'}`} />
            {isOnline ? 'Online' : 'Offline'}
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: ACTIVE RIDE & INCOMING DISPATCH */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* active ride console */}
          <AnimatePresence mode="wait">
            {activeRide ? (
              <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                className="bg-slate-900 border border-slate-800 rounded-[28px] p-6 shadow-2xl relative overflow-hidden space-y-5">
                <div className="absolute top-0 right-0 w-64 h-64 bg-orange-600/5 rounded-full blur-3xl pointer-events-none" />
                
                {/* Header */}
                <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                    <div>
                      <h2 className="text-sm font-black text-red-500 uppercase tracking-widest leading-none">Active Emergency Run</h2>
                      <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">ID: {activeRide.caseId.substring(18)}</p>
                    </div>
                  </div>

                  {/* Status pills indicator */}
                  <span className="px-2.5 py-1 text-[10px] font-black uppercase rounded bg-orange-500/20 text-orange-400 tracking-wider">
                    {activeRide.liveStatus}
                  </span>
                </div>

                {/* Patient / Doctor Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-950/60 border border-slate-800 p-4.5 rounded-2xl space-y-2">
                    <p className="text-slate-500 text-[9px] font-bold uppercase tracking-wider leading-none">Patient Information</p>
                    <h3 className="text-base font-black text-white">{activeRide.patientName}</h3>
                    <p className="text-xs font-semibold text-orange-400 capitalize">{activeRide.severity} • {activeRide.injuryType}</p>
                    
                    {activeRide.patient_phone && (
                      <a href={`tel:${activeRide.patient_phone}`} className="inline-flex items-center gap-1.5 text-xs text-blue-400 font-bold hover:underline pt-1">
                        <Phone size={11} /> Call Patient
                      </a>
                    )}
                  </div>

                  {/* Location & Destination details */}
                  <div className="bg-slate-950/60 border border-slate-800 p-4.5 rounded-2xl space-y-3 flex flex-col justify-between">
                    <div>
                      <p className="text-slate-500 text-[9px] font-bold tracking-wider leading-none uppercase">Pickup Address</p>
                      <p className="text-xs text-slate-300 font-semibold mt-1.5 leading-relaxed flex items-start gap-1.5">
                        <MapPin size={13} className="text-blue-500 shrink-0 mt-0.5" />
                        {activeRide.patient_location_address || 'Awaiting exact address coordinates'}
                      </p>
                    </div>

                    <div className="text-right border-t border-slate-800/40 pt-2 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500">Recalculated Distance</span>
                      <span className="text-sm font-black text-blue-400">{activeRide.distanceKm} km</span>
                    </div>
                  </div>
                </div>

                {/* Associated Doctor & Hospital Info */}
                {(activeRide.doctorDetails || activeRide.hospitalDetails) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeRide.doctorDetails && (
                      <div className="bg-slate-950/40 border border-slate-800/50 p-4 rounded-xl flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                          <Stethoscope size={18} />
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-slate-500 uppercase">Assigned Clinical Doctor</p>
                          <p className="text-xs font-bold text-slate-200">{activeRide.doctorDetails.name}</p>
                          {activeRide.doctorDetails.phone && (
                            <a href={`tel:${activeRide.doctorDetails.phone}`} className="text-[10px] text-emerald-400 font-bold hover:underline">
                              Call Doctor
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {activeRide.hospitalDetails && (
                      <div className="bg-slate-950/40 border border-slate-800/50 p-4 rounded-xl flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center shrink-0">
                          <Building2 size={18} />
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-slate-500 uppercase">Destination Hospital</p>
                          <p className="text-xs font-bold text-slate-200 truncate">{activeRide.hospitalDetails.name}</p>
                          {activeRide.hospitalDetails.phone && (
                            <a href={`tel:${activeRide.hospitalDetails.phone}`} className="text-[10px] text-red-400 font-bold hover:underline">
                              Call Hospital
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* LIVE MAP TRACKING CONTAINER */}
                <div className="h-64 rounded-2xl overflow-hidden border border-slate-800 relative z-10">
                  <div ref={mapContainerRef} className="w-full h-full" />
                  
                  {/* Legend Overlay */}
                  <div className="absolute bottom-2 left-2 z-[999] bg-slate-900/90 border border-slate-800 rounded-lg p-2 text-[9px] font-bold text-slate-400 space-y-1">
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-blue-500" /> Patient</div>
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" /> Ambulance</div>
                  </div>

                  {gpsError && (
                    <div className="absolute top-2 right-2 z-[999] bg-red-950/90 border border-red-800 text-red-400 rounded-lg p-2 text-[10px] font-bold">
                      GPS Error: {gpsError}
                    </div>
                  )}
                </div>

                {/* NAVIGATION ROUTING LINKS */}
                <div className="grid grid-cols-2 gap-3">
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${activeRide.lat},${activeRide.lng}`}
                    target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 py-3 bg-slate-850 hover:bg-slate-700 text-white rounded-xl font-bold text-xs transition-all border border-slate-700">
                    <Navigation size={14} className="text-blue-400" /> Google Maps Directions
                  </a>
                  <a href={`maps://maps.apple.com/?daddr=${activeRide.lat},${activeRide.lng}`}
                    target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 py-3 bg-slate-855 hover:bg-slate-700 text-white rounded-xl font-bold text-xs transition-all border border-slate-700">
                    <Navigation size={14} className="text-emerald-400" /> Apple Maps Directions
                  </a>
                </div>

                {/* STATUS STEPPING CONTROLS */}
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Update Ambulance Live Status</p>
                  
                  <div className="flex flex-wrap gap-2">
                    {['ACCEPTED', 'ON_ROUTE', 'ARRIVED', 'PATIENT_PICKED', 'REACHED_HOSPITAL', 'COMPLETED'].map((stat) => {
                      const isActive = activeRide.liveStatus.toUpperCase() === stat;
                      const label = stat.replace('_', ' ');

                      return (
                        <button key={stat} onClick={() => handleStatusChange(stat)}
                          disabled={updatingStatus !== null}
                          className={`px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 capitalize transition-all active:scale-[0.98] ${
                            isActive 
                              ? 'bg-orange-500 text-white font-black shadow-lg shadow-orange-500/25' 
                              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                          }`}>
                          {updatingStatus === stat && <Loader2 size={13} className="animate-spin" />}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* PDF pre arrival briefing download */}
                {activeRide.pdfReportUrl && (
                  <a href={activeRide.pdfReportUrl} target="_blank" rel="noopener noreferrer"
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all">
                    <FileText size={15} /> View AI pre-arrival emergency brief (PDF)
                  </a>
                )}

              </motion.div>
            ) : (
              /* Awaiting Ride Incoming Panel */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-black uppercase text-slate-500 tracking-wider flex items-center gap-2">
                    <Activity size={15} /> Incoming Dispatch Signals
                  </h2>

                  {/* Filters */}
                  <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                    {(['all', 'critical', 'nearest'] as const).map(tab => (
                      <button key={tab} onClick={() => setFilter(tab)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase transition-all ${
                          filter === tab ? 'bg-orange-500 text-white' : 'text-slate-500 hover:text-slate-300'
                        }`}>
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>

                <AnimatePresence>
                  {filteredRequests.length === 0 ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="py-16 text-center bg-slate-900/40 border-2 border-dashed border-slate-800 rounded-3xl">
                      <ShieldAlert size={40} className="mx-auto text-slate-700 mb-3" />
                      <h3 className="text-slate-400 font-bold text-sm">No Dispatch Signals Detected</h3>
                      <p className="text-slate-600 text-xs mt-1">Availability: Listening to active doctor SOS broadcasts...</p>
                    </motion.div>
                  ) : (
                    filteredRequests.map(req => (
                      <motion.div key={req.caseId} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-orange-500" />
                        
                        <div className="pl-3 space-y-3.5">
                          {/* Header */}
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded ${
                                  req.severity?.toUpperCase() === 'CRITICAL' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                                }`}>
                                  {req.severity}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono">Case: {req.caseId.substring(18)}</span>
                              </div>
                              <h3 className="font-black text-base text-white mt-1.5">{req.patientName}</h3>
                              <p className="text-xs text-slate-400 mt-0.5">{req.injuryType}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-orange-500 font-black text-lg">{req.distanceKm} <span className="text-xs font-semibold">km</span></div>
                              <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest leading-none">Distance</p>
                              <div className="text-blue-400 font-black text-sm mt-1">{req.eta || Math.ceil(parseFloat(req.distanceKm) / 40 * 60) || 8} mins</div>
                              <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest leading-none">ETA</p>
                            </div>
                          </div>

                          {/* Address details */}
                          {req.patient_location_address && (
                            <div className="flex items-start gap-2 bg-slate-955 p-2.5 rounded-xl border border-slate-800/40">
                              <MapPin size={13} className="text-blue-500 shrink-0 mt-0.5" />
                              <p className="text-xs text-slate-400 leading-normal">{req.patient_location_address}</p>
                            </div>
                          )}

                          {/* Emergency description */}
                          {req.emergencyDescription && (
                            <p className="text-xs text-slate-500 leading-relaxed italic">"{req.emergencyDescription}"</p>
                          )}

                          {/* Doctor & Hospital information */}
                          {(req.doctorDetails || req.hospitalName) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-slate-950/60 border border-slate-800/40 rounded-xl p-3 text-xs">
                              {req.doctorDetails && (
                                <div className="flex items-center gap-2">
                                  <Stethoscope size={13} className="text-emerald-400 shrink-0" />
                                  <p className="text-slate-400 font-medium">Doctor: <span className="text-slate-200 font-bold">{req.doctorDetails.name}</span></p>
                                </div>
                              )}
                              {(req.hospitalName || req.doctorDetails?.hospital) && (
                                <div className="flex items-center gap-2">
                                  <Building2 size={13} className="text-red-400 shrink-0" />
                                  <p className="text-slate-400 font-medium">Hospital: <span className="text-slate-200 font-bold">{req.hospitalName || req.doctorDetails?.hospital}</span></p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Actions accepts/reject/pdf */}
                          <div className="flex flex-wrap gap-2 pt-1.5">
                            <button onClick={() => handleAccept(req)} disabled={accepting === req.caseId}
                              className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-black rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-orange-500/10">
                              {accepting === req.caseId ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Accept Dispatch
                            </button>
                            
                            {(req.pdfUrl || req.pdfReportUrl) && (
                              <a href={req.pdfUrl || req.pdfReportUrl} target="_blank" rel="noopener noreferrer"
                                className="px-4 bg-indigo-600 hover:bg-indigo-750 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all">
                                <FileText size={14} /> View PDF
                              </a>
                            )}

                            <button onClick={() => handleReject(req.caseId)}
                              className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 border border-slate-700 rounded-xl flex items-center justify-center transition-all">
                                <XCircle size={15} />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            )}
          </AnimatePresence>

        </div>

        {/* RIGHT COLUMN: DRIVER PROFILE, STATS & completed runs HISTORY */}
        <div className="space-y-6">
          
          {/* Driver profile card */}
          <div className="bg-slate-900 border border-slate-800 rounded-[24px] p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-orange-400 text-lg font-black">
                {driverName.charAt(0)}
              </div>
              <div>
                <h3 className="font-black text-sm text-white">{driverName}</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">{driverPhone}</p>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3.5 grid grid-cols-2 gap-3 text-center text-xs">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[9px] font-bold text-slate-500 block uppercase">Vehicle</span>
                <p className="font-mono font-bold text-slate-200 mt-0.5">{vehicleNumber}</p>
              </div>
              <div className="bg-slate-955 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[9px] font-bold text-slate-500 block uppercase">Type</span>
                <p className="font-bold text-slate-200 mt-0.5">{vehicleType}</p>
              </div>
            </div>
          </div>

          {/* Stats Analytics */}
          <div className="bg-gradient-to-br from-indigo-950/20 to-slate-900 border border-slate-800 rounded-[24px] p-5 space-y-4 shadow-xl">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5"><TrendingUp size={14} className="text-indigo-400" /> Runs Analytics</h3>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-900/60">
                <Clock size={16} className="text-orange-400 mx-auto mb-1" />
                <span className="font-black text-sm text-slate-200 block">{avgEta}m</span>
                <span className="text-[8px] font-bold text-slate-500 uppercase">Avg ETA</span>
              </div>
              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-900/60">
                <Activity size={16} className="text-indigo-400 mx-auto mb-1" />
                <span className="font-black text-sm text-slate-200 block">{avgResponseTime}m</span>
                <span className="text-[8px] font-bold text-slate-500 uppercase">Resp. Time</span>
              </div>
              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-900/60">
                <Sparkles size={16} className="text-emerald-400 mx-auto mb-1 animate-pulse" />
                <span className="font-black text-sm text-slate-200 block">{livesAssistedCount}</span>
                <span className="text-[8px] font-bold text-slate-500 uppercase">Assisted</span>
              </div>
            </div>
          </div>

          {/* Historical resolved runs */}
          <div className="bg-slate-900 border border-slate-800 rounded-[24px] p-5 space-y-3.5">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5"><History size={14} className="text-slate-500" /> History</h3>

              <div className="flex items-center gap-1 bg-slate-955 p-0.5 rounded border border-slate-800">
                {(['today', 'weekly'] as const).map(tab => (
                  <button key={tab} onClick={() => setHistoryPeriod(tab)}
                    className={`px-2 py-0.5 rounded text-[8px] font-black uppercase transition-all ${
                      historyPeriod === tab ? 'bg-slate-800 text-white' : 'text-slate-600 hover:text-slate-400'
                    }`}>
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-800/60 max-h-72 overflow-y-auto pr-1">
              {historicalCases.map(h => (
                <div key={h.caseId} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <h4 className="font-bold text-slate-200">{h.patientName}</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">{h.injuryType} • {h.severity}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-slate-400">{h.distanceKm} km</span>
                    <p className="text-[9px] text-slate-600 mt-0.5 font-semibold">Completed</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
