import { useState, useRef, useEffect, useCallback, useMemo, ComponentType, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import AppleMap from './AppleMap';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import 'react-day-picker/style.css';

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
  toolbar: string[][] | false;
}

type QuillComponentType = ComponentType<QuillEditorProps>;

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
  invoiceNotes: string | null;
  additionalFees: number;
  discount: number;
  prepaidAmount: number;
  cashCollected: number;
  venmoCollected: number;
  otherCollected: number;
  createdAt: string | null;
}

interface DeliveryItem {
  id: number;
  deliveryId: number;
  flavorName: string;
  prepared: number;
  unsold: number;
  unitPrice: number | null;
  unitCost: number | null;
  revenue: number;
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

interface RenderViaCanvasOpts {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  maxWidth?: number;
}

interface NewItemData {
  prepared: number;
  unitCost: string;
}

type DeliveryField = keyof Delivery;

type DeliveryItemField = 'prepared' | 'unsold' | 'unitPrice' | 'unitCost' | 'rateId';

interface DeliveryDetailProps {
  deliveryId: number;
}

export default function DeliveryDetail({ deliveryId }: DeliveryDetailProps) {
  const router = useRouter();
  const [notesView, setNotesView] = useState<'personal' | 'invoice'>('personal');
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [items, setItems] = useState<DeliveryItem[]>([]);
  const [availableFlavors, setAvailableFlavors] = useState<Flavor[]>([]);
  const [flavorPrices, setFlavorPrices] = useState<FlavorPrice[]>([]);
  const [allDeliveries, setAllDeliveries] = useState<Delivery[]>([]);
  const [allDeliveryItems, setAllDeliveryItems] = useState<DeliveryItem[]>([]);
  // Snapshot of flavors present at page load — suggestions are filtered against this,
  // not live `items`, so newly-accepted suggestions stay visible until refresh.
  const [initialFlavorSet, setInitialFlavorSet] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Fetch data on mount
  useEffect(() => {
    if (!deliveryId) return;

    Promise.all([
      fetch(`/api/deliveries?id=${deliveryId}`).then((res: Response) => res.json() as Promise<Delivery>),
      fetch(`/api/delivery-items?deliveryId=${deliveryId}`).then((res: Response) => res.json() as Promise<DeliveryItem[]>),
      fetch('/api/flavors?includeArchived=true').then((res: Response) => res.json() as Promise<Flavor[]>),
      fetch('/api/flavor-prices?includeArchived=true').then((res: Response) => res.json() as Promise<FlavorPrice[]>),
      fetch('/api/deliveries').then((res: Response) => res.json() as Promise<Delivery[]>),
      fetch('/api/delivery-items').then((res: Response) => res.json() as Promise<DeliveryItem[]>),
    ])
      .then(([deliveryData, itemsData, flavorsData, pricesData, allData, allItemsData]: [Delivery, DeliveryItem[], Flavor[], FlavorPrice[], Delivery[], DeliveryItem[]]) => {
        setDelivery(deliveryData);
        const loadedItems = itemsData || [];
        setItems(loadedItems);
        setInitialFlavorSet(new Set(loadedItems.map(i => i.flavorName)));
        setAvailableFlavors(flavorsData);
        setFlavorPrices(pricesData);
        setAllDeliveries(allData || []);
        setAllDeliveryItems(allItemsData || []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [deliveryId]);

  const normalizeStore = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

  const previousDeliveries = delivery
    ? allDeliveries
        .filter(d => normalizeStore(d.storeName) === normalizeStore(delivery.storeName) && d.id !== delivery.id)
        .sort((a, b) => {
          const aDate = new Date((a.dropoffDate || a.datePrepared) + 'T00:00:00').getTime();
          const bDate = new Date((b.dropoffDate || b.datePrepared) + 'T00:00:00').getTime();
          return bDate - aDate;
        })
    : [];

  // Ghost-row suggestions: unique flavors from this store's last 2 deliveries,
  // each with the most-recent rate that was used for that flavor at this store.
  // Filters out flavors already present in the current delivery.
  interface Suggestion {
    flavorName: string;
    rateId: number;
    tierName: string;
    unitPrice: number;
    unitCost: number;
  }

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!delivery) return [];
    const lastTwo = previousDeliveries.slice(0, 2);
    if (lastTwo.length === 0) return [];

    const activeFlavorNames = new Set(availableFlavors.filter(f => f.isActive).map(f => f.name));
    const seen = new Map<string, Suggestion>();
    for (const prev of lastTwo) {
      const prevItems = allDeliveryItems.filter(i => i.deliveryId === prev.id);
      for (const it of prevItems) {
        if (seen.has(it.flavorName)) continue;
        if (!activeFlavorNames.has(it.flavorName)) continue;
        if (it.rateId == null) continue;
        const rate = flavorPrices.find(p => p.id === it.rateId && p.isActive);
        if (!rate) continue;
        seen.set(it.flavorName, {
          flavorName: it.flavorName,
          rateId: rate.id,
          tierName: rate.tierName,
          unitPrice: rate.price,
          unitCost: rate.cost ?? 0,
        });
      }
    }

    // Filter against the snapshot of flavors at page load (NOT live items),
    // so accepted suggestions stay visible until next refresh.
    const baseline = initialFlavorSet ?? new Set<string>(items.map(i => i.flavorName));
    return [...seen.values()].filter(s => !baseline.has(s.flavorName));
  }, [delivery, previousDeliveries, allDeliveryItems, flavorPrices, availableFlavors, initialFlavorSet, items]);

  const liveFlavorSet = useMemo(() => new Set(items.map(i => i.flavorName)), [items]);

  // Show suggestions if the delivery was empty at load time, OR if it was created today.
  // Avoids spamming suggestions on long-lived deliveries that already have flavors.
  const shouldShowSuggestions = useMemo(() => {
    if (initialFlavorSet === null) return false;
    if (initialFlavorSet.size === 0) return true;
    if (!delivery?.createdAt) return false;
    const created = new Date(delivery.createdAt.replace(' ', 'T') + 'Z');
    if (isNaN(created.getTime())) return false;
    const now = new Date();
    return (
      created.getFullYear() === now.getFullYear() &&
      created.getMonth() === now.getMonth() &&
      created.getDate() === now.getDate()
    );
  }, [initialFlavorSet, delivery]);

  const acceptSuggestion = async (s: Suggestion): Promise<void> => {
    if (!delivery) return;
    try {
      const res = await fetch('/api/delivery-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryId: delivery.id,
          flavorName: s.flavorName,
          prepared: 0,
          unitPrice: s.unitPrice,
          unitCost: s.unitCost,
          revenue: 0,
          cogs: 0,
          profit: 0,
          rateId: s.rateId,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const newItem: DeliveryItem = await res.json();
      setItems(prev => [...prev, newItem]);
      setAllDeliveryItems(prev => [...prev, newItem]);
      const dRes = await fetch(`/api/deliveries?id=${delivery.id}`);
      if (dRes.ok) setDelivery(await dRes.json() as Delivery);
    } catch {
      showToast('Failed to add suggestion', 'error');
    }
  };

  const [editingDatePrepared, setEditingDatePrepared] = useState(false);
  const [editingDropoffDate, setEditingDropoffDate] = useState(false);
  const [showAddFlavor, setShowAddFlavor] = useState(false);
  const [selectedFlavorId, setSelectedFlavorId] = useState<number | ''>('');
  const [selectedRateId, setSelectedRateId] = useState<number | ''>('');
  const [newItemData, setNewItemData] = useState<NewItemData>({
    prepared: 0,
    unitCost: '',
  });
  const [pendingDeleteDelivery, setPendingDeleteDelivery] = useState(false);

  // Sorting state
  type SortColumn = 'id' | 'flavorName' | 'prepared' | 'unsold' | 'revenue' | 'unitCost' | 'cogs' | 'profit';
  const [sortColumn, setSortColumn] = useState<SortColumn>('id');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  // Reset pending delete after 3 seconds
  useEffect(() => {
    if (pendingDeleteDelivery) {
      const timer = setTimeout(() => setPendingDeleteDelivery(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [pendingDeleteDelivery]);

  const [hardDelete, setHardDelete] = useState(false);

  const handleArchive = async () => {
    if (!delivery) return;
    try {
      const response = await fetch('/api/deliveries', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: delivery.id, hard: false }),
      });
      if (!response.ok) throw new Error('Failed to archive');
      window.location.href = '/deliveries';
    } catch {
      showToast('Failed to archive delivery', 'error');
    }
  };

  const handleDeleteDelivery = async (e?: React.MouseEvent) => {
    const isShift = e?.shiftKey || false;

    // First click: show confirmation state
    if (!pendingDeleteDelivery) {
      setPendingDeleteDelivery(true);
      if (isShift) setHardDelete(true);
      return;
    }

    // Second click: actually delete
    if (!delivery) return;
    try {
      const response = await fetch('/api/deliveries', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: delivery.id, hard: hardDelete }),
      });

      if (!response.ok) throw new Error('Failed to delete');

      // Redirect to deliveries page
      window.location.href = '/deliveries';
    } catch {
      showToast('Failed to delete delivery', 'error');
      setPendingDeleteDelivery(false);
      setHardDelete(false);
    }
  };

  // Get flavor ID for an item
  const getFlavorId = (flavorName: string): number => {
    const matchingFlavor = availableFlavors.find(f => f.name === flavorName);
    return matchingFlavor ? matchingFlavor.id : 9999;
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
    setNewItemData({ prepared: 0, unitCost: '' });
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
    const unitPrice = selectedRate.price;
    const unitCost = selectedRate.cost ?? 0;

    if (!delivery) return;

    const qty = newItemData.prepared || 0;

    try {
      const response = await fetch('/api/delivery-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryId: delivery.id,
          flavorName,
          prepared: qty,
          unitPrice,
          unitCost,
          rateId: selectedRate.id,
          revenue: qty * unitPrice,
          cogs: qty * unitCost,
          profit: qty * (unitPrice - unitCost),
        }),
      });

