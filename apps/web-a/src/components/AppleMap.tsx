'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { MapKitMap, MapKitGeocoderResponse } from '../types/mapkit.d';

const MAPKIT_TOKEN = process.env.NEXT_PUBLIC_MAPKIT_TOKEN || '';

interface AppleMapProps {
  location: string;
  markerTitle: string;
  span?: number;
}

export default function AppleMap({ location, markerTitle, span = 0.05 }: AppleMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapKitMap | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getColorScheme = useCallback(() => {
    const mapkit = window.mapkit;
    if (!mapkit) return 'light';

    return document.documentElement.classList.contains('dark')
      ? mapkit.Map.ColorSchemes.Dark
      : mapkit.Map.ColorSchemes.Light;
  }, []);

  const initMap = useCallback(async () => {
    if (!mapContainerRef.current || mapRef.current) return;

    try {
      const mapkit = window.mapkit;
      if (!mapkit) {
        setError('MapKit not loaded');
        return;
      }

      if (!mapkit.init) {
        setError('MapKit initialization failed');
        return;
      }

      try {
        mapkit.init({
          authorizationCallback: (done: (token: string) => void) => {
            done(MAPKIT_TOKEN);
          },
        });
      } catch {
        // Already initialized, continue
      }

      const map = new mapkit.Map(mapContainerRef.current, {
        colorScheme: getColorScheme(),
        showsCompass: mapkit.FeatureVisibility.Adaptive,
        showsScale: mapkit.FeatureVisibility.Adaptive,
        showsZoomControl: true,
        showsMapTypeControl: true,
      });
      mapRef.current = map;

      const geocoder = new mapkit.Geocoder();
      geocoder.lookup(location, (geocodeError: Error | null, data: MapKitGeocoderResponse | null) => {
        if (geocodeError || !data?.results?.[0]) {
          setError('Location not found');
          return;
        }

        const place = data.results[0];
        const coordinate = place.coordinate;

        const marker = new mapkit.MarkerAnnotation(coordinate, {
          color: '#ec4899',
          title: markerTitle,
        });
        map.addAnnotation(marker);

        map.region = new mapkit.CoordinateRegion(
          coordinate,
          new mapkit.CoordinateSpan(span, span)
        );

        setIsLoaded(true);
      });
    } catch {
      setError('Failed to initialize map');
    }
  }, [getColorScheme, location, markerTitle, span]);

  useEffect(() => {
    const updateMapColorScheme = () => {
      if (mapRef.current) {
        mapRef.current.colorScheme = getColorScheme();
      }
    };

    updateMapColorScheme();

    const observer = new MutationObserver(updateMapColorScheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, [getColorScheme]);

  useEffect(() => {
    let cancelled = false;
    import('@/lib/mapkit-loader').then(({ loadMapKit }) => loadMapKit()).then(() => {
      if (!cancelled) initMap();
    }).catch(() => setError('Failed to load MapKit'));

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, [initMap]);

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-gray-400 dark:text-zinc-500 text-sm bg-gray-50 dark:bg-[#171717]">
        <div className="text-center px-4">
          <svg className="w-8 h-8 mx-auto text-gray-300 dark:text-zinc-700 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-xs">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-[#1f1f1f]">
          <div className="animate-pulse text-gray-400 dark:text-zinc-500 text-sm">Loading map...</div>
        </div>
      )}
      <div ref={mapContainerRef} className="absolute inset-0" />
    </>
  );
}
