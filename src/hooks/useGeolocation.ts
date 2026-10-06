import { useState, useEffect, useCallback, useRef } from 'react';

export interface GeolocationState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number | null;
  error: string | null;
  requesting: boolean;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export function useGeolocation(autoRequest = true) {
  const [state, setState] = useState<GeolocationState>({
    lat: null,
    lng: null,
    accuracy: null,
    speed: null,
    heading: null,
    timestamp: null,
    error: null,
    requesting: false
  });

  const watchIdRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const startWatch = useCallback(() => {
    if (!navigator.geolocation) {
      setState(s => ({
        ...s,
        error: 'Geolocation is not supported by your browser.',
        requesting: false
      }));
      return;
    }

    stopWatch();
    setState(s => ({ ...s, requesting: true, error: null }));

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        retryCountRef.current = 0;
        console.log(
          `[LIVE LOCATION] Updated: lat=${position.coords.latitude.toFixed(5)}, lng=${position.coords.longitude.toFixed(5)}, accuracy=${position.coords.accuracy?.toFixed(0)}m`
        );
        setState({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading,
          timestamp: position.timestamp,
          error: null,
          requesting: false
        });
      },
      (error) => {
        let msg = 'Failed to retrieve location.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Location permission denied by user.';
          // No retry on permission denied
          setState({ lat: null, lng: null, accuracy: null, speed: null, heading: null, timestamp: null, error: msg, requesting: false });
          return;
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Location position unavailable.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'Location request timed out.';
        }

        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          console.warn(`[LIVE LOCATION] Error: ${msg}. Retry ${retryCountRef.current}/${MAX_RETRIES} in ${RETRY_DELAY_MS}ms...`);
          retryTimerRef.current = setTimeout(() => {
            startWatch();
          }, RETRY_DELAY_MS);
        } else {
          console.error(`[LIVE LOCATION] All ${MAX_RETRIES} retries failed. Last error: ${msg}`);
          setState({ lat: null, lng: null, accuracy: null, speed: null, heading: null, timestamp: null, error: msg, requesting: false });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }, [stopWatch]);

  const getPosition = useCallback(() => {
    retryCountRef.current = 0;
    startWatch();
  }, [startWatch]);

  useEffect(() => {
    if (autoRequest) {
      startWatch();
    }
    return () => {
      stopWatch();
    };
  }, [autoRequest, startWatch, stopWatch]);

  return { ...state, getPosition };
}

export default useGeolocation;