      if (!response.ok) throw new Error('Failed to add');

      const newItem: DeliveryItem = await response.json() as DeliveryItem;
      setItems(prev => [...prev, newItem]);
      setShowAddFlavor(false);
      resetAddFlavorForm();
      showToast('Flavor added');

      // Refresh delivery totals
      const deliveryResponse = await fetch(`/api/deliveries?id=${delivery.id}`);
      if (deliveryResponse.ok) {
        const updatedDelivery: Delivery = await deliveryResponse.json() as Delivery;
        setDelivery(updatedDelivery);
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

  const formatShortDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    return format(date, 'MMM d');
  };

  const updateDatePrepared = async (newDate: Date | null) => {
    if (!newDate || !delivery) return;

    const dateStr = newDate.toISOString().split('T')[0];

    // Optimistic update
    setDelivery((prev) => prev ? { ...prev, datePrepared: dateStr } : null);
    setEditingDatePrepared(false);

    try {
      const response = await fetch('/api/deliveries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: delivery.id, datePrepared: dateStr }),
      });

      if (!response.ok) throw new Error('Failed to update');
      showToast('Date updated');
    } catch {
      showToast('Failed to update date', 'error');
      fetch(`/api/deliveries?id=${deliveryId}`).then((res: Response) => res.json() as Promise<Delivery>).then(setDelivery);
    }
  };

  const updateDropoffDate = async (newDate: Date | null) => {
    if (!delivery) return;

    const dateStr = newDate ? newDate.toISOString().split('T')[0] : null;

    // Optimistic update
    setDelivery((prev) => prev ? { ...prev, dropoffDate: dateStr } : null);
    setEditingDropoffDate(false);

    try {
      const response = await fetch('/api/deliveries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: delivery.id, dropoffDate: dateStr }),
      });

      if (!response.ok) throw new Error('Failed to update');
      showToast('Dropoff date updated');
    } catch {
      showToast('Failed to update dropoff date', 'error');
      fetch(`/api/deliveries?id=${deliveryId}`).then((res: Response) => res.json() as Promise<Delivery>).then(setDelivery);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const updateDelivery = async (field: DeliveryField, value: string | number | null) => {
    if (!delivery) return;
    // Optimistic update
    setDelivery((prev) => prev ? { ...prev, [field]: value } : null);

    try {
      const response = await fetch('/api/deliveries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: delivery.id, [field]: value }),
      });

      if (!response.ok) throw new Error('Failed to update');
      showToast('Saved');
    } catch {
      showToast('Failed to save', 'error');
      fetch(`/api/deliveries?id=${deliveryId}`).then((res: Response) => res.json() as Promise<Delivery>).then(setDelivery);
    }
  };

  const updateItem = async (itemId: number, field: DeliveryItemField, value: number | null) => {
    const item = items.find(i => i.id === itemId);
    if (!item || !delivery) return;

    // Calculate derived values
    let updates: Partial<DeliveryItem> = { [field]: value };

    const prepared = field === 'prepared' ? (value as number) : item.prepared;
    const unsoldRaw = field === 'unsold' ? (value as number) : (item.unsold ?? 0);
    const unsold = Math.min(Math.max(unsoldRaw || 0, 0), prepared); // clamp 0 ≤ unsold ≤ prepared
    if (field === 'unsold') updates.unsold = unsold;
    const unitCost = field === 'unitCost' ? (value as number | null) : item.unitCost;

    // Effective sold = prepared - unsold (unsold returns to bakery, store doesn't pay)
    const effectiveSold = prepared - unsold;

    // Calculate revenue = effectiveSold * unitPrice
    const flavor = availableFlavors.find(f => f.name === item.flavorName);
    const unitPrice = item.unitPrice || flavor?.unitPrice || 5;
    const revenue = effectiveSold * unitPrice;
    updates.revenue = revenue;

    // COGS = prepared * unitCost (we made all of them regardless of returns)
    const cogs = unitCost ? prepared * unitCost : 0;
    updates.cogs = cogs;

    // Profit = revenue - cogs
    updates.profit = revenue - cogs;

    // Optimistic update
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...updates } : i));

    try {
      const response = await fetch('/api/delivery-items', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, deliveryId: delivery.id, ...updates }),
      });

      if (!response.ok) throw new Error('Failed to update');

      // Refresh delivery totals
      const deliveryResponse = await fetch(`/api/deliveries?id=${delivery.id}`);
      if (deliveryResponse.ok) {
        const updatedDelivery: Delivery = await deliveryResponse.json() as Delivery;
        setDelivery(updatedDelivery);
      }
    } catch {
      showToast('Failed to save', 'error');
      fetch(`/api/delivery-items?deliveryId=${deliveryId}`).then((res: Response) => res.json() as Promise<DeliveryItem[]>).then(setItems);
    }
  };

  const getRatesForFlavor = (flavorName: string): FlavorPrice[] => {
    const flavor = availableFlavors.find(f => f.name === flavorName);
    if (!flavor) return [];
    return flavorPrices.filter(p => p.flavorId === flavor.id);
  };

  const getSelectableRatesForItem = (item: DeliveryItem): FlavorPrice[] => {
    return getRatesForFlavor(item.flavorName).filter(rate => rate.isActive || rate.id === item.rateId);
  };

  const getMatchingRate = (item: DeliveryItem): string => {
    if (item.rateId) {
      const match = flavorPrices.find(p => p.id === item.rateId);
      if (match) return match.tierName;
    }
    // Fallback: match by price + cost
    const rates = getRatesForFlavor(item.flavorName);
    const match = rates.find(r => r.price === item.unitPrice && r.cost === item.unitCost);
    return match ? match.tierName : 'Custom';
  };

  const deleteItem = async (itemId: number) => {
    if (!delivery) return;
    // Optimistic update
    setItems(prev => prev.filter(i => i.id !== itemId));

    try {
      const response = await fetch('/api/delivery-items', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, deliveryId: delivery.id }),
      });

      if (!response.ok) throw new Error('Failed to delete');

      showToast('Item deleted');

      // Refresh delivery totals
      const deliveryResponse = await fetch(`/api/deliveries?id=${delivery.id}`);
      if (deliveryResponse.ok) {
        const updatedDelivery: Delivery = await deliveryResponse.json() as Delivery;
        setDelivery(updatedDelivery);
      }
    } catch {
      showToast('Failed to delete', 'error');
      fetch(`/api/delivery-items?deliveryId=${deliveryId}`).then((res: Response) => res.json() as Promise<DeliveryItem[]>).then(setItems);
    }
  };


  const getExpirationStatus = (expirationDate: string | null): { color: string; bgColor: string } => {
    if (!expirationDate) return { color: 'text-gray-500 dark:text-zinc-400', bgColor: 'bg-gray-100 dark:bg-[#1f1f1f]' };

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const expDate = new Date(expirationDate + 'T00:00:00');
    const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { color: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-950/40' };
    if (diffDays <= 2) return { color: 'text-orange-700 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-950/40' };
    return { color: 'text-green-700 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-950/40' };
  };

  const handleDownloadInvoice = async (overrideDelivery?: Delivery, overrideItems?: DeliveryItem[]) => {
    const targetDelivery = overrideDelivery ?? delivery;
    const targetItems = overrideItems ?? items;
    if (!targetDelivery) return;
    // Local aliases so the (very long) generation block below can keep using `delivery` / `items` names.
    const delivery = targetDelivery;
    const items = targetItems;

    try {
      const [{ jsPDF }, { mightySweetsLogo }, { geistRegular, geistMedium, geistSemiBold, geistMonoRegular }] = await Promise.all([
        import('jspdf'),
        import('@/fonts/bricolage-grotesque'),
        import('@/fonts/geist'),
      ]);
      const doc = new jsPDF();

      // Register Geist Sans (regular 400, medium 500, semibold 600) + Geist Mono (regular 400)
      // to match the project's typography system (see typography-preview.html).
      doc.addFileToVFS('Geist-Regular.ttf', geistRegular);
      doc.addFont('Geist-Regular.ttf', 'Geist', 'normal');
      doc.addFileToVFS('Geist-Medium.ttf', geistMedium);
      doc.addFont('Geist-Medium.ttf', 'Geist', 'normal', 500);
      doc.addFileToVFS('Geist-SemiBold.ttf', geistSemiBold);
      doc.addFont('Geist-SemiBold.ttf', 'Geist', 'bold');
      doc.addFileToVFS('GeistMono-Regular.ttf', geistMonoRegular);
      doc.addFont('GeistMono-Regular.ttf', 'GeistMono', 'normal');

      // Letter-spacing helper: spec is in CSS px; jsPDF setCharSpace uses doc units (mm).
      // 1px = 25.4/96 mm ≈ 0.2646 mm.
      const trackPxToMm = (px: number): number => px * (25.4 / 96);

      // Typography token applier. Sets font + size (pt = spec px) + char spacing in one call.
      type TypoFamily = 'sans' | 'mono';
      type TypoWeight = 'regular' | 'medium' | 'semibold';
      const applyTypo = (family: TypoFamily, size: number, weight: TypoWeight, trackingPx: number) => {
        const fontName = family === 'mono' ? 'GeistMono' : 'Geist';
        if (weight === 'semibold') {
          doc.setFont(fontName, 'bold');
        } else if (weight === 'medium') {
          doc.setFont(fontName, 'normal', 500);
        } else {
          doc.setFont(fontName, 'normal');
        }
        // px → pt (jsPDF setFontSize expects pt; spec is in CSS px). 1pt = 1.333px → pt = px * 0.75
        doc.setFontSize(size * 0.75);
        doc.setCharSpace(trackPxToMm(trackingPx));
      };

      // Token shortcuts (typography-preview.html lines 36-50):
      // text-title-1: sans 32 semibold -1.28 | text-title-2: sans 24 semibold -0.96
      // text-title-3: sans 20 semibold -0.4  | text-headline: sans 16 semibold -0.32
      // text-body:    sans 16 regular   0    | text-callout:  sans 14 regular  0
      // text-subheadline: sans 13 regular 0  | text-caption:  sans 12 regular  0
      // text-callout-mono: mono 14 regular 0 | text-caption-mono: mono 12 regular 0

      // Header "Invoice" — text-title-1
      applyTypo('sans', 32, 'semibold', -1.28);
      doc.setTextColor(30, 30, 30);
      doc.text('Invoice', 14, 20);

      // Logo on the right (original aspect ratio: 116x100)
      const logoW = 16;
      const logoH = logoW * (100 / 116);
      doc.addImage(mightySweetsLogo, 'PNG', 196 - logoW, 10, logoW, logoH);

      // Invoice meta lines — label : value aligned
      const shortDate = (d: string): string => {
        const date = new Date(d + 'T00:00:00');
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      };
      // Meta lines — labels in text-callout (sans 14 regular), values likewise; ID is mono
      doc.setTextColor(30, 30, 30);
      const metaLabelX = 14;
      const metaValX2 = 50;
      // "Invoice number" label — text-headline (sans 16 semibold -0.32) for emphasis
      applyTypo('sans', 16, 'semibold', -0.32);
      doc.text('Invoice number', metaLabelX, 35);
      // Numeric ID — text-callout-mono
      applyTypo('mono', 14, 'regular', 0);
      doc.text(`${delivery.id}`, metaValX2, 35);
      // Other meta — text-callout
      applyTypo('sans', 14, 'regular', 0);
      doc.text('Date of issue', metaLabelX, 40);
      doc.text(shortDate(delivery.datePrepared), metaValX2, 40);
      doc.text('Date due', metaLabelX, 45);
      doc.text(delivery.dropoffDate ? shortDate(delivery.dropoffDate) : '—', metaValX2, 45);

      // Company name — text-headline (section heading)
      applyTypo('sans', 16, 'semibold', -0.32);
      doc.text('Mighty Sweet Baking Co.', 14, 55);
      // Address lines — text-callout
      applyTypo('sans', 14, 'regular', 0);
      doc.text('Niskayuna, NY 12309', 14, 60);
      doc.text('United States', 14, 65);
      doc.text('hello@mightysweetbakingco.com', 14, 70);

      // Bill to section — right side
      const billToX = 90;
      // "Bill to" — text-headline
      applyTypo('sans', 16, 'semibold', -0.32);
      doc.text('Bill to', billToX, 55);
      // Store + country — text-callout
      applyTypo('sans', 14, 'regular', 0);
      doc.text(delivery.storeName, billToX, 60);
      doc.text('United States', billToX, 65);

      // Calculate invoice totals
      const subtotal = delivery.totalRevenue;
      const fees = delivery.additionalFees || 0;
      const disc = delivery.discount || 0;
      const invoiceTotal = subtotal + fees - disc;
      const amountDue = invoiceTotal - (delivery.prepaidAmount || 0);

      // Amount due hero — text-title-2 (sans 24 semibold -0.96)
      applyTypo('sans', 24, 'semibold', -0.96);
      doc.setTextColor(30, 30, 30);
      const dueDateStr = delivery.dropoffDate ? shortDate(delivery.dropoffDate) : '—';
      doc.text(`${formatCurrency(amountDue)} USD due ${dueDateStr}`, 14, 85);

      // Items table header — text-caption (sans 12 regular 0) for compact column labels
      const tableStartY = 100;
      applyTypo('sans', 12, 'semibold', -0.32);
      doc.setTextColor(30, 30, 30);

      const cols = ['Description', 'Qty', 'Unit price', 'Amount'];
      const colX = [14, 150, 173, 196];

      // Right-align numeric columns
      doc.text(cols[0], colX[0], tableStartY);
      doc.text(cols[1], colX[1], tableStartY, { align: 'right' });
      doc.text(cols[2], colX[2], tableStartY, { align: 'right' });
      doc.text(cols[3], colX[3], tableStartY, { align: 'right' });

      // Thin separator line under header
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(14, tableStartY + 3, 196, tableStartY + 3);

      // Items
      doc.setTextColor(60);
      const rowHeight = 7;
      let y = tableStartY + 9;

      items.forEach((item, idx) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }

        // Alternating row background (only if 3+ items)
        if (items.length >= 3 && idx % 2 === 0) {
          doc.setFillColor(245, 245, 245);
          doc.rect(14, y - 4.5, 182, rowHeight, 'F');
        }

        // Description in text-callout (sans), numerics in text-callout-mono
        doc.setTextColor(60);
        applyTypo('sans', 14, 'regular', 0);
        doc.text(item.flavorName, colX[0], y);
        applyTypo('mono', 14, 'regular', 0);
        doc.text(item.prepared.toString(), colX[1], y, { align: 'right' });
        doc.text(item.unitPrice ? formatCurrency(item.unitPrice) : '—', colX[2], y, { align: 'right' });
        doc.text(formatCurrency(item.revenue), colX[3], y, { align: 'right' });
        y += rowHeight;
      });

      // Thin separator before subtotal
      y += 3;
      doc.line(14, y - 5, 196, y - 5);

      // Subtotal — label text-callout (sans), value text-callout-mono
      doc.setTextColor(30, 30, 30);
      applyTypo('sans', 14, 'regular', 0);
      doc.text('Subtotal', colX[0], y);
      applyTypo('mono', 14, 'regular', 0);
      doc.text(formatCurrency(subtotal), colX[3], y, { align: 'right' });

      // Additional fees (if any)
      if (fees > 0) {
        y += rowHeight;
        applyTypo('sans', 14, 'regular', 0);
        doc.text('Additional fees', colX[0], y);
        applyTypo('mono', 14, 'regular', 0);
        doc.text(formatCurrency(fees), colX[3], y, { align: 'right' });
      }

      // Discount (if any)
      if (disc > 0) {
        y += rowHeight;
        applyTypo('sans', 14, 'regular', 0);
        doc.text('Discount', colX[0], y);
        applyTypo('mono', 14, 'regular', 0);
        doc.text(`-${formatCurrency(disc)}`, colX[3], y, { align: 'right' });
      }

      // Total — label text-callout, value text-callout-mono
      y += rowHeight;
      applyTypo('sans', 14, 'regular', 0);
      doc.text('Total', colX[0], y);
      applyTypo('mono', 14, 'regular', 0);
      doc.text(formatCurrency(invoiceTotal), colX[3], y, { align: 'right' });

      // Prepaid (if any)
      if ((delivery.prepaidAmount || 0) > 0) {
        y += rowHeight;
        applyTypo('sans', 14, 'regular', 0);
        doc.text('Prepaid', colX[0], y);
        applyTypo('mono', 14, 'regular', 0);
        doc.text(`-${formatCurrency(delivery.prepaidAmount)}`, colX[3], y, { align: 'right' });
      }

      // Amount due — emphasis label text-headline; value text-callout-mono
      y += rowHeight;
      doc.line(14, y - 5, 196, y - 5);
      applyTypo('sans', 16, 'semibold', -0.32);
      doc.text('Amount due', colX[0], y);
      applyTypo('mono', 14, 'regular', 0);
      doc.text(formatCurrency(amountDue), colX[3], y, { align: 'right' });

      // Instructions section header — text-headline (sans 16 semibold -0.32)
      y += 14;
      applyTypo('sans', 16, 'semibold', -0.32);
      doc.setTextColor(30, 30, 30);
      doc.text('Instructions', 14, y);
      const instrW = doc.getTextWidth('Instructions');
      doc.setDrawColor(30, 30, 30);
      doc.setLineWidth(0.4);
      doc.line(14, y + 1.2, 14 + instrW, y + 1.2);
      y += 7;

      // Line 1: Prepared on [date] — body text-callout, date text-callout-mono pink
      applyTypo('sans', 14, 'regular', 0);
      doc.setTextColor(60);
      const prepDate = new Date(delivery.datePrepared + 'T00:00:00');
      const prepDay = prepDate.toLocaleDateString('en-US', { weekday: 'long' });
      const prepFull = shortDate(delivery.datePrepared);
      const prepText = 'Prepared on ';
      const prepDateText = `${prepDay}, ${prepFull}`;
      doc.text(prepText, 14, y);
      const prepTextW = doc.getTextWidth(prepText);
      // Date in pink, text-callout-mono
      doc.setTextColor(236, 72, 153); // pink
      applyTypo('mono', 14, 'regular', 0);
      doc.text(prepDateText, 14 + prepTextW, y);

      // Line 2: Best before [date]
      if (delivery.expirationDate) {
        y += 6;
        applyTypo('sans', 14, 'regular', 0);
        doc.setTextColor(60);
        const expDate = new Date(delivery.expirationDate + 'T00:00:00');
        const expDay = expDate.toLocaleDateString('en-US', { weekday: 'long' });
        const expFull = shortDate(delivery.expirationDate);
        const expText = 'Best before ';
        const expDateText = `${expDay}, ${expFull}`;
        doc.text(expText, 14, y);
        const expTextW = doc.getTextWidth(expText);
        doc.setTextColor(236, 72, 153); // pink
        applyTypo('mono', 14, 'regular', 0);
        doc.text(expDateText, 14 + expTextW, y);
      }

      // Invoice notes section (if any)
      if (delivery.invoiceNotes && delivery.invoiceNotes.trim() && delivery.invoiceNotes !== '<p><br></p>') {
        y += 14;
        // "Additional notes" — text-headline (sans 16 semibold -0.32)
        applyTypo('sans', 16, 'semibold', -0.32);
        doc.setTextColor(30, 30, 30);
        doc.text('Additional notes', 14, y);
        const notesW = doc.getTextWidth('Additional notes');
        doc.setDrawColor(30, 30, 30);
        doc.setLineWidth(0.4);
        doc.line(14, y + 1.2, 14 + notesW, y + 1.2);
        y += 7;

        // Parse HTML from Quill and render with bold/italic/underline support.
        // Body text = text-callout (sans 14 regular).
        applyTypo('sans', 14, 'regular', 0);
        doc.setTextColor(60);
        const noteHtml = delivery.invoiceNotes;
        const tempDiv = typeof document !== 'undefined' ? document.createElement('div') : null;

        // Helper: render text via canvas (for italic — browser synthesizes italic from regular font)
        const renderViaCanvas = (text: string, x: number, yPos: number, opts: RenderViaCanvasOpts): { width: number; height: number } => {
          const dpr = 4;
          const ptSize = 14 * (96 / 72); // text-callout: 14pt → CSS px equivalent
          const pxSize = ptSize * dpr;
          const weight = opts.bold ? '600' : '400';
          const style = opts.italic ? 'italic' : 'normal';
          const cvs = document.createElement('canvas');
          const ctx = cvs.getContext('2d')!;
          ctx.font = `${style} ${weight} ${pxSize}px 'Geist', system-ui, sans-serif`;
          const measured = ctx.measureText(text);
          const w = Math.ceil(measured.width) + pxSize;
          const h = Math.ceil(pxSize * 1.4);
          cvs.width = w;
          cvs.height = h;
          ctx.font = `${style} ${weight} ${pxSize}px 'Geist', system-ui, sans-serif`;
          ctx.fillStyle = 'rgb(60,60,60)';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(text, 0, pxSize * 1.05);
          if (opts.underline) {
            ctx.strokeStyle = 'rgb(60,60,60)';
            ctx.lineWidth = pxSize * 0.06;
            const underY = pxSize * 1.15;
            ctx.beginPath();
            ctx.moveTo(0, underY);
            ctx.lineTo(measured.width, underY);
            ctx.stroke();
          }
          const dataUrl = cvs.toDataURL('image/png');
          const mmPerPx = 25.4 / (96 * dpr);
          const imgW = Math.min(w * mmPerPx, opts.maxWidth || 182);
          const imgH = h * mmPerPx;
          doc.addImage(dataUrl, 'PNG', x, yPos - imgH * 0.75, imgW, imgH);
          return { width: measured.width * mmPerPx, height: imgH };
        };

        // Helper: render a text segment with full formatting
        const renderText = (text: string, x: number, yPos: number, bold: boolean, italic: boolean, underline: boolean, maxW: number): void => {
          if (italic) {
            const { width } = renderViaCanvas(text, x, yPos, { bold, italic: true, underline, maxWidth: maxW });
            const lines = doc.splitTextToSize(text, maxW);
            y += lines.length * 5;
          } else {
            // Bold body uses semibold (600); plain body is text-callout regular.
            if (bold) {
              applyTypo('sans', 14, 'semibold', -0.32);
            } else {
              applyTypo('sans', 14, 'regular', 0);
            }
            doc.text(text, x, yPos, { maxWidth: maxW });
            if (underline) {
              const tw = doc.getTextWidth(text);
              doc.setDrawColor(60);
              doc.setLineWidth(0.3);
              doc.line(x, yPos + 1, x + tw, yPos + 1);
            }
            const lines = doc.splitTextToSize(text, maxW);
            y += lines.length * 5;
          }
        };

        if (tempDiv) {
          tempDiv.innerHTML = noteHtml;
          const processNode = (node: Node): void => {
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent || '';
              if (text.trim()) {
                applyTypo('sans', 14, 'regular', 0);
                doc.text(text, 14, y, { maxWidth: 182 });
                const lines = doc.splitTextToSize(text, 182);
                y += lines.length * 5;
              }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as HTMLElement;
              const tag = el.tagName.toLowerCase();

              // Check current tag, ancestors (closest), AND descendants (querySelector)
              const isBold = !!(tag === 'strong' || tag === 'b' || el.closest('strong, b') || el.querySelector('strong, b'));
              const isItalic = !!(tag === 'em' || tag === 'i' || el.closest('em, i') || el.querySelector('em, i'));
              const isUnderline = !!(tag === 'u' || el.closest('u') || el.querySelector('u'));

              if (tag === 'br') { y += 4; return; }

              if (el.children.length === 0) {
                // Leaf node — render with all accumulated formatting
                const text = el.textContent || '';
                if (text.trim()) renderText(text, 14, y, isBold, isItalic, isUnderline, 182);
              } else {
                // Has nested elements — recurse so inner tags (em, u, strong) get detected via el.closest()
                el.childNodes.forEach(child => processNode(child));
              }

              if (tag === 'p') y += 2;
            }
          };
          tempDiv.childNodes.forEach(child => processNode(child));
        }
      }

      // Made with ❤️ by Mighty Sweet Baking Co. — near footer, centered
      const pageHeight = doc.internal.pageSize.height;
      y = Math.max(y + 20, pageHeight - 18);
      // Footer = text-caption (sans 12 regular 0)
      applyTypo('sans', 12, 'regular', 0);
      const pageW = doc.internal.pageSize.width;
      const heartSize = 4; // mm

      // Render actual Apple ❤️ emoji on canvas → PNG
      const heartCanvas = document.createElement('canvas');
      heartCanvas.width = 128;
      heartCanvas.height = 128;
      const hctx = heartCanvas.getContext('2d')!;
      hctx.clearRect(0, 0, 128, 128);
      hctx.font = '110px "Apple Color Emoji"';
      hctx.textBaseline = 'top';
      hctx.fillText('❤️', 8, 8);
      const heartDataUrl = heartCanvas.toDataURL('image/png');

      // All text same style, measure for centering
      applyTypo('sans', 12, 'regular', 0);
      doc.setTextColor(100);
      const seg1 = 'Made with ';
      const seg2 = ' by ';
      const seg3 = 'Mighty Sweet Baking Co.';
      const seg1W = doc.getTextWidth(seg1);
      const seg2W = doc.getTextWidth(seg2);
      const seg3W = doc.getTextWidth(seg3);
      const totalW = seg1W + heartSize + seg2W + seg3W;
      let loveX = (pageW - totalW) / 2;

      // "Made with "
      doc.text(seg1, loveX, y);
      loveX += seg1W;

      // ❤️
      doc.addImage(heartDataUrl, 'PNG', loveX, y - 2.8, heartSize, heartSize);
      loveX += heartSize;

      // " by "
      doc.text(seg2, loveX, y);
      loveX += seg2W;

      // "Mighty Sweet Baking Co." — pink underlined
      doc.setTextColor(236, 72, 153);
      doc.text(seg3, loveX, y);
      doc.setDrawColor(236, 72, 153);
      doc.setLineWidth(0.3);
      doc.line(loveX, y + 1, loveX + seg3W, y + 1);

      // Open in new tab, with proper filename for save-as
      const pdfBlob = doc.output('blob');
      const pdfFile = new File([pdfBlob], `invoice_${delivery.id}.pdf`, { type: 'application/pdf' });
      const pdfUrl = URL.createObjectURL(pdfFile);
      window.open(pdfUrl, '_blank');
      showToast('Invoice opened');
    } catch {
      showToast('Failed to generate invoice', 'error');
    }
  };

  // Loading state
  if (loading || !delivery) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-3 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Calculated metrics
  const grossMargin = delivery.totalRevenue > 0
    ? ((delivery.grossProfit / delivery.totalRevenue) * 100).toFixed(1)
    : '0';

  const expirationStatus = getExpirationStatus(delivery.expirationDate);

  return (
    <div className="space-y-6">
      {/* Top Bar: Back link | Title | Buttons */}
      <div className="flex items-center gap-6">
        <a
          href="/deliveries"
          className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 dark:bg-zinc-100 px-4 py-2 text-button text-white dark:text-zinc-900 transition-colors hover:bg-gray-800 dark:hover:bg-zinc-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Deliveries
        </a>
        <div className="flex-1 min-w-0 flex justify-center">
          <EditableText
            value={delivery.storeName}
            onSave={(value) => updateDelivery('storeName', value)}
            className="text-title-2 text-gray-900 dark:text-zinc-100 hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
          />
        </div>
        <div className="shrink-0 w-[350px] grid grid-cols-2 gap-2">
          <button
            onClick={handleDownloadInvoice}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-pink-500 px-3 py-2 text-button text-white transition-colors hover:bg-pink-600 whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download Invoice
          </button>
          <HoldArchiveButton onArchive={handleArchive} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-9 xl:grid-cols-[1fr_350px] xl:items-start">
        <div className="space-y-2">

      {/* 75/25 Layout */}
      <div className="flex gap-6">
        {/* Left side - 75% */}
        <div className="flex-[3]">
          {/* Delivery Header Card */}
          <div className="rounded-3xl">
        <div className="hidden">
          <div className="min-w-0">
            <EditableText
              value={delivery.storeName}
              onSave={(value) => updateDelivery('storeName', value)}
              className="text-title-2 text-gray-900 dark:text-zinc-100"
            />
          </div>
          <button
            onClick={handleDownloadInvoice}
            className="absolute right-8 top-8 shrink-0 px-4 py-2 bg-pink-500 text-white rounded-xl text-button hover:bg-pink-600 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download Invoice
          </button>
        </div>

        {/* Stats Grid - Calculated Metrics + Delivery Info + Payments */}
        <div className="px-8 pb-6 grid grid-cols-1 gap-4 items-stretch">
            {/* Delivery Info — flat */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              className="hidden"
            >
              <div className="px-4 py-3">
                <h3 className="text-headline text-gray-900 dark:text-zinc-100">Delivery Info</h3>
              </div>
              <div className="px-4 space-y-3">
                {/* Date Prepared */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-headline text-gray-500 dark:text-zinc-400">Prepared</span>
                  <div className="relative">
                    <button
                      onClick={() => setEditingDatePrepared(!editingDatePrepared)}
                      className="text-headline text-gray-900 dark:text-zinc-100 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-gray-50 dark:hover:bg-[#171717] px-2 -ml-2 rounded transition-colors group/prep flex items-center gap-1.5"
                    >
                      {formatDetailDate(delivery.datePrepared)}
                      <svg className="text-gray-300 dark:text-zinc-700 group-hover/prep:text-gray-400 dark:group-hover/prep:text-zinc-500 shrink-0 transition-colors" style={{ width: '1em', height: '1em' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <AnimatePresence>
                      {editingDatePrepared && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setEditingDatePrepared(false)} />
                          <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-[#0a0a0a] rounded-2xl shadow-2xl border border-gray-100 dark:border-[#1f1f1f] p-4"
                          >
                            <DayPicker
                              mode="single"
                              selected={new Date(delivery.datePrepared + 'T00:00:00')}
                              defaultMonth={new Date(delivery.datePrepared + 'T00:00:00')}
                              onSelect={(date) => date && updateDatePrepared(date)}
                              className="!font-sans"
                            />
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Dropoff Date */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-headline text-gray-500 dark:text-zinc-400">Dropoff</span>
                  <div className="relative flex items-center gap-1">
                    {delivery.dropoffDate && (() => {
                      const dropoff = new Date(delivery.dropoffDate + 'T00:00:00');
                      const prepared = new Date(delivery.datePrepared + 'T00:00:00');
                      const expiration = delivery.expirationDate ? new Date(delivery.expirationDate + 'T00:00:00') : null;
                      const beforePrepared = dropoff < prepared;
                      const afterExpiration = expiration && dropoff > expiration;
                      if (!beforePrepared && !afterExpiration) return null;
                      const message = beforePrepared ? 'Dropoff is before date prepared' : 'Dropoff is after expiration';
                      return (
                        <div className="group/warn relative">
                          <svg className="w-5 h-5 text-amber-500 dark:text-amber-400 shrink-0 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                          <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover/warn:block">
                            <div className="bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-caption rounded-lg px-3 py-1.5 whitespace-nowrap shadow-lg">
                              {message}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    <button
                      onClick={() => setEditingDropoffDate(!editingDropoffDate)}
                      className="text-headline text-gray-900 dark:text-zinc-100 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-gray-50 dark:hover:bg-[#171717] px-2 -ml-2 rounded transition-colors group/drop flex items-center gap-1.5"
                    >
                      {delivery.dropoffDate
                        ? formatDetailDate(delivery.dropoffDate)
                        : 'Set date'
                      }
                      <svg className="text-gray-300 dark:text-zinc-700 group-hover/drop:text-gray-400 dark:group-hover/drop:text-zinc-500 shrink-0 transition-colors" style={{ width: '1em', height: '1em' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <AnimatePresence>
                      {editingDropoffDate && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setEditingDropoffDate(false)} />
                          <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-[#0a0a0a] rounded-2xl shadow-2xl border border-gray-100 dark:border-[#1f1f1f] p-4"
                          >
                            <DayPicker
                              mode="single"
                              selected={delivery.dropoffDate ? new Date(delivery.dropoffDate + 'T00:00:00') : undefined}
                              defaultMonth={delivery.dropoffDate ? new Date(delivery.dropoffDate + 'T00:00:00') : new Date(delivery.datePrepared + 'T00:00:00')}
                              onSelect={(date) => updateDropoffDate(date ?? null)}
                              className="!font-sans"
                            />
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Expiration Date */}
                <div className="flex flex-col gap-0.5 pt-3 mt-3 border-t border-gray-100 dark:border-[#1f1f1f]">
                  <span className="text-headline text-gray-500 dark:text-zinc-400">Expiration</span>
                  {delivery.expirationDate ? (
                    <span className={`text-headline px-2 -ml-2 ${expirationStatus.color} flex items-center gap-1.5`}>
                      {formatDetailDate(delivery.expirationDate)}
                      <svg className="invisible shrink-0" style={{ width: '1em', height: '1em' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </span>
                  ) : (
                    <span className="text-callout text-gray-400 dark:text-zinc-500 px-2 -ml-2 flex items-center gap-1.5">
                      Not set
                      <svg className="invisible shrink-0" style={{ width: '1em', height: '1em' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </span>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Payments — flat */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.25 }}
              className="hidden"
            >
              <div className="px-4 py-3">
                <h3 className="text-headline text-gray-900 dark:text-zinc-100">Payments Collected</h3>
              </div>
              <div className="px-4 space-y-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-headline text-gray-500 dark:text-zinc-400">Cash</span>
                  <EditableText
                    value={delivery.cashCollected ? formatCurrency(delivery.cashCollected) : '$0.00'}
                    onSave={(value) => updateDelivery('cashCollected', parseFloat(value.replace(/[$,]/g, '')) || 0)}
                    className="text-callout text-gray-900 dark:text-zinc-100 hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
                    allowEmpty
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-headline text-gray-500 dark:text-zinc-400">Venmo</span>
                  <EditableText
                    value={delivery.venmoCollected ? formatCurrency(delivery.venmoCollected) : '$0.00'}
                    onSave={(value) => updateDelivery('venmoCollected', parseFloat(value.replace(/[$,]/g, '')) || 0)}
                    className="text-callout text-gray-900 dark:text-zinc-100 hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
                    allowEmpty
                  />
                </div>
                <div className="flex flex-col gap-0.5 pt-3 mt-3 border-t border-gray-100 dark:border-[#1f1f1f]">
                  <span className="text-headline text-gray-500 dark:text-zinc-400">Total Collected</span>
                  <span className="text-callout px-2 -ml-2 text-green-600 dark:text-green-400 flex items-center gap-1.5">
                    <AnimatedNumber
                      value={(delivery.cashCollected || 0) + (delivery.venmoCollected || 0) + (delivery.otherCollected || 0)}
                      format={formatCurrency}
                    />
                  </span>
                </div>
              </div>
            </motion.div>

        </div>

        <div className="px-5 pt-0 pb-2 -mt-2">
          <h3 className="text-title-3 text-gray-900 dark:text-zinc-100">Flavors</h3>
          <p className="text-callout text-gray-900 dark:text-zinc-100 mt-1">
            {items.length === 0
              ? 'No flavors added to this delivery yet.'
              : `${items.length} flavor${items.length === 1 ? '' : 's'} on this delivery.`}
          </p>
        </div>

        {/* Details Section - inside same card */}
        <div className="px-5 pb-4 w-full">
          {items.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-zinc-500">
              <div>No flavors added to this delivery yet.</div>
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
                  <SortableHeader column="prepared" label="Prepared" currentSort={sortColumn} direction={sortDirection} onSort={handleSort} className="text-center" style={{ width: 80 }} />
                  <SortableHeader column="unsold" label="Unsold" currentSort={sortColumn} direction={sortDirection} onSort={handleSort} className="text-center" style={{ width: 96 }} />
                  <SortableHeader column="revenue" label="Revenue" currentSort={sortColumn} direction={sortDirection} onSort={handleSort} className="text-right" style={{ width: 96 }} />
                  <SortableHeader column="cogs" label="COGS" currentSort={sortColumn} direction={sortDirection} onSort={handleSort} className="text-right" style={{ width: 96 }} />
                  <SortableHeader column="profit" label="Profit" currentSort={sortColumn} direction={sortDirection} onSort={handleSort} className="text-right" style={{ width: 96 }} />
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
                              const newRevenue = item.prepared * rate.price;
                              const newCogs = item.prepared * (rate.cost ?? 0);
                              const allUpdates = {
                                unitPrice: rate.price,
                                unitCost: rate.cost ?? 0,
                                rateId: rate.id,
                                revenue: newRevenue,
                                cogs: newCogs,
                                profit: newRevenue - newCogs,
                              };
                              setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...allUpdates } : i));
                              fetch('/api/delivery-items', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: item.id, deliveryId: delivery?.id, ...allUpdates }),
                              }).then(async () => {
                                if (delivery) {
                                  const res = await fetch(`/api/deliveries?id=${delivery.id}`);
                                  if (res.ok) setDelivery(await res.json() as Delivery);
                                }
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
                      <EditableNumber
                        value={item.unsold ?? 0}
                        onSave={(val) => updateItem(item.id, 'unsold', val)}
                        className="w-full px-4 py-3 min-h-[44px] flex items-center justify-center text-gray-600 dark:text-zinc-400 text-callout text-center"
                        showPencil
                      />
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
                      {items.reduce((sum, i) => sum + (i.unsold ?? 0), 0)}
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
        </div>
      </div>

    </div>

      {/* Previous Deliveries to this store */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className="rounded-3xl"
      >
        <div className="px-5 pt-6 pb-2">
          <h3 className="text-title-3 text-gray-900 dark:text-zinc-100">Previous Deliveries</h3>
          <p className="text-callout text-gray-900 dark:text-zinc-100 mt-1">
            {previousDeliveries.length === 0
              ? `No prior deliveries to ${delivery.storeName}.`
              : `${previousDeliveries.length} previous deliver${previousDeliveries.length === 1 ? 'y' : 'ies'} to ${delivery.storeName}.`}
          </p>
        </div>

        {previousDeliveries.length > 0 && (
          <div className="px-5 pb-4">
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
                  <th style={{ width: 260 }}>Dropoff</th>
                  <th style={{ width: '100%' }}></th>
                  <th style={{ width: 260 }}>Date Prepared</th>
                  <th className="text-center" style={{ width: 80 }}>Prepared</th>
                  <th className="text-center" style={{ width: 96 }}>Unsold</th>
                  <th className="text-right" style={{ width: 96 }}>Revenue</th>
                  <th className="text-right" style={{ width: 96 }}>COGS</th>
                  <th className="text-right" style={{ width: 96 }}>Profit</th>
                  <th className="text-center" style={{ width: 100 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                {previousDeliveries.map((d) => (
                  <motion.tr
                    key={d.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    className="group cursor-pointer hover:bg-[#fafafa] dark:hover:bg-[#171717] transition-colors"
                    onClick={() => router.push(`/deliveries/${d.id}`)}
                  >
                    <td>
                      <span className="py-3 min-h-[44px] flex items-center justify-center text-pink-600 dark:text-pink-400 text-callout">
                        {d.id}
                      </span>
                    </td>
                    <td>
                      <span className="px-4 py-3 min-h-[44px] flex items-center text-gray-600 dark:text-zinc-400 text-callout whitespace-nowrap">
                        {d.dropoffDate ? formatDateFull(d.dropoffDate) : <span className="text-gray-300 dark:text-zinc-700">--</span>}
                      </span>
                    </td>
                    <td></td>
                    <td>
                      <span className="px-4 py-3 min-h-[44px] flex items-center text-gray-600 dark:text-zinc-400 text-callout whitespace-nowrap">
                        {formatDateFull(d.datePrepared)}
                      </span>
                    </td>
                    <td>
                      <span className="px-4 py-3 min-h-[44px] flex items-center justify-center text-gray-600 dark:text-zinc-400 text-callout">
                        {d.totalPrepared}
                      </span>
                    </td>
                    <td>
                      <span className="px-4 py-3 min-h-[44px] flex items-center justify-center text-gray-600 dark:text-zinc-400 text-callout">
                        {allDeliveryItems.filter(i => i.deliveryId === d.id).reduce((sum, i) => sum + (i.unsold ?? 0), 0)}
                      </span>
                    </td>
                    <td>
                      <span className="px-4 py-3 min-h-[44px] flex items-center justify-end whitespace-nowrap">
                        {d.totalRevenue > 0 ? (
                          <span className="text-gray-900 dark:text-zinc-100 text-callout">{formatCurrency(d.totalRevenue)}</span>
                        ) : (
                          <span className="text-gray-300 dark:text-zinc-700 text-callout">--</span>
                        )}
                      </span>
                    </td>
                    <td>
                      <span className="px-4 py-3 min-h-[44px] flex items-center justify-end whitespace-nowrap">
                        {d.totalCogs > 0 ? (
                          <span className="text-gray-600 dark:text-zinc-400 text-callout">{formatCurrency(d.totalCogs)}</span>
                        ) : (
                          <span className="text-gray-300 dark:text-zinc-700 text-callout">--</span>
                        )}
                      </span>
                    </td>
                    <td>
                      <span className="px-4 py-3 min-h-[44px] flex items-center justify-end whitespace-nowrap">
                        {d.grossProfit > 0 ? (
                          <span className="text-green-600 dark:text-green-400 text-callout">{formatCurrency(d.grossProfit)}</span>
                        ) : d.grossProfit < 0 ? (
                          <span className="text-red-500 dark:text-red-400 text-callout">{formatCurrency(d.grossProfit)}</span>
                        ) : (
                          <span className="text-gray-300 dark:text-zinc-700 text-callout">--</span>
                        )}
                      </span>
                    </td>
                    <td>
                      <div className="px-4 py-3 min-h-[44px] flex items-center justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const dItems = allDeliveryItems.filter(i => i.deliveryId === d.id);
                            handleDownloadInvoice(d, dItems);
                          }}
                          className="rounded-full w-24 py-1 text-button transition-all select-none text-center whitespace-nowrap bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 hover:text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/50 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"
                        >
                          Invoice
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
        </div>

        <div className="space-y-4">
          <div className="relative h-[350px] w-[350px] max-w-full overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#262626] dark:bg-[#0a0a0a]">
            {delivery.location ? (
              <AppleMap
                key={`payments-map-${delivery.id}-${delivery.location}`}
                location={delivery.location}
                markerTitle={delivery.storeName}
                span={0.16}
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
              value={delivery.location || ''}
              onSave={(value) => updateDelivery('location', value)}
              className="text-callout text-gray-900 dark:text-zinc-100 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-gray-50 dark:hover:bg-[#171717] px-2 -ml-2 rounded transition-colors"
            />
          </div>
          <div className="px-1 pt-1">
            <h3 className="text-headline text-gray-900 dark:text-zinc-100 mb-3">Delivery Info & Payments</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 items-start">
            <div>
              <div className="space-y-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-headline text-gray-500 dark:text-zinc-400">Prepared</span>
                  <div className="relative">
                    <button
                      onClick={() => setEditingDatePrepared(!editingDatePrepared)}
                      className="text-headline text-gray-900 dark:text-zinc-100 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-gray-50 dark:hover:bg-[#171717] px-2 -ml-2 rounded transition-colors group/prep-side flex items-center gap-1.5 whitespace-nowrap"
                    >
                      {formatDetailDate(delivery.datePrepared)}
                      <svg className="text-gray-300 dark:text-zinc-700 group-hover/prep-side:text-gray-400 dark:group-hover/prep-side:text-zinc-500 shrink-0 transition-colors" style={{ width: '1em', height: '1em' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <AnimatePresence>
                      {editingDatePrepared && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setEditingDatePrepared(false)} />
                          <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.15 }}
                            className="absolute left-0 top-full mt-2 z-50 bg-white dark:bg-[#0a0a0a] rounded-2xl shadow-2xl border border-gray-100 dark:border-[#1f1f1f] p-4"
                          >
                            <DayPicker
                              mode="single"
                              selected={new Date(delivery.datePrepared + 'T00:00:00')}
                              defaultMonth={new Date(delivery.datePrepared + 'T00:00:00')}
                              onSelect={(date) => date && updateDatePrepared(date)}
                              className="!font-sans"
                            />
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-headline text-gray-500 dark:text-zinc-400">Dropoff</span>
                  <div className="relative flex items-center gap-1">
                    <button
                      onClick={() => setEditingDropoffDate(!editingDropoffDate)}
                      className="text-headline text-gray-900 dark:text-zinc-100 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-gray-50 dark:hover:bg-[#171717] px-2 -ml-2 rounded transition-colors group/drop-side flex items-center gap-1.5 whitespace-nowrap"
                    >
                      {delivery.dropoffDate ? formatDetailDate(delivery.dropoffDate) : 'Set date'}
                      <svg className="text-gray-300 dark:text-zinc-700 group-hover/drop-side:text-gray-400 dark:group-hover/drop-side:text-zinc-500 shrink-0 transition-colors" style={{ width: '1em', height: '1em' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <AnimatePresence>
                      {editingDropoffDate && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setEditingDropoffDate(false)} />
                          <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.15 }}
                            className="absolute left-0 top-full mt-2 z-50 bg-white dark:bg-[#0a0a0a] rounded-2xl shadow-2xl border border-gray-100 dark:border-[#1f1f1f] p-4"
                          >
                            <DayPicker
                              mode="single"
                              selected={delivery.dropoffDate ? new Date(delivery.dropoffDate + 'T00:00:00') : undefined}
                              defaultMonth={delivery.dropoffDate ? new Date(delivery.dropoffDate + 'T00:00:00') : new Date(delivery.datePrepared + 'T00:00:00')}
                              onSelect={(date) => updateDropoffDate(date ?? null)}
                              className="!font-sans"
                            />
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-headline text-gray-500 dark:text-zinc-400">Expiration</span>
                  {delivery.expirationDate ? (
                    <span className={`text-headline px-2 -ml-2 ${expirationStatus.color} flex items-center gap-1.5 whitespace-nowrap`}>
                      {formatDetailDate(delivery.expirationDate)}
                    </span>
                  ) : (
                    <span className="text-callout text-gray-400 dark:text-zinc-500 px-2 -ml-2">Not set</span>
                  )}
                </div>
              </div>
            </div>
            <div>
              <div className="space-y-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-headline text-gray-500 dark:text-zinc-400">Cash</span>
                  <EditableText
                    value={delivery.cashCollected ? formatCurrency(delivery.cashCollected) : '$0.00'}
                    onSave={(value) => updateDelivery('cashCollected', parseFloat(value.replace(/[$,]/g, '')) || 0)}
                    className="text-callout text-gray-900 dark:text-zinc-100 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-gray-50 dark:hover:bg-[#171717] px-2 -ml-2 rounded transition-colors"
                    allowEmpty
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-headline text-gray-500 dark:text-zinc-400">Venmo</span>
                  <EditableText
                    value={delivery.venmoCollected ? formatCurrency(delivery.venmoCollected) : '$0.00'}
                    onSave={(value) => updateDelivery('venmoCollected', parseFloat(value.replace(/[$,]/g, '')) || 0)}
                    className="text-callout text-gray-900 dark:text-zinc-100 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-gray-50 dark:hover:bg-[#171717] px-2 -ml-2 rounded transition-colors"
                    allowEmpty
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-headline text-gray-500 dark:text-zinc-400">Total</span>
                  <span className="text-callout px-2 -ml-2 text-green-600 dark:text-green-400 flex items-center gap-1.5 whitespace-nowrap">
                    <AnimatedNumber
                      value={(delivery.cashCollected || 0) + (delivery.venmoCollected || 0) + (delivery.otherCollected || 0)}
                      format={formatCurrency}
                    />
                  </span>
                </div>
              </div>
            </div>
            </div>
          </div>
          <div className="px-1 py-5 delivery-detail-notes-editor">
            <div className="flex items-center justify-between mb-3 gap-3">
              <h3 className="text-headline text-gray-900 dark:text-zinc-100">Notes</h3>
              <div className="flex bg-[#fafafa] dark:bg-[#1f1f1f] rounded-full p-0.5 border border-gray-200 dark:border-[#262626]">
                <button
                  onClick={() => setNotesView('personal')}
                  className={`relative px-3 py-1 text-button rounded-full transition-colors ${
                    notesView === 'personal'
                      ? 'text-gray-900 dark:text-zinc-100'
                      : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
                  }`}
                >
                  {notesView === 'personal' && (
                    <motion.div
                      layoutId="notes-view-bg"
                      className="absolute inset-0 bg-white dark:bg-[#0a0a0a] shadow-sm rounded-full"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative">Personal</span>
                </button>
                <button
                  onClick={() => setNotesView('invoice')}
                  className={`relative px-3 py-1 text-button rounded-full transition-colors ${
                    notesView === 'invoice'
                      ? 'text-gray-900 dark:text-zinc-100'
                      : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
                  }`}
                >
                  {notesView === 'invoice' && (
                    <motion.div
                      layoutId="notes-view-bg"
                      className="absolute inset-0 bg-white dark:bg-[#0a0a0a] shadow-sm rounded-full"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative">Invoice</span>
                </button>
              </div>
            </div>
            {notesView === 'personal' ? (
              <NotesEditor
                key="personal-notes"
                content={delivery.notes || ''}
                onSave={(content) => updateDelivery('notes', content)}
              />
            ) : (
              <NotesEditor
                key="invoice-notes"
                content={delivery.invoiceNotes || ''}
                onSave={(content) => updateDelivery('invoiceNotes', content)}
              />
            )}
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
              <h3 className="text-title-3 text-gray-900 dark:text-zinc-100 mb-4">Add Flavor to Delivery</h3>

              <div className="mb-4">
                <label className="block text-callout text-gray-700 dark:text-zinc-300 mb-1">Select Flavor</label>
                <select
                  value={selectedFlavorId}
                  onChange={(e) => {
                    const flavorId = e.target.value ? parseInt(e.target.value) : '';
                    setSelectedFlavorId(flavorId);
                    // Auto-select first available rate for this flavor
                    if (flavorId) {
                      const rates = flavorPrices.filter(p => p.flavorId === flavorId && p.isActive);
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
                  <label className="block text-callout text-gray-700 dark:text-zinc-300 mb-1">Rate</label>
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
                <label className="block text-callout text-gray-700 dark:text-zinc-300 mb-1">Prepared Qty</label>
                <input
                  type="number"
                  value={newItemData.prepared}
                  onChange={(e) => setNewItemData(prev => ({ ...prev, prepared: parseInt(e.target.value) || 0 }))}
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

// Stat Card Component
function StatCard({ label, value, numericValue, formatNumeric, sublabel, valueClassName, index = 0 }: { label: string; value: string; numericValue?: number; formatNumeric?: (n: number) => string; sublabel?: string; valueClassName?: string; index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="p-4 rounded-2xl bg-[#fafafa] dark:bg-[#171717] h-full"
    >
      <p className="text-headline text-gray-700 dark:text-zinc-300">{label}</p>
      <p className={`text-title-2 mt-1 ${valueClassName ?? 'text-gray-900 dark:text-zinc-100'}`}>
        {numericValue !== undefined && formatNumeric ? (
          <AnimatedNumber value={numericValue} format={formatNumeric} />
        ) : (
          value
        )}
      </p>
      {sublabel && <p className="text-headline text-gray-500 dark:text-zinc-400 mt-1">{sublabel}</p>}
    </motion.div>
  );
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
        size={Math.max(editValue.length, 1)}
        className={`${className} bg-white dark:bg-[#0a0a0a] border-0 focus:ring-2 focus:ring-pink-500 rounded-lg px-2`}
      />
    );
  }

  return (
    <div onClick={() => setIsEditing(true)} className={`${className} cursor-text hover:bg-gray-50 dark:hover:bg-[#171717] rounded-lg px-2 -mx-2 whitespace-pre-wrap group/edit flex items-center gap-2`}>
      {value}
      <svg className="text-gray-300 dark:text-zinc-700 group-hover/edit:text-gray-400 dark:group-hover/edit:text-zinc-500 shrink-0 transition-colors" style={{ width: '1em', height: '1em' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </div>
  );
}

// Editable Number Component for table cells
// Address with the trailing 5-digit zip rendered in Geist Mono
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
    const numValue = Math.max(0, parseFloat(editValue) || 0);
    if (numValue !== value) {
      onSave(numValue);
    }
    setEditValue(numValue.toString());
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
          : "w-full text-right text-callout-mono bg-white dark:bg-[#0a0a0a] dark:text-zinc-100 border border-pink-300 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 rounded px-1 py-0.5"
        }
      />
    );
  }

  const pencilIcon = (
    <svg className="text-gray-300 dark:text-zinc-700 group-hover/num:text-gray-400 dark:group-hover/num:text-zinc-500 shrink-0 transition-colors" style={{ width: '1em', height: '1em' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );

  return (
    <span
      onClick={() => setIsEditing(true)}
      className={`${className || "editable-cell text-gray-600 dark:text-zinc-400 text-callout-mono text-center justify-center cursor-text"} group/num inline-flex items-center gap-1.5`}
    >
      {formatDisplay(value)}
      {(showPencil || inline) && pencilIcon}
    </span>
  );
}

// Simple Notes Textarea Component (no rich text editor)
function NotesEditor({ content, onSave }: { content: string; onSave: (content: string) => void }) {
  const [value, setValue] = useState(content || '');
  const [QuillComponent, setQuillComponent] = useState<QuillComponentType | null>(null);
  const lastSavedContent = useRef(content);

  useEffect(() => {
    let mounted = true;
    import('react-quill-new').then((mod) => {
      if (mounted) {
        import('react-quill-new/dist/quill.snow.css');
        setQuillComponent(() => mod.default as unknown as QuillComponentType);
      }
    });
    return () => { mounted = false; };
  }, []);

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
    if (value !== lastSavedContent.current) {
      lastSavedContent.current = value;
      onSave(value);
    }
  };

  const modules: QuillModules = { toolbar: false };
  const formats: string[] = [];

  if (!QuillComponent) {
    return (
      <div className="notes-editor">
        <div className="border border-gray-200 dark:border-[#262626] rounded-xl bg-white dark:bg-[#0a0a0a] min-h-[160px] p-4 text-gray-400 dark:text-zinc-500 text-callout">
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
    if (ready) {
      onDelete();
    }
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
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <button
      onMouseDown={startHold}
      onMouseUp={releaseHold}
      onMouseLeave={cancelHold}
      onTouchStart={startHold}
      onTouchEnd={releaseHold}
      className="relative overflow-hidden rounded-full w-20 py-1 text-button transition-all select-none text-center"
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

// Hold-to-Archive Button (styled like Download Invoice, fills with red as you hold)
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
      <span className="relative z-10">{progress >= 1 ? 'Release to Archive' : holding ? 'Hold to Archive…' : 'Archive Delivery'}</span>
    </button>
  );
}

// Sortable Header Component
type SortColumn = 'id' | 'flavorName' | 'prepared' | 'unsold' | 'revenue' | 'unitCost' | 'cogs' | 'profit';

function SortableHeader({
  column,
  label,
  currentSort,
  direction,
  onSort,
  className = '',
  style
}: {
  column: SortColumn;
  label: string;
  currentSort: SortColumn;
  direction: 'asc' | 'desc';
  onSort: (column: SortColumn) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const isActive = currentSort === column;

  return (
    <th
      className={`${className} cursor-pointer hover:bg-gray-50 dark:hover:bg-[#171717] transition-colors select-none`}
      onClick={() => onSort(column)}
      style={style}
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
