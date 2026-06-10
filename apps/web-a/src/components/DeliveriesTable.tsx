'use client';

import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { DayPicker, type DateRange } from 'react-day-picker';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import 'react-day-picker/style.css';
import AddStoreModal from './AddStoreModal';
import DeliveriesMapModal from './DeliveriesMapModal';

// Animates between numeric values using a spring-like ease.
function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }): React.ReactElement {
  const mv = useMotionValue(value);
  const display = useTransform(mv, (v) => format(v));
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] });
    return controls.stop;
  }, [value, mv]);
  return <motion.span>{display}</motion.span>;
}

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

type SortColumn = 'id' | 'storeName' | 'datePrepared' | 'dropoffDate' | 'totalPrepared' | 'totalRevenue' | 'totalCogs' | 'grossProfit';

export default function DeliveriesTable(): React.ReactElement {
  const router = useRouter();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Fetch deliveries (active or archived)
  const fetchDeliveries = (archived: boolean = false): void => {
    setLoading(true);
    const url = archived ? '/api/deliveries?archived=true' : '/api/deliveries';
    fetch(url)
      .then((res: Response) => res.json() as Promise<Delivery[]>)
      .then((data: Delivery[]) => {
        setDeliveries(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        showToast('Failed to load deliveries', 'error');
      });
  };

  useEffect(() => {
    fetchDeliveries();
  }, []);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>('id');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showArchived, setShowArchived] = useState<boolean>(false);

  // Filter state
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  type DatePreset = 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'thisYear';
  const [activeDatePreset, setActiveDatePreset] = useState<DatePreset | null>(null);
  const [revenueMin, setRevenueMin] = useState('');
  const [revenueMax, setRevenueMax] = useState('');
  const [profitMin, setProfitMin] = useState('');
  const [profitMax, setProfitMax] = useState('');
  const [preparedMin, setPreparedMin] = useState('');
  const [preparedMax, setPreparedMax] = useState('');
  const [openFilter, setOpenFilter] = useState<'store' | 'date' | 'advanced' | null>(null);
  const [storeSearch, setStoreSearch] = useState('');
  const [viewMode, setViewModeState] = useState<'list' | 'byStore'>('list');

  // Restore viewMode from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('deliveriesViewMode');
      if (saved === 'list' || saved === 'byStore') setViewModeState(saved);
    } catch {}
  }, []);

  const setViewMode = (mode: 'list' | 'byStore') => {
    setViewModeState(mode);
    try { localStorage.setItem('deliveriesViewMode', mode); } catch {}
  };
  const [showAddStore, setShowAddStore] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [selectedMapDelivery, setSelectedMapDelivery] = useState<Delivery | null>(null);

  const deliveriesWithLocations = useMemo(
    () => deliveries.filter(d => d.location && d.location.trim() !== ''),
    [deliveries]
  );

  const normalizeStore = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

  const uniqueStores = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of deliveries) {
      const key = normalizeStore(d.storeName);
      if (!key) continue;
      if (!seen.has(key)) seen.set(key, d.storeName.trim());
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [deliveries]);

  const filteredStoreOptions = uniqueStores.filter(s =>
    s.toLowerCase().includes(storeSearch.toLowerCase())
  );

  const numActiveFilters =
    (selectedStores.length > 0 ? 1 : 0) +
    (dateRange?.from || dateRange?.to ? 1 : 0) +
    (revenueMin || revenueMax ? 1 : 0) +
    (profitMin || profitMax ? 1 : 0) +
    (preparedMin || preparedMax ? 1 : 0);

  const clearAllFilters = () => {
    setSelectedStores([]);
    setDateRange(undefined);
    setActiveDatePreset(null);
    setRevenueMin('');
    setRevenueMax('');
    setProfitMin('');
    setProfitMax('');
    setPreparedMin('');
    setPreparedMax('');
    setStoreSearch('');
  };

  // Apply quick date presets — clicking the active preset clears it
  const applyDatePreset = (preset: DatePreset | 'all') => {
    if (preset === 'all') {
      setDateRange(undefined);
      setActiveDatePreset(null);
      return;
    }
    if (activeDatePreset === preset) {
      setDateRange(undefined);
      setActiveDatePreset(null);
      return;
    }
    const now = new Date();
    let from: Date;
    let to: Date = now;
    if (preset === 'last7') {
      from = new Date(now);
      from.setDate(from.getDate() - 7);
    } else if (preset === 'last30') {
      from = new Date(now);
      from.setDate(from.getDate() - 30);
    } else if (preset === 'thisMonth') {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (preset === 'lastMonth') {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0);
    } else {
      from = new Date(now.getFullYear(), 0, 1);
    }
    setDateRange({ from, to });
    setActiveDatePreset(preset);
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success'): void => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  const toggleArchived = (): void => {
    const next = !showArchived;
    setShowArchived(next);
    fetchDeliveries(next);
  };

  const restoreDelivery = async (id: number): Promise<void> => {
    try {
      const response = await fetch('/api/deliveries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, deletedAt: null }),
      });
      if (!response.ok) throw new Error('Failed to restore');
      setDeliveries(prev => prev.filter(d => d.id !== id));
      showToast('Delivery restored');
    } catch {
      showToast('Failed to restore delivery', 'error');
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateFull = (dateString: string): React.ReactNode => {
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

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const handleSort = (column: SortColumn): void => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'datePrepared' || column === 'dropoffDate' ? 'desc' : 'desc');
    }
  };

  const handleAddStoreCreated = (newDelivery: Delivery): void => {
    router.push(`/deliveries/${newDelivery.id}`);
  };

  // Apply filters first
  const selectedStoreKeys = new Set(selectedStores.map(normalizeStore));
  const filteredDeliveries = deliveries.filter(d => {
    if (selectedStoreKeys.size > 0 && !selectedStoreKeys.has(normalizeStore(d.storeName))) return false;

    if (dateRange?.from || dateRange?.to) {
      const dStr = d.dropoffDate || d.datePrepared;
      const dDate = new Date(dStr + 'T00:00:00');
      if (dateRange.from) {
        const fromStart = new Date(dateRange.from);
        fromStart.setHours(0, 0, 0, 0);
        if (dDate < fromStart) return false;
      }
      if (dateRange.to) {
        const toEnd = new Date(dateRange.to);
        toEnd.setHours(23, 59, 59, 999);
        if (dDate > toEnd) return false;
      }
    }

    const rMin = revenueMin ? parseFloat(revenueMin) : null;
    const rMax = revenueMax ? parseFloat(revenueMax) : null;
    if (rMin != null && !isNaN(rMin) && d.totalRevenue < rMin) return false;
    if (rMax != null && !isNaN(rMax) && d.totalRevenue > rMax) return false;

    const pMin = profitMin ? parseFloat(profitMin) : null;
    const pMax = profitMax ? parseFloat(profitMax) : null;
    if (pMin != null && !isNaN(pMin) && d.grossProfit < pMin) return false;
    if (pMax != null && !isNaN(pMax) && d.grossProfit > pMax) return false;

    const prMin = preparedMin ? parseFloat(preparedMin) : null;
    const prMax = preparedMax ? parseFloat(preparedMax) : null;
    if (prMin != null && !isNaN(prMin) && d.totalPrepared < prMin) return false;
    if (prMax != null && !isNaN(prMax) && d.totalPrepared > prMax) return false;

    return true;
  });

  // Sort filtered deliveries by selected column
  const sortedDeliveries = [...filteredDeliveries].sort((a, b) => {
    let comparison = 0;

    if (sortColumn === 'id') {
      comparison = a.id - b.id;
    } else if (sortColumn === 'storeName') {
      comparison = a.storeName.localeCompare(b.storeName);
    } else if (sortColumn === 'datePrepared') {
      comparison = new Date(a.datePrepared).getTime() - new Date(b.datePrepared).getTime();
    } else if (sortColumn === 'dropoffDate') {
      const aDate = a.dropoffDate ? new Date(a.dropoffDate).getTime() : 0;
      const bDate = b.dropoffDate ? new Date(b.dropoffDate).getTime() : 0;
      comparison = aDate - bDate;
    } else {
      comparison = (a[sortColumn] as number) - (b[sortColumn] as number);
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  // Calculate totals (reflects active filters)
  const totals = {
    prepared: filteredDeliveries.reduce((sum, d) => sum + d.totalPrepared, 0),
    revenue: filteredDeliveries.reduce((sum, d) => sum + d.totalRevenue, 0),
    cogs: filteredDeliveries.reduce((sum, d) => sum + d.totalCogs, 0),
    profit: filteredDeliveries.reduce((sum, d) => sum + d.grossProfit, 0),
  };

  // Comparator that respects the active sort column / direction
  const compareDeliveries = (a: Delivery, b: Delivery): number => {
    let cmp = 0;
    if (sortColumn === 'id') cmp = a.id - b.id;
    else if (sortColumn === 'storeName') cmp = a.storeName.localeCompare(b.storeName);
    else if (sortColumn === 'datePrepared') cmp = new Date(a.datePrepared).getTime() - new Date(b.datePrepared).getTime();
    else if (sortColumn === 'dropoffDate') {
      const aDate = a.dropoffDate ? new Date(a.dropoffDate).getTime() : 0;
      const bDate = b.dropoffDate ? new Date(b.dropoffDate).getTime() : 0;
      cmp = aDate - bDate;
    } else cmp = (a[sortColumn] as number) - (b[sortColumn] as number);
    return sortDirection === 'asc' ? cmp : -cmp;
  };

  // Group filtered deliveries by store (for By Store view)
  const groupedByStore = useMemo(() => {
    const groups = new Map<string, { storeName: string; deliveries: Delivery[]; totalPrepared: number; totalRevenue: number; totalCogs: number; totalProfit: number }>();
    for (const d of filteredDeliveries) {
      const key = normalizeStore(d.storeName);
      if (!groups.has(key)) {
        groups.set(key, { storeName: d.storeName.trim(), deliveries: [], totalPrepared: 0, totalRevenue: 0, totalCogs: 0, totalProfit: 0 });
      }
      const g = groups.get(key)!;
      g.deliveries.push(d);
      g.totalPrepared += d.totalPrepared;
      g.totalRevenue += d.totalRevenue;
      g.totalCogs += d.totalCogs;
      g.totalProfit += d.grossProfit;
    }
    // Sort each group's deliveries using the active sort
    for (const g of groups.values()) {
      g.deliveries.sort(compareDeliveries);
    }
    // Sort the groups themselves by the same column (aggregate where applicable)
    const groupList = [...groups.values()];
    const dir = sortDirection === 'asc' ? 1 : -1;
    if (sortColumn === 'storeName') {
      groupList.sort((a, b) => a.storeName.localeCompare(b.storeName) * dir);
    } else if (sortColumn === 'totalPrepared') {
      groupList.sort((a, b) => (a.totalPrepared - b.totalPrepared) * dir);
    } else if (sortColumn === 'totalRevenue') {
      groupList.sort((a, b) => (a.totalRevenue - b.totalRevenue) * dir);
    } else if (sortColumn === 'totalCogs') {
      groupList.sort((a, b) => (a.totalCogs - b.totalCogs) * dir);
    } else if (sortColumn === 'grossProfit') {
      groupList.sort((a, b) => (a.totalProfit - b.totalProfit) * dir);
    } else if (sortColumn === 'datePrepared' || sortColumn === 'dropoffDate' || sortColumn === 'id') {
      // Sort groups by their first (most recent per active sort) delivery's value
      groupList.sort((a, b) => compareDeliveries(a.deliveries[0], b.deliveries[0]));
    }
    return groupList;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredDeliveries, sortColumn, sortDirection]);

  // Calculate metrics (reflects active filters)
  const deliveriesWithRevenue = filteredDeliveries.filter(d => d.totalRevenue > 0).length;
  const profitMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;
  const avgRevenuePerDelivery = deliveriesWithRevenue > 0 ? totals.revenue / deliveriesWithRevenue : 0;
  const avgProfitPerDelivery = deliveriesWithRevenue > 0 ? totals.profit / deliveriesWithRevenue : 0;

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
        <div className="flex items-start justify-between gap-4 flex-wrap px-8 pt-8 pb-4">
          <div>
            <h2 className="text-title-2 text-gray-900 dark:text-zinc-100">View Your Deliveries</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {deliveriesWithLocations.length > 0 && (
              <button
                onClick={() => setShowMap(true)}
                className="px-5 py-2.5 bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-[#262626] text-gray-700 dark:text-zinc-300 rounded-full text-button hover:bg-[#fafafa] dark:hover:bg-[#171717] transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Past Deliveries
              </button>
            )}
            <button
              onClick={toggleArchived}
              className={`px-5 py-2.5 border rounded-full text-button transition-all flex items-center gap-2 ${
                showArchived
                  ? 'bg-gray-900 border-gray-900 text-white hover:bg-gray-800 dark:bg-zinc-100 dark:border-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-[#fafafa] dark:bg-[#0a0a0a] dark:border-[#262626] dark:text-zinc-300 dark:hover:bg-[#171717]'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              Archived
            </button>
            <button
              onClick={() => setShowAddStore(true)}
              className="animated-border px-5 py-2.5 text-white rounded-full text-button transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Store
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        {deliveries.length > 0 && (
          <div className="px-8 pb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Total Cookies"
                numericValue={totals.prepared}
                format={(v) => Math.round(v).toLocaleString()}
                sublabel={numActiveFilters > 0 ? `across ${filteredDeliveries.length} of ${deliveries.length} deliveries` : `across ${filteredDeliveries.length} deliveries`}
              />
              <StatCard
                label="Profit Margin"
                numericValue={profitMargin}
                format={(v) => `${v.toFixed(1)}%`}
                sublabel={`${formatCurrency(totals.cogs)} total COGS`}
              />
              <StatCard
                label="Average Revenue per Delivery"
                numericValue={avgRevenuePerDelivery}
                format={formatCurrency}
                sublabel={`${formatCurrency(totals.revenue)} total revenue`}
              />
              <StatCard
                label="Average Profit per Delivery"
                numericValue={avgProfitPerDelivery}
                format={formatCurrency}
                sublabel={`${formatCurrency(totals.profit)} total profit`}
              />
            </div>
          </div>
        )}

        {/* Helper text + filter controls */}
        <div className="flex items-start justify-between gap-4 flex-wrap px-8 pb-4">
          <p className="text-body text-gray-700 dark:text-zinc-300">
            {numActiveFilters > 0
              ? `Showing ${filteredDeliveries.length} of ${deliveries.length} deliveries.`
              : 'Select a store below to view details, or add a new store to get started.'}
          </p>

          {deliveries.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* View toggle: By Date / By Store */}
              <div className="flex bg-[#fafafa] dark:bg-[#1f1f1f] rounded-full p-0.5 border border-gray-200 dark:border-[#262626]">
                <button
                  onClick={() => setViewMode('list')}
                  className={`relative px-3 py-1 text-button rounded-full transition-colors flex items-center gap-1.5 ${
                    viewMode === 'list'
                      ? 'text-gray-900 dark:text-zinc-100'
                      : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
                  }`}
                >
                  {viewMode === 'list' && (
                    <motion.div
                      layoutId="view-mode-bg"
                      className="absolute inset-0 bg-white dark:bg-[#0a0a0a] shadow-sm rounded-full"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <svg className="relative w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="relative">By Date</span>
                </button>
                <button
                  onClick={() => setViewMode('byStore')}
                  className={`relative px-3 py-1 text-button rounded-full transition-colors flex items-center gap-1.5 ${
                    viewMode === 'byStore'
                      ? 'text-gray-900 dark:text-zinc-100'
                      : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
                  }`}
                >
                  {viewMode === 'byStore' && (
                    <motion.div
                      layoutId="view-mode-bg"
                      className="absolute inset-0 bg-white dark:bg-[#0a0a0a] shadow-sm rounded-full"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <svg className="relative w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9l2-5h14l2 5M3 9v10a1 1 0 001 1h16a1 1 0 001-1V9M3 9h18M9 14h6" />
                  </svg>
                  <span className="relative">By Store</span>
                </button>
              </div>

              <span className="w-px h-6 bg-gray-200 dark:bg-[#262626] mx-1" />

              {/* Store filter */}
              <FilterPill
                label="Store"
                active={selectedStores.length > 0}
                activeText={selectedStores.length === 1 ? selectedStores[0] : selectedStores.length > 1 ? `${selectedStores.length} stores` : null}
                isOpen={openFilter === 'store'}
                onToggle={() => setOpenFilter(openFilter === 'store' ? null : 'store')}
                onClear={() => { setSelectedStores([]); setStoreSearch(''); }}
                popoverWidth="w-72"
              >
                <div className="p-3">
                  <input
                    type="text"
                    placeholder="Search stores..."
                    value={storeSearch}
                    onChange={(e) => setStoreSearch(e.target.value)}
                    className="w-full px-3 py-2 text-callout bg-gray-50 dark:bg-[#171717] border border-gray-200 dark:border-[#262626] rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-600"
                  />
                  <div className="flex items-center justify-between mt-2 mb-1 px-1">
                    <button
                      onClick={() => setSelectedStores(filteredStoreOptions)}
                      className="text-button-sm text-pink-600 dark:text-pink-400 hover:underline"
                    >
                      Select all
                    </button>
                    <button
                      onClick={() => setSelectedStores([])}
                      className="text-button-sm text-gray-500 dark:text-zinc-400 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {filteredStoreOptions.length === 0 ? (
                      <p className="text-callout text-gray-400 dark:text-zinc-500 text-center py-4">No stores match</p>
                    ) : (
                      filteredStoreOptions.map(store => (
                        <label
                          key={store}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-[#171717] cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedStores.includes(store)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedStores(prev => [...prev, store]);
                              else setSelectedStores(prev => prev.filter(s => s !== store));
                            }}
                            className="w-4 h-4 accent-pink-500"
                          />
                          <span className="text-callout text-gray-700 dark:text-zinc-300 truncate">{store}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </FilterPill>

              {/* Date filter */}
              <FilterPill
                label="Date"
                active={!!(dateRange?.from || dateRange?.to)}
                activeText={
                  dateRange?.from && dateRange?.to
                    ? `${dateRange.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${dateRange.to.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                    : dateRange?.from
                    ? `From ${dateRange.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                    : dateRange?.to
                    ? `Until ${dateRange.to.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                    : null
                }
                isOpen={openFilter === 'date'}
                onToggle={() => setOpenFilter(openFilter === 'date' ? null : 'date')}
                onClear={() => { setDateRange(undefined); setActiveDatePreset(null); }}
                popoverWidth="w-auto"
              >
                <div className="p-4">
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {([
                      ['last7', 'Last 7 days'],
                      ['last30', 'Last 30 days'],
                      ['thisMonth', 'This month'],
                      ['lastMonth', 'Last month'],
                      ['thisYear', 'This year'],
                      ['all', 'All time'],
                    ] as const).map(([key, label]) => {
                      const isActive = key !== 'all' && activeDatePreset === key;
                      return (
                        <button
                          key={key}
                          onClick={() => applyDatePreset(key)}
                          className={`px-3 py-1 text-button-sm rounded-full border transition-colors ${
                            isActive
                              ? 'bg-pink-500 dark:bg-pink-500 text-white border-pink-500 hover:bg-pink-600'
                              : 'bg-gray-50 dark:bg-[#171717] text-gray-700 dark:text-zinc-300 border-gray-200 dark:border-[#262626] hover:bg-pink-50 dark:hover:bg-pink-950/30 hover:text-pink-600 dark:hover:text-pink-400'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <DayPicker
                    mode="range"
                    selected={dateRange}
                    onSelect={(r) => { setDateRange(r); setActiveDatePreset(null); }}
                    numberOfMonths={2}
                    className="!font-sans"
                  />
                </div>
              </FilterPill>

              {/* Numeric ranges filter */}
              <FilterPill
                label="Amounts"
                active={!!(revenueMin || revenueMax || profitMin || profitMax || preparedMin || preparedMax)}
                activeText={
                  [
                    (revenueMin || revenueMax) && 'Revenue',
                    (profitMin || profitMax) && 'Profit',
                    (preparedMin || preparedMax) && 'Prepared',
                  ].filter(Boolean).join(', ') || null
                }
                isOpen={openFilter === 'advanced'}
                onToggle={() => setOpenFilter(openFilter === 'advanced' ? null : 'advanced')}
                onClear={() => { setRevenueMin(''); setRevenueMax(''); setProfitMin(''); setProfitMax(''); setPreparedMin(''); setPreparedMax(''); }}
                popoverWidth="w-96"
              >
                <div className="p-5 space-y-4">
                  <RangeRow label="Revenue" prefix="$" min={revenueMin} max={revenueMax} onMin={setRevenueMin} onMax={setRevenueMax} />
                  <RangeRow label="Profit" prefix="$" min={profitMin} max={profitMax} onMin={setProfitMin} onMax={setProfitMax} />
                  <RangeRow label="Prepared" prefix="" min={preparedMin} max={preparedMax} onMin={setPreparedMin} onMax={setPreparedMax} />
                </div>
              </FilterPill>

              {numActiveFilters > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="text-button-sm text-gray-500 dark:text-zinc-400 hover:text-pink-600 dark:hover:text-pink-400 transition-colors px-2"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="px-4 pb-4">
          <table className="data-table">
            <thead>
              <tr>
                <SortableHeader label="#" column="id" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-6 text-center" />
                {viewMode !== 'byStore' && (
                  <SortableHeader label="Store" column="storeName" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-52" />
                )}
                <SortableHeader label="Dropoff Date" column="dropoffDate" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-28" />
                <SortableHeader label="Date Prepared" column="datePrepared" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-28" />
                <SortableHeader label="Prepared" column="totalPrepared" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-20 text-center" />
                <SortableHeader label="Revenue" column="totalRevenue" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-12 text-right" />
                <SortableHeader label="COGS" column="totalCogs" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-10 text-right" />
                <SortableHeader label="Profit" column="grossProfit" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-12 text-right" />
                {showArchived && <th className="w-20"><span className="px-2 py-3 text-caption uppercase tracking-wider text-gray-400 dark:text-zinc-500"></span></th>}
              </tr>
            </thead>
            <AnimatePresence mode="wait">
              <motion.tbody
                key={viewMode}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
              {viewMode === 'list' && sortedDeliveries.map((delivery) => (
                <motion.tr
                  key={delivery.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="group cursor-pointer hover:bg-[#fafafa] dark:hover:bg-[#171717] transition-colors"
                  onClick={() => router.push(`/deliveries/${delivery.id}`)}
                >
                  <td>
                    <span className="px-2 py-3 min-h-[44px] flex items-center justify-center text-pink-600 dark:text-pink-400 text-callout">
                      {delivery.id}
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center text-gray-900 dark:text-zinc-100 text-headline">
                      {delivery.storeName}
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center text-gray-600 dark:text-zinc-400 text-callout whitespace-nowrap">
                      {delivery.dropoffDate ? formatDateFull(delivery.dropoffDate) : <span className="text-gray-300 dark:text-zinc-700">--</span>}
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center text-gray-600 dark:text-zinc-400 text-callout whitespace-nowrap">
                      {formatDateFull(delivery.datePrepared)}
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center justify-center text-gray-600 dark:text-zinc-400 text-callout">
                      {delivery.totalPrepared}
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center justify-end whitespace-nowrap">
                      {delivery.totalRevenue > 0 ? (
                        <span className="text-gray-900 dark:text-zinc-100 text-callout">{formatCurrency(delivery.totalRevenue)}</span>
                      ) : (
                        <span className="text-gray-300 dark:text-zinc-700 text-callout">--</span>
                      )}
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center justify-end whitespace-nowrap">
                      {delivery.totalCogs > 0 ? (
                        <span className="text-gray-600 dark:text-zinc-400 text-callout">{formatCurrency(delivery.totalCogs)}</span>
                      ) : (
                        <span className="text-gray-300 dark:text-zinc-700 text-callout">--</span>
                      )}
                    </span>
                  </td>
                  <td>
                    <span className="px-4 py-3 min-h-[44px] flex items-center justify-end whitespace-nowrap">
                      {delivery.grossProfit > 0 ? (
                        <span className="text-green-600 dark:text-green-400 text-callout">{formatCurrency(delivery.grossProfit)}</span>
                      ) : delivery.grossProfit < 0 ? (
                        <span className="text-red-500 dark:text-red-400 text-callout">{formatCurrency(delivery.grossProfit)}</span>
                      ) : (
                        <span className="text-gray-300 dark:text-zinc-700 text-callout">--</span>
                      )}
                    </span>
                  </td>
                  {showArchived && (
                    <td>
                      <span className="px-4 py-3 min-h-[44px] flex items-center justify-center">
                        <button
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); restoreDelivery(delivery.id); }}
                          className="text-button-sm text-pink-500 dark:text-pink-400 hover:text-pink-600 dark:hover:text-pink-300"
                        >
                          Restore
                        </button>
                      </span>
                    </td>
                  )}
                </motion.tr>
              ))}

              {viewMode === 'byStore' && groupedByStore.map((group) => (
                <Fragment key={group.storeName}>
                  {/* Store parent row */}
                  <motion.tr
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className="bg-gray-50/70 dark:bg-[#141414] border-t border-gray-200 dark:border-[#1f1f1f]"
                  >
                    <td colSpan={3}>
                      <span className="px-4 py-3 min-h-[44px] flex items-center text-gray-900 dark:text-zinc-100 text-headline">
                        {group.storeName} with <span className="text-pink-600 dark:text-pink-400 mx-1">{group.deliveries.length}</span> deliver{group.deliveries.length === 1 ? 'y' : 'ies'}
                      </span>
                    </td>
                    <td>
                      <span className="px-4 py-3 min-h-[44px] flex items-center justify-center text-gray-900 dark:text-zinc-100 text-callout">
                        {group.totalPrepared.toLocaleString()}
                      </span>
                    </td>
                    <td>
                      <span className="px-4 py-3 min-h-[44px] flex items-center justify-end text-callout text-gray-900 dark:text-zinc-100 whitespace-nowrap">
                        {group.totalRevenue > 0 ? formatCurrency(group.totalRevenue) : <span className="text-gray-300 dark:text-zinc-700">--</span>}
                      </span>
                    </td>
                    <td>
                      <span className="px-4 py-3 min-h-[44px] flex items-center justify-end text-callout text-gray-900 dark:text-zinc-100 whitespace-nowrap">
                        {group.totalCogs > 0 ? formatCurrency(group.totalCogs) : <span className="text-gray-300 dark:text-zinc-700">--</span>}
                      </span>
                    </td>
                    <td>
                      <span className="px-4 py-3 min-h-[44px] flex items-center justify-end whitespace-nowrap">
                        {group.totalProfit > 0 ? (
                          <span className="text-green-600 dark:text-green-400 text-callout">{formatCurrency(group.totalProfit)}</span>
                        ) : group.totalProfit < 0 ? (
                          <span className="text-red-500 dark:text-red-400 text-callout">{formatCurrency(group.totalProfit)}</span>
                        ) : (
                          <span className="text-gray-300 dark:text-zinc-700 text-callout">--</span>
                        )}
                      </span>
                    </td>
                    {showArchived && <td></td>}
                  </motion.tr>

                  {/* Delivery sub-rows */}
                  {group.deliveries.map((delivery) => (
                    <motion.tr
                      key={delivery.id}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
                      className="group cursor-pointer hover:bg-[#fafafa] dark:hover:bg-[#171717] transition-colors"
                      onClick={() => router.push(`/deliveries/${delivery.id}`)}
                    >
                      <td>
                        <span className="px-2 py-3 min-h-[44px] flex items-center justify-center text-pink-600 dark:text-pink-400 text-callout">{delivery.id}</span>
                      </td>
                      <td>
                        <span className="px-4 py-3 min-h-[44px] flex items-center text-gray-600 dark:text-zinc-400 text-callout whitespace-nowrap">
                          {delivery.dropoffDate ? formatDateFull(delivery.dropoffDate) : <span className="text-gray-300 dark:text-zinc-700">--</span>}
                        </span>
                      </td>
                      <td>
                        <span className="px-4 py-3 min-h-[44px] flex items-center text-gray-600 dark:text-zinc-400 text-callout whitespace-nowrap">
                          {formatDateFull(delivery.datePrepared)}
                        </span>
                      </td>
                      <td>
                        <span className="px-4 py-3 min-h-[44px] flex items-center justify-center text-gray-600 dark:text-zinc-400 text-callout">
                          {delivery.totalPrepared}
                        </span>
                      </td>
                      <td>
                        <span className="px-4 py-3 min-h-[44px] flex items-center justify-end whitespace-nowrap">
                          {delivery.totalRevenue > 0 ? (
                            <span className="text-gray-900 dark:text-zinc-100 text-callout">{formatCurrency(delivery.totalRevenue)}</span>
                          ) : (
                            <span className="text-gray-300 dark:text-zinc-700 text-callout">--</span>
                          )}
                        </span>
                      </td>
                      <td>
                        <span className="px-4 py-3 min-h-[44px] flex items-center justify-end whitespace-nowrap">
                          {delivery.totalCogs > 0 ? (
                            <span className="text-gray-600 dark:text-zinc-400 text-callout">{formatCurrency(delivery.totalCogs)}</span>
                          ) : (
                            <span className="text-gray-300 dark:text-zinc-700 text-callout">--</span>
                          )}
                        </span>
                      </td>
                      <td>
                        <span className="px-4 py-3 min-h-[44px] flex items-center justify-end whitespace-nowrap">
                          {delivery.grossProfit > 0 ? (
                            <span className="text-green-600 dark:text-green-400 text-callout">{formatCurrency(delivery.grossProfit)}</span>
                          ) : delivery.grossProfit < 0 ? (
                            <span className="text-red-500 dark:text-red-400 text-callout">{formatCurrency(delivery.grossProfit)}</span>
                          ) : (
                            <span className="text-gray-300 dark:text-zinc-700 text-callout">--</span>
                          )}
                        </span>
                      </td>
                      {showArchived && (
                        <td>
                          <span className="px-4 py-3 min-h-[44px] flex items-center justify-center">
                            <button
                              onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); restoreDelivery(delivery.id); }}
                              className="text-button-sm text-pink-500 dark:text-pink-400 hover:text-pink-600 dark:hover:text-pink-300"
                            >
                              Restore
                            </button>
                          </span>
                        </td>
                      )}
                    </motion.tr>
                  ))}
                </Fragment>
              ))}
              </motion.tbody>
            </AnimatePresence>
          </table>

          {deliveries.length === 0 && (
            <div className="text-center py-12 text-gray-400 dark:text-zinc-500">
              No deliveries yet. Click &quot;Add Store&quot; to get started.
            </div>
          )}

          {deliveries.length > 0 && filteredDeliveries.length === 0 && (
            <div className="text-center py-12 text-gray-400 dark:text-zinc-500">
              No deliveries match your filters.{' '}
              <button onClick={clearAllFilters} className="text-pink-600 dark:text-pink-400 hover:underline text-button">
                Clear filters
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}

      <AddStoreModal
        open={showAddStore}
        onClose={() => setShowAddStore(false)}
        deliveries={deliveries}
        onCreated={handleAddStoreCreated}
      />

      {showMap && (
        <DeliveriesMapModal
          deliveries={deliveriesWithLocations}
          onClose={() => { setShowMap(false); setSelectedMapDelivery(null); }}
          selectedDelivery={selectedMapDelivery}
          onSelectDelivery={setSelectedMapDelivery}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
        />
      )}
    </div>
  );
}

// Filter Pill — anchors its popover to itself
interface FilterPillProps {
  label: string;
  active: boolean;
  activeText: string | null;
  isOpen: boolean;
  onToggle: () => void;
  onClear: () => void;
  popoverWidth?: string;
  children?: React.ReactNode;
}

function FilterPill({ label, active, activeText, isOpen, onToggle, onClear, popoverWidth = 'w-72', children }: FilterPillProps): React.ReactElement {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`px-4 py-1.5 rounded-full text-button transition-all flex items-center gap-2 border ${
          active
            ? 'bg-pink-50 dark:bg-pink-950/40 border-pink-200 dark:border-pink-900/60 text-pink-700 dark:text-pink-300'
            : isOpen
            ? 'bg-gray-100 dark:bg-[#1f1f1f] border-gray-300 dark:border-[#3f3f3f] text-gray-900 dark:text-zinc-100'
            : 'bg-white dark:bg-[#0a0a0a] border-gray-200 dark:border-[#262626] text-gray-700 dark:text-zinc-300 hover:bg-[#fafafa] dark:hover:bg-[#171717]'
        }`}
      >
        <span>{label}</span>
        {active && activeText && (
          <span className="text-caption opacity-80 max-w-[160px] truncate">: {activeText}</span>
        )}
        {active ? (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="ml-0.5 opacity-60 hover:opacity-100"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        ) : (
          <svg className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={onToggle} />
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className={`absolute right-0 top-full mt-2 z-50 ${popoverWidth} bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-[#262626] rounded-2xl shadow-xl`}
            >
              {children}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// Range Row — pair of min/max inputs for a numeric range
interface RangeRowProps {
  label: string;
  prefix: string;
  min: string;
  max: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
}

function RangeRow({ label, prefix, min, max, onMin, onMax }: RangeRowProps): React.ReactElement {
  return (
    <div>
      <label className="block text-caption uppercase tracking-wider text-gray-500 dark:text-zinc-400 mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 text-callout">{prefix}</span>}
          <input
            type="number"
            placeholder="Min"
            value={min}
            onChange={(e) => onMin(e.target.value)}
            className={`w-full ${prefix ? 'pl-7' : 'pl-3'} pr-3 py-2 text-callout bg-gray-50 dark:bg-[#171717] border border-gray-200 dark:border-[#262626] rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-600`}
          />
        </div>
        <span className="text-gray-400 dark:text-zinc-500 text-callout">to</span>
        <div className="relative flex-1">
          {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 text-callout">{prefix}</span>}
          <input
            type="number"
            placeholder="Max"
            value={max}
            onChange={(e) => onMax(e.target.value)}
            className={`w-full ${prefix ? 'pl-7' : 'pl-3'} pr-3 py-2 text-callout bg-gray-50 dark:bg-[#171717] border border-gray-200 dark:border-[#262626] rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-600`}
          />
        </div>
      </div>
    </div>
  );
}

// Stat Card Component
interface StatCardProps {
  label: string;
  value?: string;
  numericValue?: number;
  format?: (n: number) => string;
  sublabel?: string;
  highlight?: boolean;
}

function StatCard({ label, value, numericValue, format, sublabel, highlight }: StatCardProps): React.ReactElement {
  return (
    <div className="p-4 bg-[#fafafa] dark:bg-[#171717] rounded-2xl">
      <p className="text-headline text-gray-700 dark:text-zinc-300">{label}</p>
      <p className={`text-title-2 mt-1 ${highlight ? 'text-pink-600 dark:text-pink-400' : 'text-gray-900 dark:text-zinc-100'}`}>
        {numericValue !== undefined && format ? (
          <AnimatedNumber value={numericValue} format={format} />
        ) : (
          value
        )}
      </p>
      {sublabel && <p className="text-headline text-gray-500 dark:text-zinc-400 mt-1">{sublabel}</p>}
    </div>
  );
}

// Sortable Header Component
interface SortableHeaderProps {
  label: string;
  column: SortColumn;
  currentColumn: SortColumn;
  direction: 'asc' | 'desc';
  onSort: (column: SortColumn) => void;
  className?: string;
}

function SortableHeader({
  label,
  column,
  currentColumn,
  direction,
  onSort,
  className = '',
}: SortableHeaderProps): React.ReactElement {
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
