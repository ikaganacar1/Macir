export function formatCurrency(n: string | number): string {
  return `₺${parseFloat(String(n)).toFixed(2)}`;
}

export function formatShortDate(s: string): string {
  const [, month, day] = s.split('-');
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  return `${parseInt(day)} ${months[parseInt(month) - 1]}`;
}

export function formatFullDate(s: string): string {
  const [year, month, day] = s.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
