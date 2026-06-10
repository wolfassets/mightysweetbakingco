'use client';

import { use } from 'react';
import EventDetail from '@/components/EventDetail';

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <EventDetail eventId={parseInt(id)} />;
}
