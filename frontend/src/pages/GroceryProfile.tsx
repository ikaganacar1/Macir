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
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconCurrentLocation } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { api, endpoints } from '../api';
import type { StoreProfile } from '../types';

// Fix Leaflet marker icons broken by Vite's asset pipeline
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

const RADIUS_PRESETS = [25, 50, 100, 200];

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function GroceryProfile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery<StoreProfile>({
    queryKey: ['store-profile'],
    queryFn: () => api.get(endpoints.profile).then((r) => r.data),
  });

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radius, setRadius] = useState<number | null>(null);

  // Use loaded values as defaults if user hasn't changed them yet
  const currentLat = lat ?? profile?.latitude ?? 41.0082;
  const currentLng = lng ?? profile?.longitude ?? 28.9784;
  const currentRadius = radius ?? profile?.search_radius_km ?? 50;

  // Ref tracks latest values so mutation always reads current coords even before re-render
  const coordsRef = useRef({ lat: currentLat, lng: currentLng, radius: currentRadius });
  coordsRef.current = { lat: currentLat, lng: currentLng, radius: currentRadius };

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      api.patch(endpoints.profile, {
        latitude: coordsRef.current.lat,
        longitude: coordsRef.current.lng,
        search_radius_km: coordsRef.current.radius,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-profile'] });
      notifications.show({ message: 'Konum kaydedildi', color: 'green' });
    },
    onError: () => {
      notifications.show({ message: 'Kaydedilemedi', color: 'red' });
    },
  });

  function handleMapClick(newLat: number, newLng: number) {
    const parsedLat = parseFloat(newLat.toFixed(6));
    const parsedLng = parseFloat(newLng.toFixed(6));
    coordsRef.current = { lat: parsedLat, lng: parsedLng, radius: coordsRef.current.radius };
    setLat(parsedLat);
    setLng(parsedLng);
  }

  function handleGeolocate() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(parseFloat(pos.coords.latitude.toFixed(6)));
      setLng(parseFloat(pos.coords.longitude.toFixed(6)));
    });
  }

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
        <Group justify='space-between'>
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
            <Title order={5}>Mağaza Konumu</Title>
          </Group>
          <Button
            size='sm'
            color='green'
            loading={isPending}
            onClick={() => save()}
            data-testid='btn-save'
          >
            Kaydet
          </Button>
        </Group>
      </Box>

      <Stack p='md' gap='sm'>
        {/* Map */}
        <Paper withBorder style={{ height: 320, overflow: 'hidden', border: '1px solid #e8f5e9' }}>
          <MapContainer
            center={[currentLat, currentLng]}
            zoom={11}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
              attribution='© OpenStreetMap contributors'
              />
            <ClickHandler onClick={handleMapClick} />
            <Marker position={[currentLat, currentLng]} />
          </MapContainer>
        </Paper>

        {/* Coordinate display */}
        <Text size='xs' c='dimmed' ta='center' data-testid='coord-display'>
          {currentLat.toFixed(4)}, {currentLng.toFixed(4)}
        </Text>

        {/* Geolocation button */}
        <Button
          variant='default'
          leftSection={<IconCurrentLocation size={16} />}
          onClick={handleGeolocate}
          fullWidth
        >
          Konumumu Kullan
        </Button>

        {/* Radius presets */}
        <Text size='sm' fw={600} c='dimmed'>Arama Yarıçapı</Text>
        <SimpleGrid cols={4} spacing='xs'>
          {RADIUS_PRESETS.map((r) => (
            <Button
              key={r}
              variant={currentRadius === r ? 'filled' : 'default'}
              color='green'
              size='xs'
              onClick={() => setRadius(r)}
              data-testid={`radius-${r}`}
            >
              {r} km
            </Button>
          ))}
        </SimpleGrid>

        <Text size='xs' c='dimmed'>
          Haritaya dokunarak mağaza konumunuzu ayarlayın. Yakın marketlerin fiyatları önce gösterilir.
        </Text>
      </Stack>
    </Box>
  );
}
