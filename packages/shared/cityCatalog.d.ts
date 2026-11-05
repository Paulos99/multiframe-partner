export type CityRow = {
  name: string;
  subject: string;
  population: number;
  label: string;
};

export function foldCity(value: unknown): string;
export function cityLabel(name: string, subject: string): string;
export function parseCityTsv(text: string): CityRow[];
export function ensureIndexFromTsv(text: string): void;
export function citiesReady(): boolean;
export function searchCities(query: string, limit?: number): CityRow[];
export function resolveCity(
  input: unknown,
  previous?: unknown,
): { ok: true; city: string } | { ok: false; message: string };
export function isKnownCity(input: unknown): boolean;
