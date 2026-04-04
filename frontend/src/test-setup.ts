import '@testing-library/jest-dom';

// jsdom does not implement window.matchMedia — required by Mantine's color-scheme logic
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// ResizeObserver — required by Mantine ScrollArea and FloatingIndicator
(window as unknown as any).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// IntersectionObserver — required by some Mantine overlay components
(window as unknown as any).IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof IntersectionObserver;
