import React, { useState, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import type { MapKitMap, MapKitAnnotation, MapKitGeocoder, MapKitCoordinate, MapKitCoordinateRegion } from '../types/mapkit.d';

function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }): React.JSX.Element {
  const mv = useMotionValue(value);
  const display = useTransform(mv, (v) => format(v));
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] });
    return controls.stop;
  }, [value, mv]);
  return <motion.span>{display}</motion.span>;
}

interface Event {
  id: number;
  name: string;
  eventDate: string;
  location: string | null;
  eventCost: number;
  totalPrepared: number;
  totalSold: number;
  totalGiveaway: number;
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
  notes: string | null;
  deletedAt?: string | null;
}

type SortColumn = 'id' | 'name' | 'eventDate' | 'totalPrepared' | 'totalSold' | 'totalGiveaway' | 'totalRevenue' | 'totalCost' | 'netProfit' | 'eventCost';

const MAPKIT_TOKEN = process.env.NEXT_PUBLIC_MAPKIT_TOKEN || '';

function getMapColorScheme(): string {
  const mapkit = window.mapkit;
  if (!mapkit) return 'light';

  return document.documentElement.classList.contains('dark')
    ? mapkit.Map.ColorSchemes.Dark
    : mapkit.Map.ColorSchemes.Light;
}

function createMapKitCoordinate(raw: MapKitCoordinate | null | undefined): MapKitCoordinate | null {
  if (!raw || !window.mapkit) return null;

  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return new window.mapkit.Coordinate(latitude, longitude);
}

