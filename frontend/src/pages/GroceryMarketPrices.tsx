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
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, endpoints } from '../api';
import type { MarketPriceResult } from '../types';

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
      </Box>

      <Stack p='md' gap='sm'>
        {/* Search bar */}
        <Group gap='xs'>
          <TextInput
            flex={1}
            placeholder='Ürün adı yazın...'
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          <Button color='green' onClick={submit}>
            Ara
          </Button>
        </Group>

        {/* States */}
        {!submittedQuery && (
          <Text c='dimmed' ta='center' mt='xl'>
            Bir ürün adı yazın ve fiyatları karşılaştırın
          </Text>
        )}

        {isLoading && (
          <>
            <Skeleton height={56} radius='md' />
            <Skeleton height={56} radius='md' />
            <Skeleton height={56} radius='md' />
          </>
        )}

        {!isLoading && submittedQuery && results.length === 0 && (
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
                <Text fw={600}>{result.title}</Text>
                <Group gap='xs'>
                  {result.brand && (
                    <Text size='xs' c='dimmed'>{result.brand}</Text>
                  )}
                  {isExpanded ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
                </Group>
              </Group>

              {isExpanded && result.cheapest_stores.length > 0 && (
                <Stack gap={4} mt='xs'>
                  <SimpleGrid cols={3} spacing='xs'>
                    <Text size='xs' fw={600} c='dimmed'>Market</Text>
                    <Text size='xs' fw={600} c='dimmed'>Fiyat</Text>
                    <Text size='xs' fw={600} c='dimmed'>Birim Fiyat</Text>
                  </SimpleGrid>
                  {result.cheapest_stores.map((store, idx) => (
                    <SimpleGrid key={idx} cols={3} spacing='xs'>
                      <Text size='xs'>{store.market}</Text>
                      <Text size='xs'>{store.price.toFixed(2)}</Text>
                      <Text size='xs' c='dimmed'>{store.unitPrice}</Text>
                    </SimpleGrid>
                  ))}
                </Stack>
              )}
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
}
