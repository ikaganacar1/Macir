/// <reference types="vite/client" />

declare module 'leaflet/dist/images/*.png' {
  const content: string;
  export default content;
}