export default function EventsTable(): React.JSX.Element {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch events (active or archived)
  const fetchEvents = (archived: boolean = false): void => {
    setLoading(true);
    const url = archived ? '/api/events?archived=true' : '/api/events';
    fetch(url)
      .then((res: Response) => res.json() as Promise<Event[]>)
      .then((data: Event[]) => {
        setEvents(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        showToast('Failed to load events', 'error');
      });
  };

  useEffect(() => {
    fetchEvents();
  }, []);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>('id');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showMap, setShowMap] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success'): void => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  const toggleArchived = (): void => {
    const next = !showArchived;
    setShowArchived(next);
    fetchEvents(next);
  };

  const restoreEvent = async (id: number): Promise<void> => {
    try {
      const response = await fetch('/api/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, deletedAt: null }),
      });
      if (!response.ok) throw new Error('Failed to restore');
      setEvents(prev => prev.filter(e => e.id !== id));
      showToast('Event restored');
    } catch {
      showToast('Failed to restore event', 'error');
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const handleSort = (column: SortColumn): void => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'eventDate' ? 'desc' : 'desc');
    }
  };

  const addEvent = async (): Promise<void> => {
    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Event',
          eventDate: new Date().toISOString().split('T')[0],
          totalPrepared: 0,
          totalSold: 0,
          totalGiveaway: 0,
          totalRevenue: 0,
          totalCost: 0,
          netProfit: 0,
        }),
      });

      if (!response.ok) throw new Error('Failed to add');

      const newEvent = (await response.json()) as Event;
      // Redirect to the new event's detail page
      window.location.href = `/events/${newEvent.id}`;
    } catch {
      showToast('Failed to add event', 'error');
    }
  };

  // Sort events by selected column
  const sortedEvents = [...events].sort((a: Event, b: Event): number => {
    let comparison = 0;

    if (sortColumn === 'id') {
      comparison = a.id - b.id;
    } else if (sortColumn === 'name') {
      comparison = a.name.localeCompare(b.name);
    } else if (sortColumn === 'eventDate') {
      comparison = new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime();
    } else {
      const numericColumn: Exclude<SortColumn, 'id' | 'name' | 'eventDate'> = sortColumn;
      comparison = a[numericColumn] - b[numericColumn];
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  // Calculate totals
  const totals: Record<'prepared' | 'sold' | 'giveaway' | 'revenue' | 'cost' | 'fee' | 'profit', number> = {
    prepared: events.reduce((sum, e) => sum + e.totalPrepared, 0),
    sold: events.reduce((sum, e) => sum + e.totalSold, 0),
    giveaway: events.reduce((sum, e) => sum + e.totalGiveaway, 0),
    revenue: events.reduce((sum, e) => sum + e.totalRevenue, 0),
    cost: events.reduce((sum, e) => sum + e.totalCost, 0),
    fee: events.reduce((sum, e) => sum + (e.eventCost || 0), 0),
    profit: events.reduce((sum, e) => sum + e.netProfit, 0),
  };

  // Calculate metrics
  const eventsWithSales = events.filter(e => e.totalSold > 0).length;
  const avgProfitPerEvent = eventsWithSales > 0 ? totals.profit / eventsWithSales : 0;
  const avgRevenuePerEvent = eventsWithSales > 0 ? totals.revenue / eventsWithSales : 0;
  const profitMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;
  const sellThroughRate = totals.prepared > 0 ? (totals.sold / totals.prepared) * 100 : 0;

  // Get events with locations for the map
  const eventsWithLocations = events.filter(e => e.location && e.location.trim() !== '');

  if (loading) {
    return (
      <div className="w-full bg-white dark:bg-[#0a0a0a] rounded-3xl overflow-hidden p-8">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-3 border-pink-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Floating Card Container */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full bg-white dark:bg-[#0a0a0a] rounded-3xl overflow-hidden"
      >
        {/* Header inside card */}
        <div className="flex items-center justify-between px-8 pt-8 pb-4">
          <div>
            <h2 className="text-title-2 text-gray-900 dark:text-zinc-100">Events</h2>
            <p className="text-callout text-gray-400 dark:text-zinc-500 mt-1">Track your sales events and performance.</p>
          </div>
          <div className="flex items-center gap-3">
            {eventsWithLocations.length > 0 && (
              <button
                onClick={() => setShowMap(true)}
                className="px-5 py-2.5 bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-[#262626] text-gray-700 dark:text-zinc-300 rounded-full text-button hover:bg-gray-50 dark:hover:bg-[#171717] transition-all hover:shadow-md flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Past Events
              </button>
            )}
            <button
              onClick={toggleArchived}
              className={`px-5 py-2.5 border rounded-full text-button transition-all hover:shadow-md flex items-center gap-2 ${
                showArchived
                  ? 'bg-gray-900 border-gray-900 text-white hover:bg-gray-800 dark:bg-zinc-100 dark:border-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-[#0a0a0a] dark:border-[#262626] dark:text-zinc-300 dark:hover:bg-[#171717]'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              Archived
            </button>
            <button
              onClick={addEvent}
              className="animated-border px-5 py-2.5 text-white rounded-full text-button transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Event
            </button>
          </div>
        </div>

        {/* Stats Grid - Moved to top */}
        {events.length > 0 && (
          <div className="px-8 pb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Sell-through Rate"
                value={`${sellThroughRate.toFixed(1)}%`}
                numericValue={sellThroughRate}
                format={(n) => `${n.toFixed(1)}%`}
                sublabel={`${totals.sold.toLocaleString()} of ${totals.prepared.toLocaleString()} sold`}
                highlight
              />
              <StatCard
                label="Profit Margin"
                value={`${profitMargin.toFixed(1)}%`}
                numericValue={profitMargin}
                format={(n) => `${n.toFixed(1)}%`}
                sublabel={`${formatCurrency(totals.profit)} total profit`}
              />
              <StatCard
                label="Avg. Revenue/Event"
                value={formatCurrency(avgRevenuePerEvent)}
                numericValue={avgRevenuePerEvent}
                format={formatCurrency}
                sublabel={`${eventsWithSales} events with sales`}
              />
              <StatCard
                label="Avg. Profit/Event"
                value={formatCurrency(avgProfitPerEvent)}
                numericValue={avgProfitPerEvent}
                format={formatCurrency}
                sublabel="per event with sales"
              />
            </div>
          </div>
        )}

        {/* Table */}
        <div className="px-4 pb-4">
          <table className="data-table">
            <thead>
              <tr>
                <SortableHeader label="#" column="id" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-12 text-center" />
                <SortableHeader label="Event Name" column="name" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-52" />
                <SortableHeader label="Date" column="eventDate" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-28" />
                <SortableHeader label="Prepared" column="totalPrepared" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-20 text-center" />
                <SortableHeader label="Sold" column="totalSold" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-14 text-center" />
                <SortableHeader label="Giveaway" column="totalGiveaway" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-20 text-center" />
                <SortableHeader label="Revenue" column="totalRevenue" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-24 text-right" />
                <SortableHeader label="COGS" column="totalCost" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-20 text-right" />
                <SortableHeader label="Fee" column="eventCost" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-20 text-right" />
                <SortableHeader label="Profit" column="netProfit" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-24 text-right" />
                {showArchived && <th className="w-20"><span className="px-2 py-3 text-caption text-gray-400 dark:text-zinc-500 uppercase"></span></th>}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
              {sortedEvents.map((event) => (
                <motion.tr
                  key={event.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  className="group cursor-pointer hover:bg-pink-50 dark:hover:bg-pink-950/30 transition-colors"
                  onClick={() => window.location.href = `/events/${event.id}`}
                >
                  <td>
                    <span className="px-2 py-3 min-h-[44px] flex items-center justify-center text-gray-400 dark:text-zinc-500 text-callout-mono">
                      {event.id}
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center text-pink-600 dark:text-pink-400 text-callout">
                      {event.name}
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center text-gray-600 dark:text-zinc-400 text-callout whitespace-nowrap">
                      {formatDate(event.eventDate)}
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center justify-center text-gray-600 dark:text-zinc-400 text-callout-mono">
                      {event.totalPrepared}
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center justify-center text-gray-600 dark:text-zinc-400 text-callout-mono">
                      {event.totalSold}
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center justify-center text-gray-600 dark:text-zinc-400 text-callout-mono">
                      {event.totalGiveaway}
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center justify-end text-callout-mono whitespace-nowrap">
                      {event.totalRevenue > 0 ? (
                        <span className="text-gray-900 dark:text-zinc-100">{formatCurrency(event.totalRevenue)}</span>
                      ) : (
                        <span className="text-gray-300 dark:text-zinc-700">—</span>
                      )}
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center justify-end text-callout-mono whitespace-nowrap">
                      {event.totalCost > 0 ? (
                        <span className="text-gray-600 dark:text-zinc-400">{formatCurrency(event.totalCost)}</span>
                      ) : (
                        <span className="text-gray-300 dark:text-zinc-700">—</span>
                      )}
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center justify-end text-callout-mono whitespace-nowrap">
                      <span className={event.eventCost > 0 ? "text-orange-600 dark:text-orange-400" : "text-gray-400 dark:text-zinc-500"}>{formatCurrency(event.eventCost || 0)}</span>
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center justify-end text-callout-mono whitespace-nowrap">
                      {event.netProfit > 0 ? (
                        <span className="text-green-600 dark:text-green-400">{formatCurrency(event.netProfit)}</span>
                      ) : event.netProfit < 0 ? (
                        <span className="text-red-500 dark:text-red-400">{formatCurrency(event.netProfit)}</span>
                      ) : (
                        <span className="text-gray-300 dark:text-zinc-700">—</span>
                      )}
                    </span>
                  </td>
                  {showArchived && (
                    <td>
                      <span className="px-4 py-3 min-h-[44px] flex items-center justify-center">
                        <button
                          onClick={(e: ReactMouseEvent<HTMLButtonElement>) => { e.stopPropagation(); restoreEvent(event.id); }}
                          className="text-button-sm text-pink-500 dark:text-pink-400 hover:text-pink-600 dark:hover:text-pink-300"
                        >
                          Restore
                        </button>
                      </span>
                    </td>
                  )}
                </motion.tr>
              ))}
              </AnimatePresence>
              {/* Totals Row */}
              {events.length > 0 && (
                <tr className="border-t-2 border-gray-200 dark:border-[#262626] bg-gray-50 dark:bg-[#171717]">
                  <td></td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center text-headline text-gray-900 dark:text-zinc-100">Total</span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center text-gray-400 dark:text-zinc-500 text-callout">
                      {events.length} events
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center justify-center text-gray-900 dark:text-zinc-100 text-callout-mono">
                      {totals.prepared.toLocaleString()}
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center justify-center text-gray-900 dark:text-zinc-100 text-callout-mono">
                      {totals.sold.toLocaleString()}
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center justify-center text-gray-900 dark:text-zinc-100 text-callout-mono">
                      {totals.giveaway.toLocaleString()}
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center justify-end text-callout-mono text-gray-900 dark:text-zinc-100 whitespace-nowrap">
                      {formatCurrency(totals.revenue)}
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center justify-end text-callout-mono text-gray-900 dark:text-zinc-100 whitespace-nowrap">
                      {formatCurrency(totals.cost)}
                    </span>
                  </td>
                  <td>
                    <span className={`px-4 py-3 min-h-[44px] flex items-center justify-end text-callout-mono whitespace-nowrap ${totals.fee > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400 dark:text-zinc-500'}`}>
                      {formatCurrency(totals.fee)}
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center justify-end text-callout-mono whitespace-nowrap">
                      {totals.profit >= 0 ? (
                        <span className="text-green-600 dark:text-green-400">{formatCurrency(totals.profit)}</span>
                      ) : (
                        <span className="text-red-500 dark:text-red-400">{formatCurrency(totals.profit)}</span>
                      )}
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {events.length === 0 && (
            <div className="text-center py-12 text-callout text-gray-400 dark:text-zinc-500">
              No events yet. Click "Add Event" to get started.
            </div>
          )}
        </div>
      </motion.div>

      {/* Map Modal */}
      <AnimatePresence>
        {showMap && (
          <EventsMapModal
            events={eventsWithLocations}
            onClose={() => {
              setShowMap(false);
              setSelectedEvent(null);
            }}
            selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

// Full-screen Map Modal Component
function EventsMapModal({
  events,
  onClose,
  selectedEvent,
  onSelectEvent,
  formatCurrency,
  formatDate,
}: {
  events: Event[];
  onClose: () => void;
  selectedEvent: Event | null;
  onSelectEvent: (event: Event | null) => void;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string) => string;
}): React.JSX.Element {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapKitMap | null>(null);
  const userRegionRef = useRef<MapKitCoordinateRegion | null>(null);
  const isRestoringRegionRef = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [geocodedEvents, setGeocodedEvents] = useState<Map<number, MapKitCoordinate>>(new Map());

  // Use ref for callback to avoid useEffect dependency issues
  const onSelectEventRef = useRef(onSelectEvent);
  onSelectEventRef.current = onSelectEvent;

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
      colorScheme: getMapColorScheme(),
    });
    mapRef.current = map;

    // Track user's region changes (for preserving zoom when clicking pins)
    map.addEventListener('region-change-end', () => {
      // Don't update if we're in the middle of restoring from a pin click
      if (!isRestoringRegionRef.current) {
        userRegionRef.current = map.region;
      }
    });

    // Geocode all event locations and add markers
    const geocoder = new window.mapkit.Geocoder();
    const newGeocodedEvents = new Map<number, MapKitCoordinate>();
    const annotations: MapKitAnnotation[] = [];

    // Only count events that have locations
    const eventsToGeocode = events.filter(e => e.location && e.location.trim() !== '');
    let completed = 0;

    if (eventsToGeocode.length === 0) return;

    eventsToGeocode.forEach((event) => {
      geocoder.lookup(event.location!, (error, data) => {
        completed++;

        if (!error && data?.results?.length && data.results.length > 0 && window.mapkit) {
          const coordinate = createMapKitCoordinate(data.results[0].coordinate);
          if (coordinate) {
            newGeocodedEvents.set(event.id, coordinate);

            const marker = new window.mapkit.MarkerAnnotation(coordinate, {
              title: event.name,
              subtitle: formatDate(event.eventDate),
              color: '#ec4899',
              glyphColor: '#ffffff',
            });

            // Store event data on marker
            (marker as MapKitAnnotation & { data: { eventId: number } }).data = { eventId: event.id };

            // Add click handler - use ref to avoid stale closure
            marker.addEventListener('select', () => {
              const clickedEvent = events.find(e => e.id === event.id);
              if (clickedEvent) {
                onSelectEventRef.current(clickedEvent);
                // Restore the user's current region to prevent MapKit from zooming/centering
                if (userRegionRef.current && mapRef.current) {
                  isRestoringRegionRef.current = true;
                  setTimeout(() => {
                    if (mapRef.current && userRegionRef.current) {
                      mapRef.current.region = userRegionRef.current;
                      // Clear flag after region change completes
                      setTimeout(() => {
                        isRestoringRegionRef.current = false;
                      }, 100);
                    }
                  }, 10);
                }
              }
            });

            annotations.push(marker);
            map.addAnnotation(marker);
          }
        }

        // After all geocoding is done, fit map to show all markers
        if (completed === eventsToGeocode.length && annotations.length > 0 && window.mapkit) {
          setGeocodedEvents(newGeocodedEvents);

          // Calculate bounding box of all coordinates
          const coords = annotations.map(a => a.coordinate);
          const lats = coords.map(c => c.latitude);
          const lngs = coords.map(c => c.longitude);

          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);

          // Calculate center and span
          const centerLat = (minLat + maxLat) / 2;
          const centerLng = (minLng + maxLng) / 2;
          const latSpan = Math.max((maxLat - minLat) * 1.5, 0.1); // Add padding, min 0.1
          const lngSpan = Math.max((maxLng - minLng) * 1.5, 0.1);

          // Set the region to fit all markers
          const region = new window.mapkit.CoordinateRegion(
            new window.mapkit.Coordinate(centerLat, centerLng),
            new window.mapkit.CoordinateSpan(latSpan, lngSpan)
          );
          map.region = region;
          userRegionRef.current = region;
          setMapReady(true);
        } else if (completed === eventsToGeocode.length) {
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

  useEffect(() => {
    const updateMapColorScheme = (): void => {
      if (mapRef.current) {
        mapRef.current.colorScheme = getMapColorScheme();
      }
    };

    updateMapColorScheme();

    const observer = new MutationObserver(updateMapColorScheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedEvent) {
          onSelectEvent(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose, selectedEvent, onSelectEvent]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
    >
      {/* Full screen map container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-white dark:bg-[#0a0a0a]"
      >
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-10 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-gray-200 dark:border-[#262626]">
          <div className="flex items-center justify-between px-6 py-4">
            <div>
              <h2 className="text-title-3 text-gray-900 dark:text-zinc-100">Past Events Map</h2>
              <p className="text-callout text-gray-500 dark:text-zinc-400">{events.length} locations</p>
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

        {/* Loading indicator */}
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-[#171717] z-5">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-pink-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-callout text-gray-500 dark:text-zinc-400">Loading map...</p>
            </div>
          </div>
        )}

        {/* Map - hidden until ready */}
        <div
          ref={mapContainerRef}
          className="w-full h-full transition-opacity duration-300"
          style={{ opacity: mapReady ? 1 : 0 }}
        />

        {/* Event Detail Card */}
        {selectedEvent && (
          <div className="absolute bottom-6 left-6 right-6 md:left-auto md:right-6 md:w-96 bg-white dark:bg-[#0a0a0a] rounded-2xl shadow-2xl border border-gray-200 dark:border-[#262626] overflow-hidden animate-slideUp">
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-title-3 text-gray-900 dark:text-zinc-100">{selectedEvent.name}</h3>
                  <p className="text-callout text-gray-500 dark:text-zinc-400">{formatDate(selectedEvent.eventDate)}</p>
                </div>
                <button
                  onClick={() => onSelectEvent(null)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-[#1f1f1f] rounded-full transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-400 dark:text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {selectedEvent.location && (
                <p className="text-callout text-gray-600 dark:text-zinc-400 mb-4 flex items-center gap-1">
                  <svg className="w-4 h-4 text-gray-400 dark:text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {selectedEvent.location}
                </p>
              )}

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-3 bg-gray-50 dark:bg-[#171717] rounded-xl">
                  <p className="text-caption uppercase tracking-wider text-gray-400 dark:text-zinc-500">Sold</p>
                  <p className="text-title-3-mono text-gray-900 dark:text-zinc-100">{selectedEvent.totalSold}</p>
                </div>
                <div className="text-center p-3 bg-pink-50 dark:bg-pink-950/40 rounded-xl">
                  <p className="text-caption uppercase tracking-wider text-pink-400 dark:text-pink-500">Revenue</p>
                  <p className="text-title-3-mono text-pink-600 dark:text-pink-400">{formatCurrency(selectedEvent.totalRevenue)}</p>
                </div>
                <div className="text-center p-3 bg-green-50 dark:bg-green-950/40 rounded-xl">
                  <p className="text-caption uppercase tracking-wider text-green-400 dark:text-green-500">Profit</p>
                  <p className="text-title-3-mono text-green-600 dark:text-green-400">{formatCurrency(selectedEvent.netProfit)}</p>
                </div>
              </div>

              <a
                href={`/events/${selectedEvent.id}`}
                className="block w-full text-center py-2.5 bg-pink-500 text-white rounded-xl text-button hover:bg-pink-600 transition-colors"
              >
                View Full Details
              </a>
            </div>
          </div>
        )}
      </motion.div>

      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </motion.div>
  );
}

// Stat Card Component
function StatCard({ label, value, sublabel, highlight, numericValue, format }: { label: string; value: string; sublabel?: string; highlight?: boolean; numericValue?: number; format?: (n: number) => string }): React.JSX.Element {
  return (
    <div className={`p-4 rounded-2xl border ${highlight ? 'bg-pink-50 border-pink-100 dark:bg-pink-950/40 dark:border-pink-900/50' : 'bg-gray-50 border-gray-100 dark:bg-[#171717] dark:border-[#1f1f1f]'}`}>
      <p className="text-caption uppercase tracking-wider text-gray-400 dark:text-zinc-500">{label}</p>
      <p className={`text-title-1-mono mt-1 ${highlight ? 'text-pink-600 dark:text-pink-400' : 'text-gray-900 dark:text-zinc-100'}`}>
        {numericValue !== undefined && format ? <AnimatedNumber value={numericValue} format={format} /> : value}
      </p>
      {sublabel && <p className="text-callout text-gray-500 dark:text-zinc-400 mt-1">{sublabel}</p>}
    </div>
  );
}

// Sortable Header Component
function SortableHeader({
  label,
  column,
  currentColumn,
  direction,
  onSort,
  className = '',
}: {
  label: string;
  column: SortColumn;
  currentColumn: SortColumn;
  direction: 'asc' | 'desc';
  onSort: (column: SortColumn) => void;
  className?: string;
}): React.JSX.Element {
  const isActive = currentColumn === column;
  const isRight = className.includes('text-right');
  const isCenter = className.includes('text-center');

  return (
    <th
      className={`cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-[#171717] transition-colors ${className}`}
      onClick={() => onSort(column)}
    >
      <div className={`flex items-center gap-1 ${isRight ? 'justify-end' : isCenter ? 'justify-center' : ''}`}>
        <span>{label}</span>
        {isActive && (
          <svg
            className={`w-3 h-3 text-pink-500 dark:text-pink-400 transition-transform ${direction === 'desc' ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        )}
      </div>
    </th>
  );
}
