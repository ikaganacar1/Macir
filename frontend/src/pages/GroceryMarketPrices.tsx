import {
  Box,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconChevronDown,
  IconChevronUp,
  IconSearch,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, endpoints } from '../api';
import type { MarketPriceResult, MarketStore, Product } from '../types';
import { getMarketLogo } from '../utils/marketLogos';

const DEFAULT_PRODUCTS = [
  'Domates', 'Patates', 'Soğan', 'Elma',
  'Muz', 'Biber', 'Salatalık', 'Patlıcan',
];

const DISPLAY_MARKETS = ['bim', 'a101', 'migros', 'carrefour'];

function MarketLogo({ market, size = 20 }: { market: string; size?: number }) {
  const logo = getMarketLogo(market);
  if (logo) {
    return (
      <img
        src={logo}
        alt={market}
        style={{ height: size, width: 'auto', maxWidth: size * 2.5, objectFit: 'contain', display: 'block' }}
      />
    );
  }
  return <Text size='xs' fw={600}>{market.toUpperCase()}</Text>;
}

function getPriceForMarket(results: MarketPriceResult[], market: string): number | null {
  for (const result of results) {
    const store = result.cheapest_stores.find(
      (s) => s.market.toLowerCase() === market.toLowerCase()
    );
    if (store) return store.price;
  }
  return null;
}

function ProductPriceCard({ name }: { name: string }) {
  const { data, isLoading } = useQuery<{ results: MarketPriceResult[] }>({
    queryKey: ['market-prices', name.toLowerCase()],
    queryFn: () =>
      api.get(endpoints.marketPrices, { params: { q: name } }).then((r) => r.data),
    staleTime: 30 * 60 * 1000,
  });

  const results = data?.results ?? [];
  const hasAnyPrice = DISPLAY_MARKETS.some((m) => getPriceForMarket(results, m) !== null);

  return (
    <Paper withBorder p='sm' style={{ border: '1px solid #e8f5e9' }}>
      <Text fw={600} size='sm' mb='xs'>{name}</Text>
      {isLoading ? (
        <Stack gap={4}>
          <Skeleton height={16} radius='sm' />
          <Skeleton height={16} radius='sm' />
        </Stack>
      ) : !hasAnyPrice ? (
        <Text size='xs' c='dimmed'>Veri bulunamadı</Text>
      ) : (
        <Stack gap={4}>
          {DISPLAY_MARKETS.map((market) => {
            const price = getPriceForMarket(results, market);
            if (price === null) return null;
            return (
              <Group key={market} justify='space-between' align='center'>
                <MarketLogo market={market} size={16} />
                <Text size='xs' fw={500}>₺{price.toFixed(2)}</Text>
              </Group>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}

function WelcomeScreen({ products }: { products: Product[] }) {
  const activeNames = products
    .filter((p) => p.is_active)
    .map((p) => p.name);

  const displayNames = activeNames.length > 0 ? activeNames : DEFAULT_PRODUCTS;

  return (
    <Stack gap='md' px='md' pt='xs' pb='xl'>
      {/* Hero */}
      <Box
        p='md'
        style={{
          background: 'linear-gradient(135deg, #f1f8f4 0%, #e8f5e9 100%)',
          borderRadius: 12,
          border: '1px solid #c8e6c9',
        }}
      >
        <Text fw={700} size='lg' c='green.8'>Piyasa Fiyatları</Text>
        <Text size='sm' c='dimmed' mt={4}>
          Türkiye'nin büyük marketlerinden anlık fiyat karşılaştırması
        </Text>
        <Group gap='sm' mt='sm'>
          {DISPLAY_MARKETS.map((market) => (
            <MarketLogo key={market} market={market} size={22} />
          ))}
        </Group>
      </Box>

      {/* Product price grid */}
      <Text size='xs' fw={600} c='dimmed' tt='uppercase' style={{ letterSpacing: '0.05em' }}>
        {activeNames.length > 0 ? 'Ürünlerinizin Piyasa Fiyatları' : 'Güncel Fiyatlar'}
      </Text>
      <SimpleGrid cols={2} spacing='sm'>
        {displayNames.map((name) => (
          <ProductPriceCard key={name} name={name} />
        ))}
      </SimpleGrid>
    </Stack>
  );
}

export default function GroceryMarketPrices() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: productsData } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => api.get(endpoints.products).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading } = useQuery<{ results: MarketPriceResult[] }>({
    queryKey: ['market-prices', submittedQuery],
    queryFn: () =>
      api.get(endpoints.marketPrices, { params: { q: submittedQuery } }).then((r) => r.data),
    enabled: !!submittedQuery,
    staleTime: 30 * 60 * 1000,
  });

  function submit() {
    const trimmed = query.trim();
    if (trimmed) setSubmittedQuery(trimmed);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const results = data?.results ?? [];

  return (
    <Box maw={480} mx='auto'>
      {/* Sticky header */}
      <Box
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: '#fff',
          borderBottom: '1px solid #e8f5e9',
        }}
        px='md'
        py='sm'
      >
        <Group>
          <Button
            variant='subtle'
            color='green'
            px={8}
            onClick={() => navigate(-1)}
            data-testid='btn-back'
          >
            <IconArrowLeft size={20} />
          </Button>
          <Title order={5}>Piyasa Fiyatları</Title>
        </Group>
        <Group gap='xs' mt='xs'>
          <TextInput
            flex={1}
            size='sm'
            placeholder='Ürün adı yazın...'
            leftSection={<IconSearch size={14} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          <Button size='sm' color='green' onClick={submit}>
            Ara
          </Button>
        </Group>
      </Box>

      {/* Content */}
      {!submittedQuery ? (
        <WelcomeScreen products={productsData ?? []} />
      ) : (
        <Stack p='md' gap='sm'>
          {isLoading && (
            <>
              <Skeleton height={56} radius='md' />
              <Skeleton height={56} radius='md' />
              <Skeleton height={56} radius='md' />
            </>
          )}

          {!isLoading && results.length === 0 && (
            <Text c='dimmed' ta='center' mt='xl'>
              Sonuç bulunamadı
            </Text>
          )}

          {!isLoading && results.map((result) => {
            const isExpanded = expanded.has(result.id);
            return (
              <Paper
                key={result.id}
                withBorder
                p='sm'
                style={{ border: '1px solid #e8f5e9', cursor: 'pointer' }}
                onClick={() => toggleExpand(result.id)}
                data-testid={`result-card-${result.id}`}
              >
                <Group justify='space-between'>
                  <Text fw={600} size='sm'>{result.title}</Text>
                  <Group gap='xs'>
                    {result.brand && (
                      <Text size='xs' c='dimmed'>{result.brand}</Text>
                    )}
                    {isExpanded ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
                  </Group>
                </Group>

                {isExpanded && result.cheapest_stores.length > 0 && (
                  <Stack gap={6} mt='xs' pt='xs' style={{ borderTop: '1px solid #f0f0f0' }}>
                    {result.cheapest_stores.map((store: MarketStore, idx: number) => (
                      <Group key={idx} justify='space-between' align='center'>
                        <MarketLogo market={store.market} size={18} />
                        <Group gap='xs'>
                          <Text size='sm' fw={600}>₺{store.price.toFixed(2)}</Text>
                          <Text size='xs' c='dimmed'>{store.unitPrice}</Text>
                        </Group>
                      </Group>
                    ))}
                  </Stack>
                )}
              </Paper>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
