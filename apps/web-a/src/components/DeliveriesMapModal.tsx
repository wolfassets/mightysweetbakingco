'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MapKitMap, MapKitAnnotation, MapKitCoordinate, MapKitCoordinateRegion } from '../types/mapkit.d';

interface Delivery {
  id: number;
  storeName: string;
  location: string | null;
  datePrepared: string;
  dropoffDate: string | null;
  expirationDate: string | null;
  totalPrepared: number;
  totalCogs: number;
  totalRevenue: number;
  grossProfit: number;
  profitMargin: number;
  notes: string | null;
  deletedAt?: string | null;
}


interface DeliveriesMapModalProps {
  deliveries: Delivery[];
  onClose: () => void;
  selectedDelivery: Delivery | null;
  onSelectDelivery: (d: Delivery | null) => void;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string) => string;
}

function createMapKitCoordinate(raw: MapKitCoordinate | null | undefined): MapKitCoordinate | null {
  if (!raw || !window.mapkit) return null;

  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return new window.mapkit.Coordinate(latitude, longitude);
}

export default function DeliveriesMapModal({
  deliveries,
  onClose,
  selectedDelivery,
  onSelectDelivery,
  formatCurrency,
  formatDate,
}: DeliveriesMapModalProps): React.JSX.Element {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapKitMap | null>(null);
  const userRegionRef = useRef<MapKitCoordinateRegion | null>(null);
  const isRestoringRegionRef = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const onSelectDeliveryRef = useRef(onSelectDelivery);
  onSelectDeliveryRef.current = onSelectDelivery;

  // Load MapKit JS (singleton)
  useEffect(() => {
    let cancelled = false;
    import('@/lib/mapkit-loader').then(({ loadMapKit }) => loadMapKit()).then(() => {
      if (!cancelled) setMapLoaded(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Initialize map and add markers
  useEffect(() => {
    if (!mapLoaded || !mapContainerRef.current || mapRef.current || !window.mapkit) return;

    const map = new window.mapkit.Map(mapContainerRef.current, {
      showsCompass: 'adaptive',
      showsScale: 'adaptive',
      colorScheme: 'light',
    });
    mapRef.current = map;

    map.addEventListener('region-change-end', () => {
      if (!isRestoringRegionRef.current) {
        userRegionRef.current = map.region;
      }
    });

    const geocoder = new window.mapkit.Geocoder();
    const annotations: MapKitAnnotation[] = [];

    const deliveriesToGeocode = deliveries.filter(d => d.location && d.location.trim() !== '');
    let completed = 0;

    if (deliveriesToGeocode.length === 0) return;

    deliveriesToGeocode.forEach((delivery) => {
      geocoder.lookup(delivery.location!, (error, data) => {
        completed++;

        if (!error && data?.results?.length && data.results.length > 0 && window.mapkit) {
          const coordinate = createMapKitCoordinate(data.results[0].coordinate);
          if (coordinate) {
            let marker: MapKitAnnotation | null = null;
            try {
              marker = new window.mapkit.MarkerAnnotation(coordinate, {
                title: delivery.storeName,
                subtitle: formatDate(delivery.dropoffDate || delivery.datePrepared),
                color: '#ec4899',
                glyphColor: '#ffffff',
              });
            } catch (err) {
              console.warn('[DeliveriesMapModal] MarkerAnnotation failed for', delivery.id, err);
            }
            if (!marker) {
              if (completed === deliveriesToGeocode.length && annotations.length === 0) setMapReady(true);
              return;
            }

            marker.addEventListener('select', () => {
              const clicked = deliveries.find(d => d.id === delivery.id);
              if (clicked) {
                onSelectDeliveryRef.current(clicked);
                if (userRegionRef.current && mapRef.current) {
                  isRestoringRegionRef.current = true;
                  setTimeout(() => {
                    if (mapRef.current && userRegionRef.current) {
                      mapRef.current.region = userRegionRef.current;
                      setTimeout(() => {
                        isRestoringRegionRef.current = false;
                      }, 100);
                    }
                  }, 10);
                }
              }
            });

            try {
              annotations.push(marker);
              map.addAnnotation(marker);
            } catch (err) {
              console.warn('[DeliveriesMapModal] addAnnotation failed for', delivery.id, err);
            }
          }
        }

        if (completed === deliveriesToGeocode.length && annotations.length > 0 && window.mapkit) {
          const coords = annotations.map(a => a.coordinate);
          const lats = coords.map(c => c.latitude);
          const lngs = coords.map(c => c.longitude);

          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);

          const centerLat = (minLat + maxLat) / 2;
          const centerLng = (minLng + maxLng) / 2;
          const latSpan = Math.max((maxLat - minLat) * 1.5, 0.1);
          const lngSpan = Math.max((maxLng - minLng) * 1.5, 0.1);

          const region = new window.mapkit.CoordinateRegion(
            new window.mapkit.Coordinate(centerLat, centerLng),
            new window.mapkit.CoordinateSpan(latSpan, lngSpan)
          );
          map.region = region;
          userRegionRef.current = region;
          setMapReady(true);
        } else if (completed === deliveriesToGeocode.length) {
          setMapReady(true);
        }
      });
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded]);

  // Escape to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedDelivery) {
          onSelectDelivery(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose, selectedDelivery, onSelectDelivery]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.22 }}
        className="absolute inset-0 bg-white dark:bg-[#0a0a0a]"
      >
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-10 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-gray-200 dark:border-[#262626]">
          <div className="flex items-center justify-between px-6 py-4">
            <div>
              <h2 className="text-title-3 text-gray-900 dark:text-zinc-100">Past Deliveries Map</h2>
              <p className="text-callout text-gray-500 dark:text-zinc-400">{deliveries.length} locations</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-[#1f1f1f] rounded-full transition-colors"
            >
              <svg className="w-6 h-6 text-gray-600 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Loading */}
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-[#171717] z-5">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-pink-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-callout text-gray-500 dark:text-zinc-400">Loading map...</p>
            </div>
          </div>
        )}

        {/* Map */}
        <div
          ref={mapContainerRef}
          className="w-full h-full transition-opacity duration-300"
          style={{ opacity: mapReady ? 1 : 0 }}
        />

        {/* Detail Card */}
        <AnimatePresence>
          {selectedDelivery && (
            <motion.div
              key={selectedDelivery.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.25 }}
              className="absolute bottom-6 left-6 right-6 md:left-auto md:right-6 md:w-96 bg-white dark:bg-[#0a0a0a] rounded-2xl shadow-2xl border border-gray-200 dark:border-[#262626] overflow-hidden"
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-title-3 text-gray-900 dark:text-zinc-100">{selectedDelivery.storeName}</h3>
                    <p className="text-callout text-gray-500 dark:text-zinc-400">{formatDate(selectedDelivery.dropoffDate || selectedDelivery.datePrepared)}</p>
                  </div>
                  <button
                    onClick={() => onSelectDelivery(null)}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-[#1f1f1f] rounded-full transition-colors"
                  >
                    <svg className="w-5 h-5 text-gray-400 dark:text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {selectedDelivery.location && (
                  <p className="text-callout text-gray-600 dark:text-zinc-400 mb-4 flex items-center gap-1">
                    <svg className="w-4 h-4 text-gray-400 dark:text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {selectedDelivery.location}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="text-center p-3 bg-gray-50 dark:bg-[#171717] rounded-xl">
                    <p className="text-caption uppercase tracking-wider text-gray-400 dark:text-zinc-500">Prepared</p>
                    <p className="text-title-3-mono text-gray-900 dark:text-zinc-100">{selectedDelivery.totalPrepared}</p>
                  </div>
                  <div className="text-center p-3 bg-pink-50 dark:bg-pink-950/40 rounded-xl">
                    <p className="text-caption uppercase tracking-wider text-pink-400 dark:text-pink-500">Revenue</p>
                    <p className="text-title-3-mono text-pink-600 dark:text-pink-400">{formatCurrency(selectedDelivery.totalRevenue)}</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 dark:bg-green-950/40 rounded-xl">
                    <p className="text-caption uppercase tracking-wider text-green-400 dark:text-green-500">Profit</p>
                    <p className="text-title-3-mono text-green-600 dark:text-green-400">{formatCurrency(selectedDelivery.grossProfit)}</p>
                  </div>
                </div>

                <a
                  href={`/deliveries/${selectedDelivery.id}`}
                  className="block w-full text-center py-2.5 bg-pink-500 text-white rounded-xl text-button hover:bg-pink-600 transition-colors"
                >
                  View Full Details
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
