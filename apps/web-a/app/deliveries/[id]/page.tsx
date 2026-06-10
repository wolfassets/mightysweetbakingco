'use client';

import { use } from 'react';
import DeliveryDetail from '@/components/DeliveryDetail';

export default function DeliveryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <DeliveryDetail deliveryId={parseInt(id)} />;
}
