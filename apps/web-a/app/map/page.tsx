'use client';

import { useEffect, useRef, useState } from 'react';

const MAPKIT_TOKEN = process.env.NEXT_PUBLIC_MAPKIT_TOKEN || '';

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (window.mapkit) {
      setMapLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js';
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (!window.mapkit) return;
      window.mapkit.init({
        authorizationCallback: (done: (token: string) => void) => done(MAPKIT_TOKEN),
      });
      setMapLoaded(true);
    };
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!mapLoaded || !containerRef.current || mapRef.current || !window.mapkit) return;

    const mapkit = window.mapkit;
    const cupertino = new mapkit.CoordinateRegion(
      new mapkit.Coordinate(37.3316850890998, -122.030067374026),
      new mapkit.CoordinateSpan(0.167647972, 0.354985255),
    );
    const map = new mapkit.Map(containerRef.current);
    map.region = cupertino;
    mapRef.current = map;
  }, [mapLoaded]);

  return <div ref={containerRef} style={{ height: 600, width: 600, maxWidth: '100%' }} />;
}
