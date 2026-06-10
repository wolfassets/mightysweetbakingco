import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { ComponentType, ReactNode } from 'react';
import { DayPicker } from 'react-day-picker';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import 'react-day-picker/style.css';
import AppleMap from './AppleMap';

// Type for React-Quill component props
interface QuillEditorProps {
  theme: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  modules: QuillModules;
  formats: string[];
  placeholder: string;
}

interface QuillModules {
  toolbar: (string | { list: string })[][];
}

// Type for dynamically loaded Quill component
type QuillComponentType = ComponentType<QuillEditorProps>;

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
  cashCollected: number;
  venmoCollected: number;
  otherCollected: number;
  notes: string | null;
}

interface EventItem {
  id: number;
  eventId: number;
  flavorName: string;
  prepared: number;
  remaining: number;
  giveaway: number;
  sold: number;
  revenue: number;
  unitCost: number | null;
  cogs: number;
  profit: number;
  rateId: number | null;
}

interface Flavor {
  id: number;
  name: string;
  unitPrice: number;
  unitCost: number | null;
  isActive: boolean;
}

interface FlavorPrice {
  id: number;
  flavorId: number;
  tierName: string;
  price: number;
  cost: number | null;
  isActive: boolean;
}

// API response type for fetching a single event with its items
interface EventWithItems extends Event {
  items: EventItem[];
}

// Updatable fields on Event
type EventField = keyof Event;

// Updatable fields on EventItem
type EventItemField = keyof EventItem;

// Sort column type shared between EventDetail and SortableHeader
type SortColumn = 'id' | 'flavorName' | 'prepared' | 'remaining' | 'giveaway' | 'sold' | 'revenue' | 'unitCost' | 'cogs' | 'profit';

interface EventDetailProps {
  eventId?: number;
}

