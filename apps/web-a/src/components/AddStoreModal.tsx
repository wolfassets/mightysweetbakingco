'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

interface AddStoreModalProps {
  open: boolean;
  onClose: () => void;
  deliveries: Delivery[];
  onCreated: (newDelivery: Delivery) => void;
}

const normalizeStore = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export default function AddStoreModal({ open, onClose, deliveries, onCreated }: AddStoreModalProps): React.ReactElement | null {
  const [mode, setMode] = useState<'choice' | 'existing' | 'new'>('choice');
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [newStoreName, setNewStoreName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setMode('choice');
      setSelectedStore('');
      setNewStoreName('');
    }
  }, [open]);

  const uniqueStores = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of deliveries) {
      if (d.deletedAt) continue;
      const key = normalizeStore(d.storeName);
      if (!seen.has(key)) seen.set(key, d.storeName.trim());
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [deliveries]);

  const handleSubmit = async () => {
    const storeName = mode === 'existing' ? selectedStore : newStoreName.trim();
    if (!storeName) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName,
          datePrepared: new Date().toISOString().split('T')[0],
        }),
      });
      if (!res.ok) throw new Error('Failed to create');
      const created: Delivery = await res.json();
      onCreated(created);
      onClose();
    } catch {
      setSubmitting(false);
    }
  };

  const choiceContent = (
    <>
      <h3 className="text-title-3 text-gray-900 dark:text-zinc-100 mb-1">New Delivery</h3>
      <p className="text-callout text-gray-500 dark:text-zinc-400 mb-5">Pick an existing store, or add a new one.</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setMode('existing')}
          disabled={uniqueStores.length === 0}
          className="p-5 border border-gray-200 dark:border-[#262626] rounded-2xl hover:border-pink-500 dark:hover:border-pink-400 hover:bg-pink-50/50 dark:hover:bg-pink-950/30 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-200 dark:disabled:hover:border-[#262626] disabled:hover:bg-transparent"
        >
          <svg className="w-7 h-7 text-pink-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9l2-5h14l2 5M3 9v10a1 1 0 001 1h16a1 1 0 001-1V9M3 9h18M9 14h6" />
          </svg>
          <div className="text-headline text-gray-900 dark:text-zinc-100">Existing store</div>
          <div className="text-caption text-gray-500 dark:text-zinc-400 mt-0.5">{uniqueStores.length} store{uniqueStores.length === 1 ? '' : 's'} on file</div>
        </button>
        <button
          onClick={() => setMode('new')}
          className="p-5 border border-gray-200 dark:border-[#262626] rounded-2xl hover:border-pink-500 dark:hover:border-pink-400 hover:bg-pink-50/50 dark:hover:bg-pink-950/30 transition-all text-left"
        >
          <svg className="w-7 h-7 text-pink-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v16m8-8H4" />
          </svg>
          <div className="text-headline text-gray-900 dark:text-zinc-100">New store</div>
          <div className="text-caption text-gray-500 dark:text-zinc-400 mt-0.5">Type a name from scratch</div>
        </button>
      </div>
      <div className="mt-5 flex justify-end">
        <button onClick={onClose} className="px-4 py-2 text-button text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-[#171717] rounded-lg transition-colors">
          Cancel
        </button>
      </div>
    </>
  );

  const existingContent = (
    <>
      <button onClick={() => setMode('choice')} className="text-caption text-gray-500 dark:text-zinc-400 hover:text-pink-600 dark:hover:text-pink-400 transition-colors mb-3 flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back
      </button>
      <h3 className="text-title-3 text-gray-900 dark:text-zinc-100 mb-1">Existing store</h3>
      <p className="text-callout text-gray-500 dark:text-zinc-400 mb-4">Pick the store for this delivery.</p>

      <label className="block text-caption uppercase tracking-wider text-gray-500 dark:text-zinc-400 mb-1.5">Store</label>
      <select
        value={selectedStore}
        onChange={(e) => setSelectedStore(e.target.value)}
        className="w-full px-3 py-2 mb-5 text-callout bg-gray-50 dark:bg-[#171717] border border-gray-200 dark:border-[#262626] rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-900 dark:text-zinc-100"
      >
        <option value="">Choose a store...</option>
        {uniqueStores.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-button text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-[#171717] rounded-lg transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!selectedStore || submitting}
          className="px-4 py-2 text-button bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Creating...' : 'Create delivery'}
        </button>
      </div>
    </>
  );

  const newContent = (
    <>
      <button onClick={() => setMode('choice')} className="text-caption text-gray-500 dark:text-zinc-400 hover:text-pink-600 dark:hover:text-pink-400 transition-colors mb-3 flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back
      </button>
      <h3 className="text-title-3 text-gray-900 dark:text-zinc-100 mb-1">New store</h3>
      <p className="text-callout text-gray-500 dark:text-zinc-400 mb-4">Type the name of the new store.</p>

      <label className="block text-caption uppercase tracking-wider text-gray-500 dark:text-zinc-400 mb-1.5">Store name</label>
      <input
        type="text"
        value={newStoreName}
        onChange={(e) => setNewStoreName(e.target.value)}
        placeholder="e.g. Sweet Spot Bakery"
        autoFocus
        className="w-full px-3 py-2 mb-5 text-callout bg-gray-50 dark:bg-[#171717] border border-gray-200 dark:border-[#262626] rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-600"
      />

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-button text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-[#171717] rounded-lg transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!newStoreName.trim() || submitting}
          className="px-4 py-2 text-button bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Creating...' : 'Create delivery'}
        </button>
      </div>
    </>
  );

  const modeContent = mode === 'choice' ? choiceContent : mode === 'existing' ? existingContent : newContent;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />
          <motion.div
            key="container"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="bg-white dark:bg-[#0a0a0a] dark:border dark:border-[#262626] rounded-2xl shadow-2xl w-full max-w-md p-6 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.18 }}
                >
                  {modeContent}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
