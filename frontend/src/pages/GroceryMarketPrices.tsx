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
import { useQueries, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, endpoints } from '../api';
import type { MarketPriceResult, MarketStore } from '../types';
import { getMarketLogo, KNOWN_MARKETS } from '../utils/marketLogos';

const POPULAR_PRODUCTS = [
  { name: 'Domates', emoji: '🍅' },
  { name: 'Patates', emoji: '🥔' },
  { name: 'Soğan', emoji: '🧅' },
  { name: 'Elma', emoji: '🍎' },
  { name: 'Muz', emoji: '🍌' },
  { name: 'Biber', emoji: '🫑' },
  { name: 'Yumurta', emoji: '🥚' },
  { name: 'Ekmek', emoji: '🍞' },
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

function PopularProductCard({ name, emoji }: { name: string; emoji: string }) {
  const { data, isLoading } = useQuery<{ results: MarketPriceResult[] }>({
    queryKey: ['market-prices', name.toLowerCase()],
    queryFn: () =>
      api.get(endpoints.marketPrices, { params: { q: name } }).then((r) => r.data),
    staleTime: 30 * 60 * 1000,
  });

  const results = data?.results ?? [];

  return (
    <Paper withBorder p='sm' style={{ border: '1px solid #e8f5e9' }}>
      <Group gap='xs' mb='xs'>
        <Text style={{ fontSize: 20 }}>{emoji}</Text>
        <Text fw={600} size='sm'>{name}</Text>
      </Group>
      {isLoading ? (
        <Stack gap={4}>
          <Skeleton height={18} radius='sm' />
          <Skeleton height={18} radius='sm' />
        </Stack>
      ) : results.length === 0 ? (
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

function WelcomeScreen() {
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

      {/* Popular products grid */}
      <Text size='xs' fw={600} c='dimmed' tt='uppercase' style={{ letterSpacing: '0.05em' }}>
        Güncel Fiyatlar
      </Text>
      <SimpleGrid cols={2} spacing='sm'>
        {POPULAR_PRODUCTS.map((p) => (
          <PopularProductCard key={p.name} name={p.name} emoji={p.emoji} />
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
        {/* Search bar inside header */}
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
        <WelcomeScreen />
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
