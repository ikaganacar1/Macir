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
      // Fetch CSRF cookie first
      await api.get('/api/auth/csrf/');
      await api.post('/api/auth/login/', values);
      onLogin();
    } catch {
      notifications.show({ message: 'Invalid username or password', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center h='100vh'>
      <Paper withBorder p='xl' w={320}>
        <Stack>
          <Title order={3} ta='center'>🛒 Macır</Title>
          <form onSubmit={form.onSubmit(submit)}>
            <Stack>
              <TextInput label='Username' required {...form.getInputProps('username')} />
              <PasswordInput label='Password' required {...form.getInputProps('password')} />
              <Button type='submit' loading={loading}>Sign in</Button>
            </Stack>
          </form>
        </Stack>
      </Paper>
    </Center>
  );
}
