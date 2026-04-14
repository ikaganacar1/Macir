import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock leaflet to avoid icon URL resolution and DOM errors in jsdom
vi.mock('leaflet', () => ({
  default: {
    Icon: {
      Default: {
        prototype: {},
        mergeOptions: vi.fn(),
      },
    },
  },
  Icon: {
    Default: {
      prototype: {},
      mergeOptions: vi.fn(),
    },
  },
}));

// Mock react-leaflet entirely — jsdom cannot render canvas/WebGL maps
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='map-container'>{children}</div>
  ),
  TileLayer: () => null,
  Marker: () => <div data-testid='map-marker' />,
  useMapEvents: (handlers: { click?: (e: { latlng: { lat: number; lng: number } }) => void }) => {
    // expose a helper so tests can simulate map clicks
    (window as any).__simulateMapClick = (lat: number, lng: number) =>
      handlers.click?.({ latlng: { lat, lng } });
    return null;
  },
}));

vi.mock('../../api', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
  endpoints: {
    profile: '/api/grocery/profile/',
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { api } from '../../api';
import GroceryProfile from '../GroceryProfile';

const mockProfile = { latitude: 41.0082, longitude: 28.9784, search_radius_km: 5 };

function renderComponent() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <GroceryProfile />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('GroceryProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: mockProfile });
    vi.mocked(api.patch).mockResolvedValue({ data: mockProfile });
  });

  it('renders map and loads current profile', async () => {
    renderComponent();
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('map-marker')).toBeInTheDocument();
    });
  });

  it('renders title and back button', async () => {
    renderComponent();
    expect(screen.getByText('Mağaza Konumu')).toBeInTheDocument();
    expect(screen.getByTestId('btn-back')).toBeInTheDocument();
  });

  it('back button calls navigate(-1)', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('btn-back'));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('shows radius preset buttons', async () => {
    renderComponent();
    await screen.findByTestId('map-marker');
    expect(screen.getByTestId('radius-5')).toBeInTheDocument();
    expect(screen.getByTestId('radius-10')).toBeInTheDocument();
  });

  it('map click updates coordinates display', async () => {
    renderComponent();
    await screen.findByTestId('map-marker');
    (window as any).__simulateMapClick(38.42, 27.13);
    await waitFor(() => {
      expect(screen.getByTestId('coord-display')).toHaveTextContent('38.4200');
    });
  });

  it('save button calls PATCH with current coordinates', async () => {
    renderComponent();
    await screen.findByTestId('map-marker');
    (window as any).__simulateMapClick(38.42, 27.13);
    fireEvent.click(screen.getByTestId('btn-save'));
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        '/api/grocery/profile/',
        expect.objectContaining({ latitude: 38.42, longitude: 27.13 })
      );
    });
  });

  it('shows success notification after save', async () => {
    renderComponent();
    await screen.findByTestId('map-marker');
    fireEvent.click(screen.getByTestId('btn-save'));
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalled();
    });
  });

  it('shows notification when geolocation is denied', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: mockProfile });
    const mockGeo = {
      getCurrentPosition: vi.fn((_success: Function, error: Function) => {
        error(new Error('denied'));
      }),
    };
    Object.defineProperty(global.navigator, 'geolocation', {
      value: mockGeo,
      configurable: true,
    });

    renderComponent();
    const geoBtn = await screen.findByText('Konumumu Kullan');
    fireEvent.click(geoBtn);
    await waitFor(() => {
      expect(screen.getByText(/Konum izni reddedildi/)).toBeInTheDocument();
    });
  });

  it('shows unsaved changes modal when back is clicked after changes', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: mockProfile });
    renderComponent();
    await screen.findByTestId('btn-back');

    // Simulate a map click to dirty the form
    act(() => {
      (window as any).__simulateMapClick(41.0, 29.0);
    });

    fireEvent.click(screen.getByTestId('btn-back'));
    await waitFor(() => {
      expect(screen.getByText('Kaydedilmemiş değişiklikler')).toBeInTheDocument();
    });
  });

  it('navigates back immediately when back is clicked and form is clean', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: mockProfile });
    renderComponent();
    const backBtn = await screen.findByTestId('btn-back');
    fireEvent.click(backBtn);
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });
});
