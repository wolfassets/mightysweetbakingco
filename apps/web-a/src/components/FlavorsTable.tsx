import React, { useState, useRef, useEffect, useCallback, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function HoldArchiveButton({ onArchive }: { onArchive: () => void }) {
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
      onArchive();
    }
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
      className="relative overflow-hidden rounded-full w-16 py-1 text-button-sm transition-all select-none text-center"
      style={{
        background: holding
          ? `linear-gradient(90deg, rgba(239,68,68,${0.3 + progress * 0.7}) ${progress * 100}%, #fef2f2 ${progress * 100}%)`
          : '#fef2f2',
        color: progress > 0.5 ? 'white' : '#ef4444',
        border: `1px solid ${progress > 0 ? `rgba(239,68,68,${0.3 + progress * 0.7})` : '#fecaca'}`,
      }}
      title="Hold to archive"
    >
      {progress > 0 ? (progress >= 0.8 ? 'Release' : 'Hold...') : 'Archive'}
    </button>
  );
}

interface FlavorPrice {
  id: number;
  flavorId: number;
  tierName: string;
  price: number;
  cost: number | null;
  isActive: boolean;
}

interface Flavor {
  id: number;
  name: string;
  unitPrice: number;
  unitCost: number | null;
  isActive: boolean;
}

interface EditableCellProps {
  value: string;
  onSave: (value: string) => void;
  isEditing: boolean;
  onEdit: () => void;
  onBlur: () => void;
  type?: 'text' | 'currency';
  showPencil?: boolean;
  className?: string;
}

