import { createContext } from 'react';

/** Куда «Офлайн-доступ» ставит шестерёнку в шапке раздела «Обучение». */
export const OfflineGearSlot = createContext<HTMLElement | null>(null);
