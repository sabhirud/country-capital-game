import { BY_ID } from '../data/countries.ts';

const BASE = import.meta.env.BASE_URL;

export function flagUrl(id: string) {
  return `${BASE}flags/${id}.svg`;
}

/** A flag image. `secret` hides the country name from the alt text (used in quiz questions). */
export function Flag({ id, size = 'md', secret = false, className = '' }: { id: string; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; secret?: boolean; className?: string }) {
  const name = BY_ID[id]?.name ?? id;
  return (
    <img
      className={`flag flag-${size} ${className}`}
      src={flagUrl(id)}
      alt={secret ? 'Flag' : `Flag of ${name}`}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}
