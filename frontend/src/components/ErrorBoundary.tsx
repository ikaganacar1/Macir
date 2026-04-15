import { Component, type ReactNode } from 'react';
import { Button, Stack, Text, Title } from '@mantine/core';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Stack align='center' justify='center' style={{ minHeight: '60vh' }} gap='md'>
          <Title order={3} c='red'>Sayfa yüklenemedi</Title>
          <Text c='dimmed' ta='center'>Bir hata oluştu. Lütfen sayfayı yenileyin.</Text>
          <Button onClick={() => window.location.reload()} variant='light'>
            Yenile
          </Button>
        </Stack>
      );
    }
    return this.props.children;
  }
}
