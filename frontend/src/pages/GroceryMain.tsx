import { t } from '../i18n';
import {
  Box,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  IconChartBar,
  IconClipboardList,
  IconLayoutDashboard,
  IconPackage,
  IconShoppingCart,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { api, endpoints } from '../api';

interface DashboardStats {
  total_sales: number;
  net_profit: number;
  low_stock: { product_id: number }[];
}

export default function GroceryMain() {
  const navigate = useNavigate();

  const today = new Date().toISOString().split('T')[0];

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['grocery-dashboard-today', today],
    queryFn: () =>
      api
        .get(endpoints.dashboard, {
          params: { range: 'today', date: today },
        })
        .then((r) => r.data),
  });

  const actions = [
    {
      label: t`Record Sales`,
      icon: <IconShoppingCart size={28} />,
      color: 'orange',
      path: '/grocery/sales/new',
    },
    {
      label: t`Add Stock`,
      icon: <IconPackage size={28} />,
      color: 'blue',
      path: '/grocery/stock/new',
    },
    {
      label: t`Products`,
      icon: <IconClipboardList size={28} />,
      color: 'green',
      path: '/grocery/products',
    },
    {
      label: t`Reports`,
      icon: <IconChartBar size={28} />,
      color: 'grape',
      path: '/grocery/dashboard',
    },
  ];

  return (
    <Stack p='md' gap='md'>
      <Group justify='space-between'>
        <Title order={3}>🛒 Macır</Title>
        <Text size='sm' c='dimmed'>
          {new Date().toLocaleDateString()}
        </Text>
      </Group>

      {/* Quick stats strip */}
      <Paper withBorder p='sm' radius='md'>
        <Group justify='space-around'>
          <Box ta='center'>
            <Text fw={700} c='orange'>
              {stats?.low_stock?.length ?? 0}
            </Text>
            <Text size='xs' c='dimmed'>{t`Low Stock`}</Text>
          </Box>
          <Box ta='center'>
            <Text fw={700} c='blue'>
              ₺{stats ? parseFloat(String(stats.total_sales)).toFixed(2) : '0.00'}
            </Text>
            <Text size='xs' c='dimmed'>{t`Today Sales`}</Text>
          </Box>
          <Box ta='center'>
            <Text fw={700} c='green'>
              ₺{stats ? parseFloat(String(stats.net_profit)).toFixed(2) : '0.00'}
            </Text>
            <Text size='xs' c='dimmed'>{t`Profit`}</Text>
          </Box>
        </Group>
      </Paper>

      {/* Action buttons 2x2 */}
      <SimpleGrid cols={2} spacing='md'>
        {actions.map((action) => (
          <Button
            key={action.path}
            color={action.color}
            h={90}
            onClick={() => navigate(action.path)}
            styles={{ inner: { flexDirection: 'column', gap: 6 } }}
          >
            {action.icon}
            <Text size='sm' fw={600}>
              {action.label}
            </Text>
          </Button>
        ))}
      </SimpleGrid>

      {/* Detailed dashboard shortcut */}
      <Button
        variant='default'
        leftSection={<IconLayoutDashboard size={18} />}
        onClick={() => navigate('/grocery/dashboard')}
        size='md'
      >
        {t`Detailed Dashboard`}
      </Button>
    </Stack>
  );
}
