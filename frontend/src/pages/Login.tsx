import { Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { api } from '../api';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [loading, setLoading] = useState(false);
  const form = useForm({ initialValues: { username: '', password: '' } });

  const submit = async (values: typeof form.values) => {
    setLoading(true);
    try {
      await api.get('/api/auth/csrf/');
      await api.post('/api/auth/login/', values);
      onLogin();
    } catch {
      notifications.show({ message: 'Kullanıcı adı veya şifre hatalı', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center h='100vh' style={{ background: '#f9faf7' }}>
      <Paper withBorder p='xl' w={320} style={{ border: '1px solid #e8f5e9' }}>
        <Stack>
          <Title order={3} ta='center' c='green'>🌿 Macır</Title>
          <Text size='sm' c='dimmed' ta='center'>Hoş geldiniz</Text>
          <form onSubmit={form.onSubmit(submit)}>
            <Stack>
              <TextInput label='Kullanıcı Adı' required {...form.getInputProps('username')} />
              <PasswordInput label='Şifre' required {...form.getInputProps('password')} />
              <Button type='submit' color='green' loading={loading}>Giriş Yap</Button>
            </Stack>
          </form>
        </Stack>
      </Paper>
    </Center>
  );
}
