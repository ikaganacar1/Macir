import type { SaleRecord } from '../types';

export function recordTotal(record: SaleRecord): string {
  const total = record.items.reduce(
    (sum, item) => sum + parseFloat(item.quantity) * parseFloat(item.sell_price),
    0
  );
  return total.toFixed(2);
}

export function trFullDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