function EditableCell({ value, onSave, isEditing, onEdit, onBlur, type = 'text', showPencil = false, className = '' }: EditableCellProps) {
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value);
      onBlur();
    }
  };

  const handleSave = (): void => {
    if (editValue !== value) {
      onSave(editValue);
    }
    onBlur();
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`editable-cell w-full bg-white border-0 focus:ring-2 focus:ring-pink-500 rounded-lg ${className}`}
      />
    );
  }

  return (
    <div
      onClick={onEdit}
      className={`editable-cell cursor-text group/edit flex items-center gap-1.5 ${className}`}
    >
      {showPencil && (
        <svg className="text-gray-300 dark:text-zinc-700 group-hover/edit:text-gray-400 dark:group-hover/edit:text-zinc-500 shrink-0 transition-colors" style={{ width: '1em', height: '1em' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      )}
      {value}
    </div>
  );
}

export default function FlavorsTable() {
  const [flavors, setFlavors] = useState<Flavor[]>([]);
  const [flavorPrices, setFlavorPrices] = useState<FlavorPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [editingCell, setEditingCell] = useState<{ id: number; field: string; table: 'flavor' | 'price' } | null>(null);
  const [newFlavorId, setNewFlavorId] = useState<number | null>(null);
  const [addingPriceFor, setAddingPriceFor] = useState<number | null>(null);
  const [newTierName, setNewTierName] = useState('');
  const [newTierPrice, setNewTierPrice] = useState('');
  const [newTierCost, setNewTierCost] = useState('');
  const newTierNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/flavors').then((r: Response) => r.json() as Promise<Flavor[]>),
      fetch('/api/flavor-prices').then((r: Response) => r.json() as Promise<FlavorPrice[]>),
    ])
      .then(([flavorsData, pricesData]: [Flavor[], FlavorPrice[]]) => {
        setFlavors(flavorsData.sort((a: Flavor, b: Flavor) => b.id - a.id));
        setFlavorPrices(pricesData);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        showToast('Failed to load flavors', 'error');
      });
  }, []);

  useEffect(() => {
    if (addingPriceFor && newTierNameRef.current) {
      newTierNameRef.current.focus();
    }
  }, [addingPriceFor]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  const getPricesForFlavor = (flavorId: number): FlavorPrice[] =>
    flavorPrices
      .filter(p => p.flavorId === flavorId)
      .sort((a, b) => {
        if (a.tierName === 'Base') return -1;
        if (b.tierName === 'Base') return 1;
        return a.id - b.id;
      });

  const updateFlavor = async (id: number, field: keyof Flavor, value: string): Promise<void> => {
    const numValue: string | number | null = field === 'name' ? value : (value === '' || value === '\u2014' ? null : parseFloat(value) || 0);
    setFlavors(prev => prev.map(f => (f.id === id ? { ...f, [field]: numValue } : f)));

    try {
      const response = await fetch('/api/flavors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, [field]: numValue }),
      });
      if (!response.ok) throw new Error('Failed to update');
      showToast('Saved');
    } catch {
      showToast('Failed to save', 'error');
      fetch('/api/flavors').then((r: Response) => r.json() as Promise<Flavor[]>).then(setFlavors);
    }
  };

  const updateFlavorPrice = async (id: number, field: keyof FlavorPrice, value: string): Promise<void> => {
    const numValue: string | number | null = field === 'tierName' ? value : (value === '' || value === '\u2014' ? null : parseFloat(value) || 0);
    setFlavorPrices(prev => prev.map(p => (p.id === id ? { ...p, [field]: numValue } : p)));

    try {
      const response = await fetch('/api/flavor-prices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, [field]: numValue }),
      });
      if (!response.ok) throw new Error('Failed to update');
      showToast('Saved');
    } catch {
      showToast('Failed to save', 'error');
      fetch('/api/flavor-prices').then((r: Response) => r.json() as Promise<FlavorPrice[]>).then(setFlavorPrices);
    }
  };

  const addFlavor = async (): Promise<void> => {
    try {
      const response = await fetch('/api/flavors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Flavor', unitPrice: 5, unitCost: null }),
      });
      if (!response.ok) throw new Error('Failed to add');
      const newFlavor: Flavor = await response.json();
      setFlavors(prev => [newFlavor, ...prev]);
      setNewFlavorId(newFlavor.id);
      setTimeout(() => setNewFlavorId(null), 3000);
      showToast('Added new flavor');
    } catch {
      showToast('Failed to add flavor', 'error');
    }
  };

  const addPriceTier = async (flavorId: number): Promise<void> => {
    const tierName = newTierName.trim() || 'New Rate';
    try {
      const response = await fetch('/api/flavor-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flavorId,
          tierName: tierName,
          price: parseFloat(newTierPrice) || 0,
          cost: newTierCost ? parseFloat(newTierCost) : null,
        }),
      });
      if (!response.ok) throw new Error('Failed to add');
      const newPrice: FlavorPrice = await response.json();
      setFlavorPrices(prev => [...prev, newPrice]);
      setAddingPriceFor(null);
      setNewTierName('');
      setNewTierPrice('');
      setNewTierCost('');
      showToast('Added pricing tier');
    } catch {
      showToast('Failed to add pricing tier', 'error');
    }
  };

  const archiveFlavor = async (id: number): Promise<void> => {
    try {
      const response = await fetch('/api/flavors', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error('Failed to archive');
      setFlavors(prev => prev.filter(f => f.id !== id));
      setFlavorPrices(prev => prev.filter(p => p.flavorId !== id));
      showToast('Flavor archived');
    } catch {
      showToast('Failed to archive flavor', 'error');
    }
  };

  const archivePrice = async (id: number): Promise<void> => {
    try {
      const response = await fetch('/api/flavor-prices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error('Failed to archive');
      setFlavorPrices(prev => prev.filter(p => p.id !== id));
      showToast('Rate archived');
    } catch {
      showToast('Failed to archive rate', 'error');
    }
  };

  const formatMargin = (price: number, cost: number | null): React.ReactElement => {
    if (cost == null || price <= 0) return <span className="text-gray-300 dark:text-zinc-700">{'\u2014'}</span>;
    const margin = ((price - cost) / price) * 100;
    return <span className="text-green-600 dark:text-green-400 text-callout-mono">{margin.toFixed(0)}%</span>;
  };

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
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full bg-white dark:bg-[#0a0a0a] rounded-3xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-8 pt-8 pb-6">
          <div>
            <h2 className="text-title-2 text-gray-900 dark:text-zinc-100">Flavors</h2>
            <p className="text-callout text-gray-400 dark:text-zinc-500 mt-1">Click any cell to edit inline.</p>
          </div>
          <button
            onClick={addFlavor}
            className="animated-border px-5 py-2.5 text-white rounded-full text-button transition-all flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Flavor
          </button>
        </div>

        <div className="px-4 pb-4">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-12 text-center">#</th>
                <th>Name / Tier</th>
                <th className="w-28">Unit Price</th>
                <th className="w-28">Unit Cost</th>
                <th className="w-24">Margin</th>
                <th className="w-20"></th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
              {flavors.map((flavor, index) => {
                const prices = getPricesForFlavor(flavor.id);

                return (
                  <Fragment key={flavor.id}>
                    {/* Main flavor row: #, Name, delete */}
                    <motion.tr
                      key={`flavor-${flavor.id}`}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                      className={`group transition-colors duration-1000 ${newFlavorId === flavor.id ? 'bg-pink-50 dark:bg-pink-950/40' : ''}`}
                    >
                      <td className="text-center">
                        <span className="text-gray-400 dark:text-zinc-500 text-callout-mono">{flavors.length - index}</span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <EditableCell
                            value={flavor.name}
                            onSave={(value) => updateFlavor(flavor.id, 'name', value)}
                            isEditing={editingCell?.id === flavor.id && editingCell?.field === 'name' && editingCell?.table === 'flavor'}
                            onEdit={() => setEditingCell({ id: flavor.id, field: 'name', table: 'flavor' })}
                            onBlur={() => setEditingCell(null)}
                            showPencil
                          />
                        </div>
                      </td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td>
                        <button
                          onClick={() => setAddingPriceFor(addingPriceFor === flavor.id ? null : flavor.id)}
                          className="rounded-full px-3 py-1 text-button-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900/50 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors whitespace-nowrap"
                        >
                          Add rate
                        </button>
                      </td>
                      <td>
                        <HoldArchiveButton onArchive={() => archiveFlavor(flavor.id)} />
                      </td>
                    </motion.tr>

                    {/* Rate rows — all from flavor_prices, all equal */}
                    {prices.map(price => (
                      <motion.tr
                        key={`price-${price.id}`}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                        className="bg-gray-50/50 dark:bg-[#171717]/50"
                      >
                        <td></td>
                        <td>
                          <div className="flex items-center gap-2 pl-6">
                            <span className="text-gray-300 dark:text-zinc-700 text-callout">{'\u2514'}</span>
                            <EditableCell
                              value={price.tierName}
                              onSave={(value) => updateFlavorPrice(price.id, 'tierName', value)}
                              isEditing={editingCell?.id === price.id && editingCell?.field === 'tierName' && editingCell?.table === 'price'}
                              onEdit={() => setEditingCell({ id: price.id, field: 'tierName', table: 'price' })}
                              onBlur={() => setEditingCell(null)}
                              showPencil
                              className="text-callout text-gray-600 dark:text-zinc-400"
                            />
                          </div>
                        </td>
                        <td>
                          <EditableCell
                            value={`$${price.price.toFixed(2)}`}
                            onSave={(value) => updateFlavorPrice(price.id, 'price', value.replace('$', ''))}
                            isEditing={editingCell?.id === price.id && editingCell?.field === 'price' && editingCell?.table === 'price'}
                            onEdit={() => setEditingCell({ id: price.id, field: 'price', table: 'price' })}
                            onBlur={() => setEditingCell(null)}
                            type="currency"
                            showPencil
                            className="text-callout-mono"
                          />
                        </td>
                        <td>
                          <EditableCell
                            value={price.cost != null ? `$${price.cost.toFixed(2)}` : '\u2014'}
                            onSave={(value) => updateFlavorPrice(price.id, 'cost', value.replace('$', '').replace('\u2014', ''))}
                            isEditing={editingCell?.id === price.id && editingCell?.field === 'cost' && editingCell?.table === 'price'}
                            onEdit={() => setEditingCell({ id: price.id, field: 'cost', table: 'price' })}
                            onBlur={() => setEditingCell(null)}
                            type="currency"
                            showPencil
                            className="text-callout-mono"
                          />
                        </td>
                        <td>
                          <span className="editable-cell text-callout">
                            {formatMargin(price.price, price.cost)}
                          </span>
                        </td>
                        <td></td>
                        <td>
                          <HoldArchiveButton onArchive={() => archivePrice(price.id)} />
                        </td>
                      </motion.tr>
                    ))}

                    {/* Add new tier row */}
                    <AnimatePresence>
                    {addingPriceFor === flavor.id ? (
                      <motion.tr
                        key={`add-tier-${flavor.id}`}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="bg-pink-50/30 dark:bg-pink-950/20"
                      >
                        <td></td>
                        <td>
                          <div className="flex items-center gap-2 pl-6">
                            <span className="text-gray-300 dark:text-zinc-700 text-callout">{'\u2514'}</span>
                            <input
                              ref={newTierNameRef}
                              type="text"
                              placeholder="Tier name..."
                              value={newTierName}
                              onChange={e => setNewTierName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') addPriceTier(flavor.id);
                                if (e.key === 'Escape') { setAddingPriceFor(null); setNewTierName(''); setNewTierPrice(''); setNewTierCost(''); }
                              }}
                              className="editable-cell w-full bg-white border-0 focus:ring-2 focus:ring-pink-500 rounded-lg text-callout"
                            />
                          </div>
                        </td>
                        <td>
                          <input
                            type="text"
                            placeholder="$0.00"
                            value={newTierPrice}
                            onChange={e => setNewTierPrice(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') addPriceTier(flavor.id);
                              if (e.key === 'Escape') { setAddingPriceFor(null); setNewTierName(''); setNewTierPrice(''); setNewTierCost(''); }
                            }}
                            className="editable-cell w-full bg-white border-0 focus:ring-2 focus:ring-pink-500 rounded-lg text-callout-mono"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            placeholder="$0.00"
                            value={newTierCost}
                            onChange={e => setNewTierCost(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') addPriceTier(flavor.id);
                              if (e.key === 'Escape') { setAddingPriceFor(null); setNewTierName(''); setNewTierPrice(''); setNewTierCost(''); }
                            }}
                            className="editable-cell w-full bg-white border-0 focus:ring-2 focus:ring-pink-500 rounded-lg text-callout-mono"
                          />
                        </td>
                        <td></td>
                        <td>
                          <div className="flex gap-1">
                            <button
                              onClick={() => addPriceTier(flavor.id)}
                              className="p-1.5 text-green-500 dark:text-green-400 hover:text-green-600 dark:hover:text-green-300"
                              title="Save"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            <button
                              onClick={() => { setAddingPriceFor(null); setNewTierName(''); setNewTierPrice(''); setNewTierCost(''); }}
                              className="p-1.5 text-gray-400 dark:text-zinc-500 hover:text-gray-500 dark:hover:text-zinc-400"
                              title="Cancel"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ) : null}
                    </AnimatePresence>
                  </Fragment>
                );
              })}
              </AnimatePresence>
            </tbody>
          </table>

          {flavors.length === 0 && (
            <div className="text-center py-12 text-callout text-gray-400 dark:text-zinc-500">
              No flavors yet. Click &quot;Add Flavor&quot; to get started.
            </div>
          )}
        </div>
      </motion.div>

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
