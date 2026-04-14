import type { SaleRecord } from '../types';

export function recordTotal(record: SaleRecord): string {
  const total = record.items.reduce(
    (sum, item) => sum + parseFloat(item.quantity) * parseFloat(item.sell_price),
    0
  );
  return total.toFixed(2);
}
