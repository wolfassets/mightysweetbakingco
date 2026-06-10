'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AuditLogRow {
  id: number;
  action: 'create' | 'update' | 'delete' | 'restore';
  entityType: 'flavor' | 'flavor_price' | 'event' | 'event_item' | 'delivery' | 'delivery_item';
  entityId: number;
  entityLabel: string | null;
  changedFields: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  createdAt: string;
}

const ENTITY_LABELS: Record<AuditLogRow['entityType'], string> = {
  flavor: 'Flavor',
  flavor_price: 'Rate',
  event: 'Event',
  event_item: 'Event item',
  delivery: 'Delivery',
  delivery_item: 'Delivery item',
};

const ACTION_BADGES: Record<AuditLogRow['action'], { label: string; className: string }> = {
  create: { label: 'Created', className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-900/60' },
  update: { label: 'Updated', className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/60' },
  delete: { label: 'Deleted', className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/60' },
  restore: { label: 'Restored', className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/60' },
};

function formatRelative(iso: string): string {
  const d = new Date(iso.endsWith('Z') || iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso.endsWith('Z') || iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string') {
    if (v.length > 80) return v.slice(0, 80) + '…';
    return v;
  }
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return JSON.stringify(v).slice(0, 80);
}

function safeParse<T = unknown>(s: string | null): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

export default function ActivityFeed(): React.ReactElement {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEntity, setFilterEntity] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch('/api/audit-log?limit=500')
      .then((r) => r.json() as Promise<AuditLogRow[]>)
      .then((data) => {
        setRows(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterEntity !== 'all' && r.entityType !== filterEntity) return false;
      if (filterAction !== 'all' && r.action !== filterAction) return false;
      if (search) {
        const s = search.toLowerCase();
        const label = (r.entityLabel || '').toLowerCase();
        if (!label.includes(s) && !String(r.entityId).includes(s)) return false;
      }
      return true;
    });
  }, [rows, filterEntity, filterAction, search]);

  // Group by day for the headers
  const groups = useMemo(() => {
    const map = new Map<string, AuditLogRow[]>();
    for (const r of filtered) {
      const d = new Date(r.createdAt.endsWith('Z') || r.createdAt.includes('T') ? r.createdAt : r.createdAt.replace(' ', 'T') + 'Z');
      const key = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()];
  }, [filtered]);

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full bg-white dark:bg-[#0a0a0a] rounded-3xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap px-8 pt-8 pb-4">
        <div>
          <h2 className="text-title-2 text-gray-900 dark:text-zinc-100">Activity</h2>
          <p className="text-body text-gray-700 dark:text-zinc-300 mt-1">
            {filtered.length === rows.length
              ? `${rows.length} recent action${rows.length === 1 ? '' : 's'} across the app.`
              : `Showing ${filtered.length} of ${rows.length} actions.`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search labels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 text-callout bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-[#262626] rounded-full focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-600 w-48"
          />
          <select
            value={filterEntity}
            onChange={(e) => setFilterEntity(e.target.value)}
            className="px-3 py-1.5 text-button-sm bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-[#262626] rounded-full text-gray-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-pink-500 cursor-pointer"
          >
            <option value="all">All types</option>
            <option value="flavor">Flavors</option>
            <option value="flavor_price">Rates</option>
            <option value="event">Events</option>
            <option value="event_item">Event items</option>
            <option value="delivery">Deliveries</option>
            <option value="delivery_item">Delivery items</option>
          </select>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-3 py-1.5 text-button-sm bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-[#262626] rounded-full text-gray-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-pink-500 cursor-pointer"
          >
            <option value="all">All actions</option>
            <option value="create">Created</option>
            <option value="update">Updated</option>
            <option value="delete">Deleted</option>
            <option value="restore">Restored</option>
          </select>
        </div>
      </div>

      {/* Feed */}
      <div className="px-8 pb-8">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-zinc-500">
            {rows.length === 0 ? 'No activity yet — start editing to see actions appear here.' : 'No actions match your filters.'}
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(([day, items]) => (
              <motion.div
                key={day}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25 }}
              >
                <h3 className="text-caption uppercase tracking-wider text-gray-400 dark:text-zinc-500 mb-3">{day}</h3>
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                  {items.map((row) => {
                    const badge = ACTION_BADGES[row.action];
                    const fields: string[] = row.changedFields ? safeParse<string[]>(row.changedFields) || [] : [];
                    const before = safeParse<Record<string, unknown>>(row.beforeJson);
                    const after = safeParse<Record<string, unknown>>(row.afterJson);
                    const isExpanded = expanded.has(row.id);
                    const hasDetail = !!(before || after);

                    return (
                      <motion.div
                        key={row.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                        className="bg-white dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#1f1f1f] rounded-2xl"
                      >
                        <button
                          type="button"
                          onClick={() => hasDetail && toggleExpanded(row.id)}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left ${hasDetail ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-[#171717]' : 'cursor-default'} transition-colors rounded-2xl`}
                        >
                          <span className={`text-button-sm px-2.5 py-0.5 rounded-full border whitespace-nowrap ${badge.className}`}>
                            {badge.label}
                          </span>
                          <span className="text-caption text-gray-500 dark:text-zinc-400 whitespace-nowrap">
                            {ENTITY_LABELS[row.entityType]}
                          </span>
                          <span className="text-callout text-gray-900 dark:text-zinc-100 truncate">
                            {row.entityLabel || `#${row.entityId}`}
                          </span>
                          {row.action === 'update' && fields.length > 0 && (
                            <span className="text-caption text-gray-500 dark:text-zinc-400 truncate">
                              {fields.length === 1
                                ? `changed ${fields[0]}`
                                : `changed ${fields.length} fields`}
                            </span>
                          )}
                          <span
                            className="ml-auto text-caption text-gray-400 dark:text-zinc-500 whitespace-nowrap"
                            title={formatAbsolute(row.createdAt)}
                          >
                            {formatRelative(row.createdAt)}
                          </span>
                          {hasDetail && (
                            <svg className={`w-4 h-4 text-gray-400 dark:text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </button>

                        <AnimatePresence initial={false}>
                          {isExpanded && hasDetail && (
                            <motion.div
                              key="detail"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 pb-4 border-t border-gray-100 dark:border-[#1f1f1f] pt-3">
                                {row.action === 'update' && fields.length > 0 ? (
                                  <div className="grid grid-cols-[120px_1fr_1fr] gap-x-4 gap-y-1">
                                    <div className="text-caption text-gray-500 dark:text-zinc-400">Field</div>
                                    <div className="text-caption text-gray-500 dark:text-zinc-400">Before</div>
                                    <div className="text-caption text-gray-500 dark:text-zinc-400">After</div>
                                    {fields.map((f) => (
                                      <React.Fragment key={f}>
                                        <div className="text-callout text-gray-700 dark:text-zinc-300">{f}</div>
                                        <div className="text-caption-mono text-red-600 dark:text-red-400 truncate" title={String(before?.[f] ?? '')}>
                                          {formatValue(before?.[f])}
                                        </div>
                                        <div className="text-caption-mono text-green-600 dark:text-green-400 truncate" title={String(after?.[f] ?? '')}>
                                          {formatValue(after?.[f])}
                                        </div>
                                      </React.Fragment>
                                    ))}
                                  </div>
                                ) : row.action === 'create' && after ? (
                                  <pre className="text-subheadline-mono text-gray-600 dark:text-zinc-400 overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(after, null, 2)}
                                  </pre>
                                ) : row.action === 'delete' && before ? (
                                  <pre className="text-subheadline-mono text-gray-600 dark:text-zinc-400 overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(before, null, 2)}
                                  </pre>
                                ) : (
                                  <p className="text-caption text-gray-400 dark:text-zinc-500">No changes recorded.</p>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
