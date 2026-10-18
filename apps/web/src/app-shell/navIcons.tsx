import type { ReactNode } from 'react';

/** Иконки разделов кабинета: на планшете меню сворачивается в рельс с иконками, на телефоне — нижняя панель. */
const PATHS: Record<string, ReactNode> = {
  objects: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5Z" />,
  deals: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5Z" />,
  projects: <path d="M4 7a2 2 0 0 1 2-2h3.5l2 2H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />,
  company: <path d="M5 20V6a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v14M14 10h4a1 1 0 0 1 1 1v9M3 20h18M8 9h2M8 13h2M8 17h2" />,
  staff: <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M21 20a6 6 0 0 0-4-5.6" />,
  analytics: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  partners: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0" />,
  add: <path d="M12 5v14M5 12h14" />,
  help: <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" />,
  tools: <path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.3-.7-.7-2.3 2.5-2.5Z" />,
};

export function NavIcon({ id, label }: { id: string; label: string }) {
  const path = PATHS[id];
  if (!path) {
    return (
      <span aria-hidden="true" data-nav-icon="letter">
        {label.trim().slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" data-nav-icon={id}>
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {path}
      </g>
    </svg>
  );
}

/** «Объекты · 2» → { base: 'Объекты', count: '2' }. */
export function splitNavLabel(label: string): { base: string; count: string | null } {
  const [base, ...rest] = label.split(' · ');
  return { base: (base || label).trim(), count: rest.length ? rest.join(' · ').trim() : null };
}
