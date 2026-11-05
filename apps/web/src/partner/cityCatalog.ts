import {
  citiesReady,
  ensureIndexFromTsv,
  isKnownCity,
  resolveCity,
  searchCities,
  type CityRow,
} from '../../../../packages/shared/cityCatalog.js';

let pending: Promise<void> | null = null;

/** Ленивая загрузка справочника — не попадает в стартовый бандл. */
export function loadCities(): Promise<void> {
  if (citiesReady()) return Promise.resolve();
  if (!pending) {
    pending = import('../../../../packages/shared/data/ru-cities.js')
      .then((mod) => {
        ensureIndexFromTsv(mod.default);
      })
      .catch((error: unknown) => {
        pending = null;
        throw error;
      });
  }
  return pending;
}

export { citiesReady, isKnownCity, resolveCity, searchCities };
export type { CityRow };
