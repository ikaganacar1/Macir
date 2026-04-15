import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  Progress,
  SegmentedControl,
  Skeleton,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { DateInput } from '@mantine/dates';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import {
  IconArrowLeft,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, endpoints } from '../api';
import { NumpadInput } from '../components/NumpadInput';
import PageLayout from '../components/PageLayout';
import { getIstanbulToday } from '../utils/format';
import type { Debt, DebtPayment, FinanceEntry } from '../types';

function getMonthParam(offset: number): string {
  const todayStr = getIstanbulToday();
  const [year, month] = todayStr.split('-').map(Number);
  const d = new Date(year, month - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(param: string): string {
  const [year, month] = param.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
}

const ENTRY_TYPE_COLOR: Record<string, string> = { expense: 'red', income: 'green' };
const ENTRY_TYPE_LABEL: Record<string, string> = { expense: 'Gider', income: 'Gelir' };

export default function GroceryFinance() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Entries tab
  const [monthOffset, setMonthOffset] = useState(0);
  const monthParam = getMonthParam(monthOffset);
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [entryCategory, setEntryCategory] = useState('');
  const [entryType, setEntryType] = useState<'expense' | 'income'>('expense');
  const [entryAmount, setEntryAmount] = useState('0');
  const [entryRecurring, setEntryRecurring] = useState(false);
  const [entryDate, setEntryDate] = useState(getIstanbulToday());
  const [entryNotes, setEntryNotes] = useState('');

  // Debts tab
  const [addDebtOpen, setAddDebtOpen] = useState(false);
  const [debtName, setDebtName] = useState('');
  const [debtTotal, setDebtTotal] = useState('0');
  const [debtMonthly, setDebtMonthly] = useState('0');
  const [debtStartDate, setDebtStartDate] = useState(getIstanbulToday());
  const [debtNotes, setDebtNotes] = useState('');
  const [expandedDebt, setExpandedDebt] = useState<number | null>(null);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [paymentDebtPk, setPaymentDebtPk] = useState<number | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('0');
  const [paymentDate, setPaymentDate] = useState(getIstanbulToday());
  const [paymentNotes, setPaymentNotes] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [deleteConfirmOpen, { open: openDeleteConfirm, close: closeDeleteConfirm }] = useDisclosure(false);

  const { data: entries = [], isLoading: entriesLoading } = useQuery<FinanceEntry[]>({
    queryKey: ['finance-entries', monthParam],
    queryFn: () =>
      api.get(endpoints.finance, { params: { month: monthParam } }).then((r) => r.data),
  });

  const { data: debts = [], isLoading: debtsLoading } = useQuery<Debt[]>({
    queryKey: ['debts'],
    queryFn: () => api.get(endpoints.debts).then((r) => r.data),
  });

  const { data: payments = [] } = useQuery<DebtPayment[]>({
    queryKey: ['debt-payments', expandedDebt],
    queryFn: () =>
      api.get(`${endpoints.debts}${expandedDebt}/payments/`).then((r) => r.data),
    enabled: expandedDebt !== null,
  });

  const { mutate: addEntry, isPending: addingEntry } = useMutation({
    mutationFn: () =>
      api.post(endpoints.finance, {
        category: entryCategory,
        entry_type: entryType,
        amount: entryAmount,
        date: entryDate,
        is_recurring: entryRecurring,
        notes: entryNotes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-entries'] });
      queryClient.invalidateQueries({ queryKey: ['grocery-dashboard-today'] });
      setAddEntryOpen(false);
      setEntryCategory('');
      setEntryAmount('0');
      setEntryRecurring(false);
      setEntryNotes('');
      notifications.show({ message: 'Kayıt eklendi', color: 'green' });
    },
    onError: () => notifications.show({ message: 'Kayıt eklenemedi', color: 'red' }),
  });

  const { mutate: deleteEntry } = useMutation({
    mutationFn: (pk: number) => api.delete(`${endpoints.finance}${pk}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-entries'] });
      queryClient.invalidateQueries({ queryKey: ['grocery-dashboard-today'] });
    },
    onError: () => notifications.show({ message: 'Kayıt silinemedi', color: 'red' }),
  });

  const { mutate: addDebt, isPending: addingDebt } = useMutation({
    mutationFn: () =>
      api.post(endpoints.debts, {
        name: debtName,
        total_amount: debtTotal,
        monthly_payment: debtMonthly,
        start_date: debtStartDate,
        notes: debtNotes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['grocery-dashboard-today'] });
      setAddDebtOpen(false);
      setDebtName('');
      setDebtTotal('0');
      setDebtMonthly('0');
      setDebtNotes('');
      notifications.show({ message: 'Borç eklendi', color: 'green' });
    },
    onError: () => notifications.show({ message: 'Borç eklenemedi', color: 'red' }),
  });

  const { mutate: addPayment, isPending: addingPayment } = useMutation({
    mutationFn: () =>
      api.post(`${endpoints.debts}${paymentDebtPk}/payments/`, {
        amount: paymentAmount,
        date: paymentDate,
        notes: paymentNotes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt-payments', paymentDebtPk] });
      queryClient.invalidateQueries({ queryKey: ['grocery-dashboard-today'] });
      setAddPaymentOpen(false);
      setPaymentAmount('0');
      setPaymentNotes('');
      notifications.show({ message: 'Ödeme eklendi', color: 'green' });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.amount?.[0] ?? 'Hata oluştu';
      notifications.show({ message: msg, color: 'red' });
    },
  });

  const { mutate: closeDebt } = useMutation({
    mutationFn: (pk: number) => api.patch(`${endpoints.debts}${pk}/`, { is_active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['grocery-dashboard-today'] });
      notifications.show({ message: 'Borç kapatıldı', color: 'gray' });
    },
  });

  return (
    <PageLayout
      header={
        <Group>
          <Button
            variant='subtle'
            color='gray'
            px='xs'
            onClick={() => navigate(-1)}
            data-testid='btn-back'
            aria-label='Geri dön'
          >
            <IconArrowLeft size={20} />
          </Button>
          <Title order={4}>Borçlar & Giderler</Title>
        </Group>
      }
    >
      <Tabs defaultValue='entries' style={{ flex: 1 }}>
        <Tabs.List px='md' pt='sm'>
          <Tabs.Tab value='entries' data-testid='tab-entries'>
            Giderler / Gelirler
          </Tabs.Tab>
          <Tabs.Tab value='debts' data-testid='tab-debts'>
            Borçlar
          </Tabs.Tab>
        </Tabs.List>

        {/* ENTRIES TAB */}
        <Tabs.Panel value='entries' pt='md'>
          <Stack px='md' gap='sm'>
            {/* Month navigator */}
            <Group justify='space-between' align='center'>
              <ActionIcon
                variant='subtle'
                color='gray'
                onClick={() => setMonthOffset((o) => o - 1)}
                data-testid='btn-prev-month'
              >
                <IconChevronLeft size={16} />
              </ActionIcon>
              <Text fw={600} size='sm' data-testid='month-label'>
                {getMonthLabel(monthParam)}
              </Text>
              <ActionIcon
                variant='subtle'
                color='gray'
                onClick={() => setMonthOffset((o) => o + 1)}
                disabled={monthOffset >= 0}
                data-testid='btn-next-month'
              >
                <IconChevronRight size={16} />
              </ActionIcon>
            </Group>

            <Button
              variant='light'
              color='green'
              leftSection={<IconPlus size={16} />}
              data-testid='btn-add-entry'
              onClick={() => {
                setEntryDate(getIstanbulToday());
                setAddEntryOpen(true);
              }}
            >
              Ekle
            </Button>

            {entriesLoading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} h={48} radius='md' />)
            ) : entries.length === 0 ? (
              <Text c='dimmed' ta='center' py='xl'>
                Bu ay kayıt yok
              </Text>
            ) : (
              entries.map((entry) => (
                <Paper
                  key={entry.pk}
                  withBorder
                  p='sm'
                  style={{ border: '1px solid #e8f5e9' }}
                  data-testid={`entry-row-${entry.pk}`}
                >
                  <Group justify='space-between'>
                    <Stack gap={2}>
                      <Group gap='xs'>
                        <Text size='sm' fw={600}>
                          {entry.category}
                        </Text>
                        <Badge
                          size='xs'
                          color={ENTRY_TYPE_COLOR[entry.entry_type]}
                          variant='light'
                        >
                          {ENTRY_TYPE_LABEL[entry.entry_type]}
                        </Badge>
                        {entry.is_recurring && (
                          <Badge size='xs' color='blue' variant='outline'>
                            Aylık
                          </Badge>
                        )}
                      </Group>
                      <Text size='xs' c='dimmed'>
                        {entry.date}
                      </Text>
                    </Stack>
                    <Group gap='xs'>
                      <Text
                        size='sm'
                        fw={700}
                        c={entry.entry_type === 'expense' ? 'red' : 'green'}
                      >
                        ₺{parseFloat(entry.amount).toFixed(2)}
                      </Text>
                      <ActionIcon
                        variant='subtle'
                        color='red'
                        size='sm'
                        data-testid={`btn-delete-entry-${entry.pk}`}
                        onClick={() => {
                          setDeleteTarget(entry.pk);
                          openDeleteConfirm();
                        }}
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  </Group>
                </Paper>
              ))
            )}
          </Stack>
        </Tabs.Panel>

        {/* DEBTS TAB */}
        <Tabs.Panel value='debts' pt='md'>
          <Stack px='md' gap='sm'>
            <Button
              variant='light'
              color='green'
              leftSection={<IconPlus size={16} />}
              data-testid='btn-add-debt'
              onClick={() => {
                setDebtStartDate(getIstanbulToday());
                setAddDebtOpen(true);
              }}
            >
              Borç Ekle
            </Button>

            {debtsLoading ? (
              [1, 2].map((i) => <Skeleton key={i} h={80} radius='md' />)
            ) : debts.length === 0 ? (
              <Text c='dimmed' ta='center' py='xl'>
                Aktif borç yok
              </Text>
            ) : (
              debts.map((debt) => {
                const total = parseFloat(debt.total_amount);
                const remaining = parseFloat(debt.remaining_amount);
                const paid = total - remaining;
                const paidPct =
                  total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
                const isExpanded = expandedDebt === debt.pk;

                return (
                  <Paper
                    key={debt.pk}
                    withBorder
                    style={{ border: '1px solid #e8f5e9', overflow: 'hidden' }}
                    data-testid={`debt-card-${debt.pk}`}
                  >
                    <Stack p='sm' gap='xs'>
                      <Group
                        justify='space-between'
                        style={{ cursor: 'pointer' }}
                        onClick={() => setExpandedDebt(isExpanded ? null : debt.pk)}
                      >
                        <Stack gap={2}>
                          <Text size='sm' fw={600}>
                            {debt.name}
                          </Text>
                          <Text size='xs' c='dimmed'>
                            ₺{remaining.toFixed(2)} / ₺{total.toFixed(2)} kaldı
                          </Text>
                        </Stack>
                        <Group gap='xs'>
                          <Text size='xs' c='dimmed'>
                            ₺{parseFloat(debt.monthly_payment).toFixed(2)}/ay
                          </Text>
                          {isExpanded ? (
                            <IconChevronUp size={16} color='gray' />
                          ) : (
                            <IconChevronDown size={16} color='gray' />
                          )}
                        </Group>
                      </Group>
                      <Progress
                        value={paidPct}
                        color='green'
                        size='sm'
                        data-testid={`debt-progress-${debt.pk}`}
                      />
                    </Stack>

                    {isExpanded && (
                      <Box
                        px='sm'
                        pb='sm'
                        style={{ borderTop: '1px solid #e8f5e9' }}
                        data-testid={`debt-payments-${debt.pk}`}
                      >
                        <Group justify='space-between' py='xs'>
                          <Text size='xs' c='dimmed' fw={600}>
                            ÖDEMELER
                          </Text>
                          <Group gap='xs'>
                            <Button
                              size='xs'
                              variant='light'
                              color='green'
                              data-testid={`btn-add-payment-${debt.pk}`}
                              onClick={() => {
                                setPaymentDebtPk(debt.pk);
                                setPaymentAmount(debt.monthly_payment);
                                setPaymentDate(getIstanbulToday());
                                setAddPaymentOpen(true);
                              }}
                            >
                              Ödeme Ekle
                            </Button>
                            <Button
                              size='xs'
                              variant='subtle'
                              color='gray'
                              onClick={() => closeDebt(debt.pk)}
                            >
                              Kapat
                            </Button>
                          </Group>
                        </Group>
                        {payments.length === 0 ? (
                          <Text size='xs' c='dimmed'>
                            Henüz ödeme yok
                          </Text>
                        ) : (
                          payments.map((p) => (
                            <Group key={p.pk} justify='space-between' py={4}>
                              <Text size='xs' c='dimmed'>
                                {p.date}
                              </Text>
                              <Text size='xs' fw={600} c='green'>
                                ₺{parseFloat(p.amount).toFixed(2)}
                              </Text>
                            </Group>
                          ))
                        )}
                      </Box>
                    )}
                  </Paper>
                );
              })
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>

      {/* Add Entry Modal */}
      <Modal
        opened={addEntryOpen}
        onClose={() => setAddEntryOpen(false)}
        title='Kayıt Ekle'
        centered
      >
        <Stack gap='sm'>
          <TextInput
            label='Kategori'
            placeholder='Kira, Elektrik, İşçi Maaşı...'
            value={entryCategory}
            onChange={(e) => setEntryCategory(e.currentTarget.value)}
            data-testid='input-entry-category'
          />
          <SegmentedControl
            value={entryType}
            onChange={(v) => setEntryType(v as 'expense' | 'income')}
            data={[
              { label: 'Gider', value: 'expense' },
              { label: 'Gelir', value: 'income' },
            ]}
            fullWidth
            data-testid='entry-type-control'
          />
          <NumpadInput value={entryAmount} onChange={setEntryAmount} />
          <Switch
            label='Her ay tekrarla'
            checked={entryRecurring}
            onChange={(e) => setEntryRecurring(e.currentTarget.checked)}
            data-testid='switch-recurring'
          />
          <DateInput
            label='Tarih'
            value={entryDate ? new Date(entryDate + 'T00:00:00') : null}
            onChange={(d) => setEntryDate(d ? dayjs(d).format('YYYY-MM-DD') : '')}
            valueFormat='YYYY-MM-DD'
            locale='tr'
          />
          <TextInput
            label='Not (isteğe bağlı)'
            value={entryNotes}
            onChange={(e) => setEntryNotes(e.currentTarget.value)}
          />
          <Button
            color='green'
            loading={addingEntry}
            disabled={!entryCategory.trim() || entryAmount === '0'}
            onClick={() => addEntry()}
            data-testid='btn-save-entry'
          >
            Kaydet
          </Button>
        </Stack>
      </Modal>

      {/* Add Debt Modal */}
      <Modal
        opened={addDebtOpen}
        onClose={() => setAddDebtOpen(false)}
        title='Borç Ekle'
        centered
      >
        <Stack gap='sm'>
          <TextInput
            label='Borç Adı'
            placeholder='Banka Kredisi, Tedarikçi...'
            value={debtName}
            onChange={(e) => setDebtName(e.currentTarget.value)}
            data-testid='input-debt-name'
          />
          <Text size='sm' fw={500}>
            Toplam Borç
          </Text>
          <NumpadInput value={debtTotal} onChange={setDebtTotal} />
          <Text size='sm' fw={500}>
            Aylık Ödeme
          </Text>
          <NumpadInput value={debtMonthly} onChange={setDebtMonthly} />
          <DateInput
            label='Başlangıç Tarihi'
            value={debtStartDate ? new Date(debtStartDate + 'T00:00:00') : null}
            onChange={(d) => setDebtStartDate(d ? dayjs(d).format('YYYY-MM-DD') : '')}
            valueFormat='YYYY-MM-DD'
            locale='tr'
          />
          <TextInput
            label='Not (isteğe bağlı)'
            value={debtNotes}
            onChange={(e) => setDebtNotes(e.currentTarget.value)}
          />
          <Button
            color='green'
            loading={addingDebt}
            disabled={!debtName.trim() || debtTotal === '0'}
            onClick={() => addDebt()}
            data-testid='btn-save-debt'
          >
            Kaydet
          </Button>
        </Stack>
      </Modal>

      {/* Add Payment Modal */}
      <Modal
        opened={addPaymentOpen}
        onClose={() => setAddPaymentOpen(false)}
        title='Ödeme Ekle'
        centered
      >
        <Stack gap='sm'>
          <NumpadInput value={paymentAmount} onChange={setPaymentAmount} />
          <DateInput
            label='Tarih'
            value={paymentDate ? new Date(paymentDate + 'T00:00:00') : null}
            onChange={(d) => setPaymentDate(d ? dayjs(d).format('YYYY-MM-DD') : '')}
            valueFormat='YYYY-MM-DD'
            locale='tr'
          />
          <TextInput
            label='Not (isteğe bağlı)'
            value={paymentNotes}
            onChange={(e) => setPaymentNotes(e.currentTarget.value)}
          />
          <Button
            color='green'
            loading={addingPayment}
            disabled={paymentAmount === '0'}
            onClick={() => addPayment()}
            data-testid='btn-save-payment'
          >
            Kaydet
          </Button>
        </Stack>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        opened={deleteConfirmOpen}
        onClose={closeDeleteConfirm}
        title='Emin misiniz?'
        centered
        size='sm'
      >
        <Stack gap='md'>
          <Text size='sm'>Bu kayıt kalıcı olarak silinecek.</Text>
          <Group justify='flex-end'>
            <Button variant='default' onClick={closeDeleteConfirm}>İptal</Button>
            <Button
              color='red'
              data-testid='btn-confirm-delete'
              onClick={() => {
                if (deleteTarget !== null) deleteEntry(deleteTarget);
                closeDeleteConfirm();
              }}
            >
              Sil
            </Button>
          </Group>
        </Stack>
      </Modal>
    </PageLayout>
  );
}
