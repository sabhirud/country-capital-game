const P: Record<string, string> = {
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
  chart: 'M4 20h16M7 16v-5m5 5V7m5 9v-8',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-1.6.1-1.4-.1-1.4 2-1.6-2-3.4-2.4 1a7 7 0 0 0-2.4-1.4L14 2.6h-4l-.4 2.6a7 7 0 0 0-2.4 1.4l-2.4-1-2 3.4 2 1.6-.1 1.4.1 1.4-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2.4 1.4l.4 2.6h4l.4-2.6a7 7 0 0 0 2.4-1.4l2.4 1 2-3.4-2-1.6Z',
  speaker: 'M4 9v6h4l5 4V5L8 9H4Zm12.5-1.5a5 5 0 0 1 0 9M19 5a9 9 0 0 1 0 14',
  close: 'M6 6l12 12M18 6 6 18',
  bulb: 'M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2l.1.2h4.8l.1-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3Z',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  x: 'M7 7l10 10M17 7 7 17',
  play: 'M7 5v14l12-7L7 5Z',
  search: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM21 21l-5.2-5.2',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  back: 'M19 12H5m6 6-6-6 6-6',
  zap: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  pin: 'M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Zm0-9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  sweep: 'M3 12a9 9 0 1 0 9-9m0 0v9l6 3',
  trick: 'M12 17h.01M9.1 9a3 3 0 1 1 4.2 2.7c-.8.4-1.3 1.2-1.3 2.1v.2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  weak: 'M12 9v4m0 4h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  keyboard: 'M3 7h18v10H3V7Zm4 3h.01M10 10h.01M13 10h.01M16 10h.01M7 14h10',
  shuffle: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  download: 'M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3',
  upload: 'M12 21V9m0 0-4 4m4-4 4 4M4 7V4h16v3',
  trophy: 'M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0V4Zm0 2H4a3 3 0 0 0 3 4m10-4h3a3 3 0 0 1-3 4',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-15v2m0 16v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M2 12h2m16 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  auto: 'M12 21a9 9 0 1 0 0-18v18Z',
};

export function Icon({ name, size = 20, className = '' }: { name: keyof typeof P | string; size?: number; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={P[name] ?? ''} />
    </svg>
  );
}
