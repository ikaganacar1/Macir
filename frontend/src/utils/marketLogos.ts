const LOGO_MAP: Record<string, string> = {
  bim: '/market-logos/bim.png',
  a101: '/market-logos/a101.png',
  carrefour: '/market-logos/carrefour.png',
  migros: '/market-logos/migros.png',
  sok: '/market-logos/sok.png',
  tarimkredi: '/market-logos/tarimkredi.png',
};

export function getMarketLogo(marketName: string): string | null {
  const key = marketName
    .toLowerCase()
    .replace(/[\s_]+/g, '')   // remove spaces AND underscores (API uses tarim_kredi)
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u');
  return LOGO_MAP[key] ?? null;
}

export const KNOWN_MARKETS = ['bim', 'a101', 'migros', 'carrefour', 'sok'];