export default function EventDetail({ eventId: propEventId }: EventDetailProps) {
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [items, setItems] = useState<EventItem[]>([]);
  const [availableFlavors, setAvailableFlavors] = useState<Flavor[]>([]);
  const [flavorPrices, setFlavorPrices] = useState<FlavorPrice[]>([]);
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Get event ID from prop or URL path
  const eventId = propEventId || (typeof window !== 'undefined' ? parseInt(window.location.pathname.split('/').pop() || '0') : 0);

  // Fetch data on mount - events API returns items with event when fetching by ID
  useEffect(() => {
    if (!eventId) return;

    Promise.all([
      fetch(`/api/events?id=${eventId}`).then(res => res.json() as Promise<EventWithItems>),
      fetch('/api/flavors?includeArchived=true').then(res => res.json() as Promise<Flavor[]>),
      fetch('/api/flavor-prices?includeArchived=true').then(res => res.json() as Promise<FlavorPrice[]>),
      fetch('/api/events').then(res => res.json() as Promise<Event[]>),
    ])
      .then(([eventData, flavorsData, pricesData, allEventsData]) => {
        const { items: eventItems, ...eventOnly } = eventData;
        setEvent(eventOnly);
        setItems(eventItems || []);
        setAvailableFlavors(flavorsData);
        setFlavorPrices(pricesData);
        setAllEvents(allEventsData || []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [eventId]);
  const [editingDate, setEditingDate] = useState(false);
  const [showAddFlavor, setShowAddFlavor] = useState(false);
  const [selectedFlavorId, setSelectedFlavorId] = useState<number | ''>('');
  const [selectedRateId, setSelectedRateId] = useState<number | ''>('');
  const [newItemPrepared, setNewItemPrepared] = useState(0);
  // Sorting state
  const [sortColumn, setSortColumn] = useState<SortColumn>('id');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

  const pastEvents = event
    ? allEvents
        .filter(e => normalizeName(e.name) === normalizeName(event.name) && e.id !== event.id)
        .sort((a, b) => {
          const aDate = new Date(a.eventDate + 'T00:00:00').getTime();
          const bDate = new Date(b.eventDate + 'T00:00:00').getTime();
          return bDate - aDate;
        })
    : [];

  const handleArchive = async () => {
    if (!event) return;
    try {
      const response = await fetch('/api/events', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: event.id, hard: false }),
      });
      if (!response.ok) throw new Error('Failed to archive');
      window.location.href = '/events';
    } catch {
      showToast('Failed to archive event', 'error');
    }
  };

  // Get flavor ID for an item
  const getFlavorId = (flavorName: string): number => {
    const matchingFlavor = availableFlavors.find(f => f.name === flavorName);
    return matchingFlavor ? matchingFlavor.id : 9999; // Sort items without matching flavor to end
  };

  // Sorting function
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Sort items
  const sortedItems = [...items].sort((a, b) => {
    let aVal: number | string;
    let bVal: number | string;

    if (sortColumn === 'id') {
      aVal = getFlavorId(a.flavorName);
      bVal = getFlavorId(b.flavorName);
    } else if (sortColumn === 'flavorName') {
      aVal = a.flavorName.toLowerCase();
      bVal = b.flavorName.toLowerCase();
    } else {
      aVal = a[sortColumn] ?? 0;
      bVal = b[sortColumn] ?? 0;
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const resetAddFlavorForm = () => {
    setSelectedFlavorId('');
    setSelectedRateId('');
    setNewItemPrepared(0);
  };

  const handleAddFlavor = async () => {
    if (!selectedFlavorId) {
      showToast('Please select a flavor', 'error');
      return;
    }

    const selectedFlavor = availableFlavors.find(f => f.id === selectedFlavorId);
    if (!selectedFlavor) {
      showToast('Flavor not found', 'error');
      return;
    }

    if (!selectedRateId) {
      showToast('Please select a rate', 'error');
      return;
    }

    const selectedRate = flavorPrices.find(p => p.id === selectedRateId);
    if (!selectedRate) {
      showToast('Rate not found', 'error');
      return;
    }

    const flavorName = selectedFlavor.name;
    const unitCost = selectedRate.cost;

    if (!event) return;

    try {
      const response = await fetch('/api/event-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          flavorName,
          prepared: newItemPrepared || 0,
          remaining: newItemPrepared || 0,
          giveaway: 0,
          sold: 0,
          revenue: 0,
          unitCost,
          cogs: 0,
          profit: 0,
          rateId: selectedRate.id,
        }),
      });

      if (!response.ok) throw new Error('Failed to add');

      const newItem = await response.json() as EventItem;
      setItems(prev => [...prev, newItem]);
      setShowAddFlavor(false);
      resetAddFlavorForm();
      showToast('Flavor added');

      // Refresh event totals
      const eventResponse = await fetch(`/api/events?id=${event.id}`);
      if (eventResponse.ok) {
        const updatedEvent = await eventResponse.json() as Event;
        setEvent(updatedEvent);
      }
    } catch {
      showToast('Failed to add flavor', 'error');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const formatDateFull = (dateString: string): ReactNode => {
    const date = new Date(dateString + 'T00:00:00');
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const rest = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    return (
      <>
        <span className="text-callout-mono text-gray-400 dark:text-zinc-500 mr-3">{weekday}</span>
        <span>{rest}</span>
      </>
    );
  };

  const formatDetailDate = (dateString: string): ReactNode => {
    const date = new Date(dateString + 'T00:00:00');
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const rest = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-callout-mono text-gray-400 dark:text-zinc-500">{weekday}</span>
        <span className="text-callout">{rest}</span>
      </span>
    );
  };

  const updateEventDate = async (newDate: Date | null) => {
    if (!newDate || !event) return;

    const dateStr = newDate.toISOString().split('T')[0];

    // Optimistic update
    setEvent((prev) => prev ? { ...prev, eventDate: dateStr } : null);
    setEditingDate(false);

    try {
      const response = await fetch('/api/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: event.id, eventDate: dateStr }),
      });

      if (!response.ok) throw new Error('Failed to update');
      showToast('Date updated');
    } catch {
      showToast('Failed to update date', 'error');
      // Refetch event on error
      fetch(`/api/events?id=${eventId}`).then(res => res.json() as Promise<Event>).then(setEvent);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const updateEvent = async (field: EventField, value: string | number) => {
    if (!event) return;
    // Optimistic update
    setEvent((prev) => prev ? { ...prev, [field]: value } : null);

    try {
      const response = await fetch('/api/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: event.id, [field]: value }),
      });

      if (!response.ok) throw new Error('Failed to update');
      showToast('Saved');
    } catch {
      showToast('Failed to save', 'error');
      // Refetch event on error
      fetch(`/api/events?id=${eventId}`).then(res => res.json() as Promise<Event>).then(setEvent);
    }
  };

  const updateItem = async (itemId: number, field: EventItemField, value: number | null) => {
    const item = items.find(i => i.id === itemId);
    if (!item || !event) return;

    // Calculate derived values
    let updates: Partial<EventItem> = { [field]: value };

    // Get the values we need for calculations
    const prepared = field === 'prepared' ? (value as number) : item.prepared;
    const sold = field === 'sold' ? (value as number) : item.sold;
    const giveaway = field === 'giveaway' ? (value as number) : item.giveaway;
    const unitCost = field === 'unitCost' ? (value as number | null) : item.unitCost;

    // Calculate remaining = prepared - sold - giveaway
    const remaining = Math.max(0, prepared - sold - giveaway);
    updates.remaining = remaining;

    // Calculate revenue = sold * unitPrice (from flavor)
    const flavor = availableFlavors.find(f => f.name === item.flavorName);
    const unitPrice = flavor?.unitPrice || 5; // Default to $5 if not found
    const revenue = sold * unitPrice;
    updates.revenue = revenue;

    // Calculate COGS = sold * unitCost
    const cogs = unitCost ? sold * unitCost : 0;
    updates.cogs = cogs;

    // Calculate profit = revenue - cogs
    updates.profit = revenue - cogs;

    // Optimistic update
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...updates } : i));

    try {
      const response = await fetch('/api/event-items', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, eventId: event.id, ...updates }),
      });

      if (!response.ok) throw new Error('Failed to update');

      // Refresh event totals
      const eventResponse = await fetch(`/api/events?id=${event.id}`);
      if (eventResponse.ok) {
        const updatedEvent = await eventResponse.json() as Event;
        setEvent(updatedEvent);
      }
    } catch {
      showToast('Failed to save', 'error');
      // Refetch items on error
      fetch(`/api/event-items?eventId=${eventId}`).then(res => res.json() as Promise<EventItem[]>).then(setItems);
    }
  };

  const getRatesForFlavor = (flavorName: string): FlavorPrice[] => {
    const flavor = availableFlavors.find(f => f.name === flavorName);
    if (!flavor) return [];
    return flavorPrices.filter(p => p.flavorId === flavor.id);
  };

  const getSelectableRatesForItem = (item: EventItem): FlavorPrice[] => {
    return getRatesForFlavor(item.flavorName).filter(rate => rate.isActive || rate.id === item.rateId);
  };

  const getMatchingRate = (item: EventItem): string => {
    if (item.rateId) {
      const match = flavorPrices.find(p => p.id === item.rateId);
      if (match) return match.tierName;
    }
    // Fallback: match by cost
    const rates = getRatesForFlavor(item.flavorName);
    const match = rates.find(r => r.cost === item.unitCost);
    return match ? match.tierName : 'Custom';
  };

  const deleteItem = async (itemId: number) => {
    if (!event) return;
    // Optimistic update
    setItems(prev => prev.filter(i => i.id !== itemId));

    try {
      const response = await fetch('/api/event-items', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, eventId: event.id }),
      });

      if (!response.ok) throw new Error('Failed to delete');

      showToast('Item deleted');

      // Refresh event totals
      const eventResponse = await fetch(`/api/events?id=${event.id}`);
      if (eventResponse.ok) {
        const updatedEvent = await eventResponse.json() as Event;
        setEvent(updatedEvent);
      }
    } catch {
      showToast('Failed to delete', 'error');
      // Refetch items on error
      fetch(`/api/event-items?eventId=${eventId}`).then(res => res.json() as Promise<EventItem[]>).then(setItems);
    }
  };

  // Loading state
  if (loading || !event) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-3 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }


  return (
    <div className="space-y-6">
      {/* Top Bar: Back link | Title | Buttons */}
      <div className="flex items-center gap-6">
        <a
          href="/events"
          className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 dark:bg-zinc-100 px-4 py-2 text-button text-white dark:text-zinc-900 transition-colors hover:bg-gray-800 dark:hover:bg-zinc-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Events
        </a>
        <div className="flex-1 min-w-0 flex justify-center">
          <EditableText
            value={event.name}
            onSave={(value) => updateEvent('name', value)}
            className="text-title-2 text-gray-900 dark:text-zinc-100 hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
          />
        </div>
        <div className="shrink-0 w-[350px] grid grid-cols-1 gap-2">
          <HoldArchiveButton onArchive={handleArchive} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-9 xl:grid-cols-[1fr_350px] xl:items-start">
        <div className="space-y-2">

          <div className="px-5 pt-0 pb-2 -mt-2">
            <h3 className="text-title-3 text-gray-900 dark:text-zinc-100">Flavors</h3>
            <p className="text-callout text-gray-900 dark:text-zinc-100 mt-1">
              {items.length === 0
                ? 'No flavors added to this event yet.'
                : `${items.length} flavor${items.length === 1 ? '' : 's'} on this event.`}
            </p>
          </div>

          {/* Items table */}
          <div className="px-5 pb-4 w-full">
            {items.length === 0 ? (
              <div className="text-center py-12 text-gray-400 dark:text-zinc-500">
                <div>No flavors added to this event yet.</div>
                <button
                  onClick={() => setShowAddFlavor(true)}
                  className="mt-4 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-button text-pink-600 transition-colors hover:bg-pink-50 hover:text-pink-700 dark:text-pink-400 dark:hover:bg-pink-950/30 dark:hover:text-pink-300"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Flavor
                </button>
              </div>
            ) : (
              <table className="data-table">
                <colgroup>
                  <col style={{ width: 24 }} />
                  <col style={{ width: 260 }} />
                  <col />
                  <col style={{ width: 260 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 96 }} />
                  <col style={{ width: 96 }} />
                  <col style={{ width: 96 }} />
                  <col style={{ width: 96 }} />
                  <col style={{ width: 100 }} />
                </colgroup>
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#171717] [&>th:first-child]:shadow-[-20px_0_0_#f9fafb] dark:[&>th:first-child]:shadow-[-20px_0_0_#171717] [&>th:last-child]:shadow-[20px_0_0_#f9fafb] dark:[&>th:last-child]:shadow-[20px_0_0_#171717]">
                    <th className="w-6 text-center" style={{ paddingLeft: 0, paddingRight: 0 }}>#</th>
                    <th style={{ width: 260 }}>Flavor</th>
                    <th style={{ width: '100%' }}></th>
                    <th className="text-center" style={{ width: 260 }}>Rate</th>
                    <SortableHeader column="prepared" label="Prepared" currentSort={sortColumn} direction={sortDirection} onSort={handleSort} className="text-center" />
                    <SortableHeader column="remaining" label="Unsold" currentSort={sortColumn} direction={sortDirection} onSort={handleSort} className="text-center" />
                    <SortableHeader column="revenue" label="Revenue" currentSort={sortColumn} direction={sortDirection} onSort={handleSort} className="text-right" />
                    <SortableHeader column="cogs" label="COGS" currentSort={sortColumn} direction={sortDirection} onSort={handleSort} className="text-right" />
                    <SortableHeader column="profit" label="Profit" currentSort={sortColumn} direction={sortDirection} onSort={handleSort} className="text-right" />
                    <th className="text-center" style={{ width: 100 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                  {sortedItems.map((item) => (
                    <motion.tr
                      key={item.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                      className="group"
                    >
                      <td>
                        <span className="py-3 min-h-[44px] flex items-center justify-center text-pink-600 dark:text-pink-400 text-callout">
                          {getFlavorId(item.flavorName)}
                        </span>
                      </td>
                      <td>
                        <span className="px-4 py-3 min-h-[44px] flex items-center text-callout text-gray-900 dark:text-zinc-100 whitespace-nowrap">
                          {item.flavorName}
                        </span>
                      </td>
                      <td></td>
                      <td>
                        <div className="px-4 py-3 min-h-[44px] flex items-center justify-start">
                          <select
                            value={getMatchingRate(item)}
                            onChange={(e) => {
                              const rateName = e.target.value;
                              const rates = getRatesForFlavor(item.flavorName);
                              const rate = rates.find(r => r.tierName === rateName);
                              if (rate) {
                                const newCost = rate.cost ?? 0;
                                const newRevenue = item.sold * rate.price;
                                const newCogs = item.sold * newCost;
                                const allUpdates = {
                                  unitCost: newCost,
                                  rateId: rate.id,
                                  revenue: newRevenue,
                                  cogs: newCogs,
                                  profit: newRevenue - newCogs,
                                };
                                setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...allUpdates } : i));
                                fetch('/api/event-items', {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ id: item.id, eventId: event.id, ...allUpdates }),
                                }).then(async () => {
                                  const res = await fetch(`/api/events?id=${event.id}`);
                                  if (res.ok) setEvent(await res.json() as Event);
                                });
                              }
                            }}
                            className="w-56 text-callout border border-gray-200 dark:border-[#262626] rounded-lg px-2 py-1 bg-white dark:bg-[#0a0a0a] dark:text-zinc-300 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 cursor-pointer"
                          >
                            {getSelectableRatesForItem(item).map(rate => (
                              <option key={rate.id} value={rate.tierName}>
                                {rate.tierName} — ${rate.price.toFixed(2)}{rate.cost != null ? ` / $${rate.cost.toFixed(2)} cost` : ''}
                              </option>
                            ))}
                            {getMatchingRate(item) === 'Custom' && <option value="Custom">Custom</option>}
                          </select>
                        </div>
                      </td>
                      <td>
                        <EditableNumber
                          value={item.prepared}
                          onSave={(val) => updateItem(item.id, 'prepared', val)}
                          className="w-full px-4 py-3 min-h-[44px] flex items-center justify-center text-gray-600 dark:text-zinc-400 text-callout text-center"
                          showPencil
                        />
                      </td>
                      <td>
                        <span className="px-4 py-3 min-h-[44px] flex items-center justify-center text-gray-600 dark:text-zinc-400 text-callout text-center">
                          {item.remaining}
                        </span>
                      </td>
                      <td>
                        <span className="px-4 py-3 min-h-[44px] flex items-center justify-end text-gray-600 dark:text-zinc-400 text-callout text-right">
                          {item.revenue > 0 ? formatCurrency(item.revenue) : '—'}
                        </span>
                      </td>
                      <td>
                        <span className="px-4 py-3 min-h-[44px] flex items-center justify-end text-callout text-right text-gray-600 dark:text-zinc-400">
                          {item.cogs > 0 ? formatCurrency(item.cogs) : '—'}
                        </span>
                      </td>
                      <td>
                        <span className="px-4 py-3 min-h-[44px] flex items-center justify-end text-right">
                          {item.profit > 0 ? (
                            <span className="text-green-600 dark:text-green-400 text-callout">{formatCurrency(item.profit)}</span>
                          ) : item.profit < 0 ? (
                            <span className="text-red-500 dark:text-red-400 text-callout">{formatCurrency(item.profit)}</span>
                          ) : (
                            '—'
                          )}
                        </span>
                      </td>
                      <td>
                        <div className="px-4 py-3 min-h-[44px] flex items-center justify-center">
                          <HoldDeleteButton onDelete={() => deleteItem(item.id)} />
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                  </AnimatePresence>

                  {/* Totals Row */}
                  {items.length > 0 && (
                  <tr className="totals-row border-t-2 border-gray-200 dark:border-[#262626] bg-gray-50 dark:bg-[#171717] [&>td:first-child]:shadow-[-20px_0_0_#f9fafb] dark:[&>td:first-child]:shadow-[-20px_0_0_#171717] [&>td:last-child]:shadow-[20px_0_0_#f9fafb] dark:[&>td:last-child]:shadow-[20px_0_0_#171717]">
                    <td colSpan={2}>
                      <span className="py-3 min-h-[44px] flex items-center text-headline text-gray-900 dark:text-zinc-100">Total</span>
                    </td>
                    <td></td>
                    <td></td>
                    <td>
                      <span className="px-4 py-3 min-h-[44px] flex items-center justify-center text-gray-900 dark:text-zinc-100 text-callout text-center">
                        {items.reduce((sum, i) => sum + i.prepared, 0)}
                      </span>
                    </td>
                    <td>
                      <span className="px-4 py-3 min-h-[44px] flex items-center justify-center text-gray-900 dark:text-zinc-100 text-callout text-center">
                        {items.reduce((sum, i) => sum + i.remaining, 0)}
                      </span>
                    </td>
                    <td>
                      <span className="px-4 py-3 min-h-[44px] flex items-center justify-end text-callout text-right text-gray-900 dark:text-zinc-100">
                        {formatCurrency(items.reduce((sum, i) => sum + i.revenue, 0))}
                      </span>
                    </td>
                    <td>
                      <span className="px-4 py-3 min-h-[44px] flex items-center justify-end text-callout text-right text-gray-900 dark:text-zinc-100">
                        {formatCurrency(items.reduce((sum, i) => sum + i.cogs, 0))}
                      </span>
                    </td>
                    <td>
                      <span className="px-4 py-3 min-h-[44px] flex items-center justify-end text-right">
                        {(() => {
                          const totalProfit = items.reduce((sum, i) => sum + i.profit, 0);
                          return totalProfit >= 0 ? (
                            <span className="text-green-600 dark:text-green-400 text-callout">{formatCurrency(totalProfit)}</span>
                          ) : (
                            <span className="text-red-500 dark:text-red-400 text-callout">{formatCurrency(totalProfit)}</span>
                          );
                        })()}
                      </span>
                    </td>
                    <td>
                      <div className="px-4 py-3 min-h-[44px] flex items-center justify-center">
                        <button
                          onClick={() => setShowAddFlavor(true)}
                          className="relative overflow-hidden rounded-full w-24 py-1 text-button transition-all select-none text-center whitespace-nowrap bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 hover:text-green-700 dark:bg-green-950/40 dark:text-green-400 dark:border-green-900/50 dark:hover:bg-green-950/60 dark:hover:text-green-300"
                        >
                          Add Flavor
                        </button>
                      </div>
                    </td>
                  </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Past Events */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
            className="rounded-3xl"
          >
            <div className="px-5 pt-6 pb-2">
              <h3 className="text-title-3 text-gray-900 dark:text-zinc-100">Past Events</h3>
              <p className="text-callout text-gray-900 dark:text-zinc-100 mt-1">
                {pastEvents.length === 0
                  ? `No prior events for ${event.name}.`
                  : `${pastEvents.length} past event${pastEvents.length === 1 ? '' : 's'} for ${event.name}.`}
              </p>
            </div>

            {pastEvents.length > 0 && (
              <div className="px-5 pb-4">
                <table className="data-table">
                  <colgroup>
                    <col style={{ width: 24 }} />
                    <col style={{ width: 260 }} />
                    <col />
                    <col style={{ width: 80 }} />
                    <col style={{ width: 96 }} />
                    <col style={{ width: 96 }} />
                    <col style={{ width: 96 }} />
                    <col style={{ width: 96 }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-gray-50 dark:bg-[#171717] [&>th:first-child]:shadow-[-20px_0_0_#f9fafb] dark:[&>th:first-child]:shadow-[-20px_0_0_#171717] [&>th:last-child]:shadow-[20px_0_0_#f9fafb] dark:[&>th:last-child]:shadow-[20px_0_0_#171717]">
                      <th className="w-6 text-center" style={{ paddingLeft: 0, paddingRight: 0 }}>#</th>
                      <th style={{ width: 260 }}>Date</th>
                      <th style={{ width: '100%' }}></th>
                      <th className="text-center" style={{ width: 80 }}>Prepared</th>
                      <th className="text-center" style={{ width: 96 }}>Unsold</th>
                      <th className="text-right" style={{ width: 96 }}>Revenue</th>
                      <th className="text-right" style={{ width: 96 }}>COGS</th>
                      <th className="text-right" style={{ width: 96 }}>Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence initial={false}>
                    {pastEvents.map((e) => {
                      const remaining = Math.max(0, e.totalPrepared - e.totalSold - (e.totalGiveaway || 0));
                      return (
                        <motion.tr
                          key={e.id}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                          className="group cursor-pointer hover:bg-[#fafafa] dark:hover:bg-[#171717] transition-colors"
                          onClick={() => router.push(`/events/${e.id}`)}
                        >
                          <td>
                            <span className="py-3 min-h-[44px] flex items-center justify-center text-pink-600 dark:text-pink-400 text-callout">
                              {e.id}
                            </span>
                          </td>
                          <td>
                            <span className="px-4 py-3 min-h-[44px] flex items-center text-gray-600 dark:text-zinc-400 text-callout whitespace-nowrap">
                              {formatDateFull(e.eventDate)}
                            </span>
                          </td>
                          <td></td>
                          <td>
                            <span className="px-4 py-3 min-h-[44px] flex items-center justify-center text-gray-600 dark:text-zinc-400 text-callout">
                              {e.totalPrepared}
                            </span>
                          </td>
                          <td>
                            <span className="px-4 py-3 min-h-[44px] flex items-center justify-center text-gray-600 dark:text-zinc-400 text-callout">
                              {remaining}
                            </span>
                          </td>
                          <td>
                            <span className="px-4 py-3 min-h-[44px] flex items-center justify-end whitespace-nowrap">
                              {e.totalRevenue > 0 ? (
                                <span className="text-gray-900 dark:text-zinc-100 text-callout">{formatCurrency(e.totalRevenue)}</span>
                              ) : (
                                <span className="text-gray-300 dark:text-zinc-700 text-callout">--</span>
                              )}
                            </span>
                          </td>
                          <td>
                            <span className="px-4 py-3 min-h-[44px] flex items-center justify-end whitespace-nowrap">
                              {e.totalCost > 0 ? (
                                <span className="text-gray-600 dark:text-zinc-400 text-callout">{formatCurrency(e.totalCost)}</span>
                              ) : (
                                <span className="text-gray-300 dark:text-zinc-700 text-callout">--</span>
                              )}
                            </span>
                          </td>
                          <td>
                            <span className="px-4 py-3 min-h-[44px] flex items-center justify-end whitespace-nowrap">
                              {e.netProfit > 0 ? (
                                <span className="text-green-600 dark:text-green-400 text-callout">{formatCurrency(e.netProfit)}</span>
                              ) : e.netProfit < 0 ? (
                                <span className="text-red-500 dark:text-red-400 text-callout">{formatCurrency(e.netProfit)}</span>
                              ) : (
                                <span className="text-gray-300 dark:text-zinc-700 text-callout">--</span>
                              )}
                            </span>
                          </td>
                        </motion.tr>
                      );
                    })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        </div>

        {/* Right column: 350px */}
        <div className="space-y-4">
          <div className="relative h-[350px] w-[350px] max-w-full overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#262626] dark:bg-[#0a0a0a]">
            {event.location ? (
              <AppleMap
                key={`event-map-${event.id}-${event.location}`}
                location={event.location}
                markerTitle={event.name}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 dark:text-zinc-500">
                No location set
              </div>
            )}
          </div>
          <div className="px-1 pt-1 pb-0">
            <h3 className="text-headline text-gray-900 dark:text-zinc-100 mb-0.5">Location</h3>
            <EditableAddress
              value={event.location || ''}
              onSave={(value) => updateEvent('location', value)}
              className="text-callout text-gray-900 dark:text-zinc-100 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-gray-50 dark:hover:bg-[#171717] px-2 -ml-2 rounded transition-colors"
            />
          </div>
          <div className="px-1 pt-1">
            <h3 className="text-headline text-gray-900 dark:text-zinc-100 mb-3">Event Info & Payments</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 items-start">
              <div>
                <div className="space-y-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-headline text-gray-500 dark:text-zinc-400">Date</span>
                    <div className="relative">
                      <button
                        onClick={() => setEditingDate(!editingDate)}
                        className="text-headline text-gray-900 dark:text-zinc-100 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-gray-50 dark:hover:bg-[#171717] px-2 -ml-2 rounded transition-colors group/date-side flex items-center gap-1.5 whitespace-nowrap"
                      >
                        {formatDetailDate(event.eventDate)}
                        <svg className="text-gray-300 dark:text-zinc-700 group-hover/date-side:text-gray-400 dark:group-hover/date-side:text-zinc-500 shrink-0 transition-colors" style={{ width: '1em', height: '1em' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <AnimatePresence>
                        {editingDate && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setEditingDate(false)} />
                            <motion.div
                              initial={{ opacity: 0, y: -8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -8 }}
                              transition={{ duration: 0.15 }}
                              className="absolute left-0 top-full mt-2 z-50 bg-white dark:bg-[#0a0a0a] rounded-2xl shadow-2xl border border-gray-100 dark:border-[#1f1f1f] p-4"
                            >
                              <DayPicker
                                mode="single"
                                selected={new Date(event.eventDate + 'T00:00:00')}
                                defaultMonth={new Date(event.eventDate + 'T00:00:00')}
                                onSelect={(date) => date && updateEventDate(date)}
                                className="!font-sans"
                              />
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-headline text-gray-500 dark:text-zinc-400">Fee</span>
                    <EditableNumber
                      value={event.eventCost}
                      onSave={(value) => updateEvent('eventCost', value)}
                      className="text-callout text-gray-900 dark:text-zinc-100 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-gray-50 dark:hover:bg-[#171717] px-2 -ml-2 rounded transition-colors"
                      isCurrency
                      showPencil
                    />
                  </div>
                </div>
              </div>
              <div>
                <div className="space-y-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-headline text-gray-500 dark:text-zinc-400">Cash</span>
                    <EditableText
                      value={event.cashCollected ? formatCurrency(event.cashCollected) : '$0.00'}
                      onSave={(value) => updateEvent('cashCollected', parseFloat(value.replace(/[$,]/g, '')) || 0)}
                      className="text-callout text-gray-900 dark:text-zinc-100 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-gray-50 dark:hover:bg-[#171717] px-2 -ml-2 rounded transition-colors"
                      allowEmpty
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-headline text-gray-500 dark:text-zinc-400">Venmo</span>
                    <EditableText
                      value={event.venmoCollected ? formatCurrency(event.venmoCollected) : '$0.00'}
                      onSave={(value) => updateEvent('venmoCollected', parseFloat(value.replace(/[$,]/g, '')) || 0)}
                      className="text-callout text-gray-900 dark:text-zinc-100 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-gray-50 dark:hover:bg-[#171717] px-2 -ml-2 rounded transition-colors"
                      allowEmpty
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-headline text-gray-500 dark:text-zinc-400">Other</span>
                    <EditableText
                      value={event.otherCollected ? formatCurrency(event.otherCollected) : '$0.00'}
                      onSave={(value) => updateEvent('otherCollected', parseFloat(value.replace(/[$,]/g, '')) || 0)}
                      className="text-callout text-gray-900 dark:text-zinc-100 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-gray-50 dark:hover:bg-[#171717] px-2 -ml-2 rounded transition-colors"
                      allowEmpty
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-headline text-gray-500 dark:text-zinc-400">Total</span>
                    <span className="text-callout px-2 -ml-2 text-green-600 dark:text-green-400 flex items-center gap-1.5 whitespace-nowrap">
                      <AnimatedNumber
                        value={(event.cashCollected || 0) + (event.venmoCollected || 0) + (event.otherCollected || 0)}
                        format={formatCurrency}
                      />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="px-1 py-5 delivery-detail-notes-editor">
            <NotesEditor
              key="event-notes"
              content={event.notes || ''}
              onSave={(content) => updateEvent('notes', content)}
            />
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}

      {/* Add Flavor Modal */}
      <AnimatePresence>
      {showAddFlavor && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => { setShowAddFlavor(false); resetAddFlavorForm(); }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="bg-white dark:bg-[#0a0a0a] dark:border dark:border-[#262626] rounded-2xl shadow-2xl w-full max-w-md p-6 pointer-events-auto" onClick={e => e.stopPropagation()}>
              <h3 className="text-title-3 text-gray-900 dark:text-zinc-100 mb-4">Add Flavor to Event</h3>

              <div className="mb-4">
                <label className="block text-button text-gray-700 dark:text-zinc-300 mb-1">Flavor</label>
                <select
                  value={selectedFlavorId}
                  onChange={(e) => {
                    const fId = e.target.value ? parseInt(e.target.value) : '';
                    setSelectedFlavorId(fId);
                    if (fId) {
                      const rates = flavorPrices.filter(p => p.flavorId === fId && p.isActive);
                      setSelectedRateId(rates.length > 0 ? rates[0].id : '');
                    } else {
                      setSelectedRateId('');
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-[#3f3f3f] dark:bg-[#0a0a0a] dark:text-zinc-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                >
                  <option value="">Choose a flavor...</option>
                  {availableFlavors.filter(f => f.isActive).map(flavor => (
                    <option key={flavor.id} value={flavor.id}>
                      {flavor.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedFlavorId && (
                <div className="mb-4">
                  <label className="block text-button text-gray-700 dark:text-zinc-300 mb-1">Rate</label>
                  <select
                    value={selectedRateId}
                    onChange={(e) => setSelectedRateId(e.target.value ? parseInt(e.target.value) : '')}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-[#3f3f3f] dark:bg-[#0a0a0a] dark:text-zinc-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  >
                    <option value="">Choose a rate...</option>
                    {flavorPrices.filter(p => p.flavorId === selectedFlavorId && p.isActive).map(rate => (
                      <option key={rate.id} value={rate.id}>
                        {rate.tierName} — ${rate.price.toFixed(2)}{rate.cost != null ? ` / $${rate.cost.toFixed(2)} cost` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mb-6">
                <label className="block text-button text-gray-700 dark:text-zinc-300 mb-1">Prepared Qty</label>
                <input
                  type="number"
                  value={newItemPrepared}
                  onChange={(e) => setNewItemPrepared(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-[#3f3f3f] dark:bg-[#0a0a0a] dark:text-zinc-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowAddFlavor(false); resetAddFlavorForm(); }}
                  className="flex-1 px-4 py-2 text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-[#1f1f1f] rounded-lg text-button transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddFlavor}
                  className="flex-1 px-4 py-2 bg-pink-500 text-white rounded-lg text-button hover:bg-pink-600 transition-colors"
                >
                  Add Flavor
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
      </AnimatePresence>
    </div>
  );
}

// Animated Number — smoothly tweens to new value
function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const mv = useMotionValue(value);
  const display = useTransform(mv, (v) => format(v));
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] });
    return controls.stop;
  }, [value, mv]);
  return <motion.span>{display}</motion.span>;
}

// Editable Text Component
function EditableText({ value, onSave, className, allowEmpty = false, multiline = false }: { value: string; onSave: (value: string) => void; className?: string; allowEmpty?: boolean; multiline?: boolean }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing) {
      if (multiline && textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select();
      } else if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }
  }, [isEditing, multiline]);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleSave = () => {
    if (editValue !== value) {
      if (allowEmpty || editValue.trim()) {
        onSave(editValue);
      } else {
        setEditValue(value);
      }
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    if (multiline) {
      return (
        <textarea
          ref={textareaRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          rows={3}
          className={`${className} bg-white dark:bg-[#0a0a0a] border-0 focus:ring-2 focus:ring-pink-500 rounded-lg px-2 py-1 w-full resize-none`}
        />
      );
    }
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`${className} bg-white dark:bg-[#0a0a0a] border-0 focus:ring-2 focus:ring-pink-500 rounded-lg px-2`}
      />
    );
  }

  return (
    <div onClick={() => setIsEditing(true)} className={`${className} cursor-text hover:bg-gray-50 dark:hover:bg-[#171717] rounded-lg px-2 -mx-2 whitespace-pre-wrap`}>
      {value}
    </div>
  );
}

// Editable Address Component (with zip-code mono styling)
function EditableAddress({ value, onSave, className }: { value: string; onSave: (value: string) => void; className?: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => { setEditValue(value); }, [value]);

  const handleSave = () => {
    if (editValue !== value) onSave(editValue);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          else if (e.key === 'Escape') { setEditValue(value); setIsEditing(false); }
        }}
        size={Math.max(editValue.length, 1)}
        className={`${className} bg-white dark:bg-[#0a0a0a] border-0 focus:ring-2 focus:ring-pink-500 rounded-lg px-2`}
      />
    );
  }

  const pencil = (
    <svg className="text-gray-300 dark:text-zinc-700 group-hover/addr:text-gray-400 dark:group-hover/addr:text-zinc-500 shrink-0 transition-colors" style={{ width: '1em', height: '1em' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );

  if (!value) {
    return (
      <div onClick={() => setIsEditing(true)} className={`${className} cursor-text group/addr inline-flex items-center gap-2`}>
        <span>Click to add address</span>
        {pencil}
      </div>
    );
  }

  const match = value.match(/^(.*?)(\d{5}(?:-\d{4})?)(\s*)$/);
  return (
    <div onClick={() => setIsEditing(true)} className={`${className} cursor-text group/addr inline-flex items-center gap-2`}>
      <span>
        {match ? (
          <>
            {match[1]}
            <span style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace' }}>{match[2]}</span>
          </>
        ) : value}
      </span>
      {pencil}
    </div>
  );
}

// Editable Number Component for table cells
function EditableNumber({ value, onSave, isCurrency = false, className, inline = false, showPencil = false }: { value: number; onSave: (value: number) => void; isCurrency?: boolean; className?: string; inline?: boolean; showPencil?: boolean }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value.toString());
  }, [value]);

  const handleSave = () => {
    const numValue = parseFloat(editValue) || 0;
    if (numValue !== value) {
      onSave(numValue);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value.toString());
      setIsEditing(false);
    }
  };

  const formatDisplay = (num: number) => {
    if (isCurrency) {
      return `$${num.toFixed(2)}`;
    }
    return num.toString();
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="number"
        step={isCurrency ? '0.01' : '1'}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={inline
          ? "w-16 text-right text-callout-mono bg-white dark:bg-[#0a0a0a] dark:text-zinc-100 border border-pink-300 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 rounded px-1 py-0.5"
          : "w-full text-center text-callout-mono bg-white dark:bg-[#0a0a0a] dark:text-zinc-100 border border-pink-300 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 rounded px-1 py-0.5"
        }
      />
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      className={`${className || "editable-cell text-callout-mono text-gray-600 dark:text-zinc-400 text-center justify-center cursor-text"} group/num inline-flex items-center gap-1.5`}
    >
      {(showPencil || inline) && (
        <svg className="text-gray-300 dark:text-zinc-700 group-hover/num:text-gray-400 dark:group-hover/num:text-zinc-500 shrink-0 transition-colors" style={{ width: '1em', height: '1em' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      )}
      {formatDisplay(value)}
    </span>
  );
}

// Rich Text Notes Editor Component using React-Quill
function NotesEditor({ content, onSave }: { content: string; onSave: (content: string) => void }) {
  const [value, setValue] = useState(content || '');
  const [QuillComponent, setQuillComponent] = useState<QuillComponentType | null>(null);
  const lastSavedContent = useRef(content);

  // Dynamically import React-Quill on client only
  useEffect(() => {
    let mounted = true;
    import('react-quill-new').then((mod) => {
      if (mounted) {
        // Import CSS
        import('react-quill-new/dist/quill.snow.css');
        setQuillComponent(() => mod.default as unknown as QuillComponentType);
      }
    });
    return () => { mounted = false; };
  }, []);

  // Sync external content changes
  useEffect(() => {
    if (content !== lastSavedContent.current) {
      setValue(content || '');
      lastSavedContent.current = content;
    }
  }, [content]);

  const handleChange = (newValue: string) => {
    setValue(newValue);
  };

  const handleBlur = () => {
    // Only save if content actually changed
    if (value !== lastSavedContent.current) {
      lastSavedContent.current = value;
      onSave(value);
    }
  };

  const modules: QuillModules = {
    toolbar: [
      ['bold', 'italic', 'underline'],
    ],
  };

  const formats: string[] = ['bold', 'italic', 'underline'];

  // Show placeholder while loading
  if (!QuillComponent) {
    return (
      <div className="notes-editor">
        <div className="border border-gray-200 dark:border-[#262626] rounded-xl bg-white dark:bg-[#0a0a0a] min-h-[160px] p-4 text-callout text-gray-400 dark:text-zinc-500">
          Loading editor...
        </div>
      </div>
    );
  }

  return (
    <div className="notes-editor">
      <QuillComponent
        theme="snow"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        modules={modules}
        formats={formats}
        placeholder="Add notes..."
      />
    </div>
  );
}

// Hold-to-Delete Button Component
function HoldDeleteButton({ onDelete }: { onDelete: () => void }) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const holdDuration = 800;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const startHold = useCallback(() => {
    setHolding(true);
    setReady(false);
    startTimeRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(elapsed / holdDuration, 1);
      setProgress(pct);
      if (pct >= 1) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setReady(true);
      }
    }, 16);
  }, [holdDuration]);

  const releaseHold = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    if (ready) { onDelete(); }
    setHolding(false);
    setProgress(0);
    setReady(false);
  }, [ready, onDelete]);

  const cancelHold = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setHolding(false);
    setProgress(0);
    setReady(false);
  }, []);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return (
    <button
      onMouseDown={startHold}
      onMouseUp={releaseHold}
      onMouseLeave={cancelHold}
      onTouchStart={startHold}
      onTouchEnd={releaseHold}
      className="relative overflow-hidden rounded-full w-16 py-1 text-button-sm transition-all select-none text-center"
      style={{
        background: holding
          ? `linear-gradient(90deg, rgba(239,68,68,${0.3 + progress * 0.7}) ${progress * 100}%, #fef2f2 ${progress * 100}%)`
          : '#fef2f2',
        color: progress > 0.5 ? 'white' : '#ef4444',
        border: `1px solid ${progress > 0 ? `rgba(239,68,68,${0.3 + progress * 0.7})` : '#fecaca'}`,
      }}
      title="Hold to delete"
    >
      {progress > 0 ? (progress >= 0.8 ? 'Release' : 'Hold...') : 'Delete'}
    </button>
  );
}

// Hold-to-Archive Button Component
function HoldArchiveButton({ onArchive }: { onArchive: () => void }) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const holdDuration = 1000;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const startHold = useCallback(() => {
    setHolding(true);
    setReady(false);
    startTimeRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(elapsed / holdDuration, 1);
      setProgress(pct);
      if (pct >= 1) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setReady(true);
      }
    }, 16);
  }, [holdDuration]);

  const releaseHold = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    if (ready) onArchive();
    setHolding(false);
    setProgress(0);
    setReady(false);
  }, [ready, onArchive]);

  const cancelHold = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setHolding(false);
    setProgress(0);
    setReady(false);
  }, []);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  return (
    <button
      onMouseDown={startHold}
      onMouseUp={releaseHold}
      onMouseLeave={cancelHold}
      onTouchStart={startHold}
      onTouchEnd={releaseHold}
      className="relative overflow-hidden w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-button text-white transition-colors select-none whitespace-nowrap"
      style={{
        background: holding
          ? `linear-gradient(90deg, #991b1b ${progress * 100}%, #dc2626 ${progress * 100}%)`
          : '#dc2626',
      }}
      title="Hold to archive"
    >
      <svg className="w-4 h-4 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
      </svg>
      <span className="relative z-10">{progress >= 1 ? 'Release to Archive' : holding ? 'Hold to Archive…' : 'Archive Event'}</span>
    </button>
  );
}

// Sortable Header Component
function SortableHeader({
  column,
  label,
  currentSort,
  direction,
  onSort,
  className = ''
}: {
  column: SortColumn;
  label: string;
  currentSort: SortColumn;
  direction: 'asc' | 'desc';
  onSort: (column: SortColumn) => void;
  className?: string;
}) {
  const isActive = currentSort === column;

  return (
    <th
      className={`${className} cursor-pointer hover:bg-gray-50 dark:hover:bg-[#171717] transition-colors select-none`}
      onClick={() => onSort(column)}
    >
      <div className={`flex items-center gap-1 ${className.includes('text-right') ? 'justify-end' : className.includes('text-center') ? 'justify-center' : ''}`}>
        <span>{label}</span>
        {isActive && (
          <span className="text-caption text-pink-500 dark:text-pink-400">
            {direction === 'asc' ? '▲' : '▼'}
          </span>
        )}
      </div>
    </th>
  );
}
