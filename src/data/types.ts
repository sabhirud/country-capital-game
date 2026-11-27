export type Continent =
  | 'Africa'
  | 'Asia'
  | 'Europe'
  | 'North America'
  | 'South America'
  | 'Oceania';

export const CONTINENTS: Continent[] = [
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Oceania',
];

export type FlagColor = 'red' | 'white' | 'blue' | 'green' | 'yellow' | 'black' | 'orange';

export type FlagSymbol =
  | 'h-stripes' // horizontal bands
  | 'v-stripes' // vertical bands
  | 'diagonal' // diagonal band or split
  | 'star'
  | 'crescent'
  | 'sun'
  | 'cross' // any cross or saltire (not Nordic)
  | 'nordic-cross'
  | 'triangle' // hoist triangle or chevron
  | 'disc' // circle
  | 'emblem' // coat of arms, seal or detailed emblem
  | 'animal' // bird, eagle, dragon, lion…
  | 'plant' // tree, leaf, wreath
  | 'weapon' // sword, spear, rifle, machete…
  | 'union-jack'
  | 'text' // writing on the flag
  | 'map'; // outline of the country

export interface AltCapital {
  name: string;
  /** e.g. "seat of government" */
  role: string;
  /** alternate spellings accepted for this alternate capital */
  aliases?: string[];
}

export interface Country {
  /** ISO 3166-1 alpha-2, lowercase ("xk" for Kosovo). Also the flag file name. */
  id: string;
  name: string;
  /** other accepted names for the country */
  aliases?: string[];
  /** the primary capital most quizzes expect */
  capital: string;
  /** alternate spellings of the primary capital (e.g. "Kiev") */
  capitalAliases?: string[];
  /** other official capitals that are also accepted */
  altCapitals?: AltCapital[];
  /** short explanation shown when a country has a split / disputed / moving capital */
  capitalNote?: string;
  /** [longitude, latitude] of the primary capital */
  coord: [number, number];
  continent: Continent;
  region: string;
  /** name in world-atlas when it differs from `name` */
  atlasName?: string;
  /** memory hook / fun fact */
  hook: string;
  /** phonetic respelling for hard-to-say capitals */
  say?: string;
  flag: { colors: FlagColor[]; symbols: FlagSymbol[] };
}
