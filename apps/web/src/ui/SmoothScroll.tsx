import { ReactLenis } from 'lenis/react';
import type { ReactNode } from 'react';
import 'lenis/dist/lenis.css';

/** Soft inertial wheel scroll — light glide, not sluggish. */
const LENIS_OPTIONS = {
  lerp: 0.07,
  smoothWheel: true,
  wheelMultiplier: 0.8,
  touchMultiplier: 1.05,
  autoRaf: true,
  anchors: true,
  respectReducedMotion: true,
  stopInertiaOnNavigate: true,
} as const;

export function SmoothScroll({ children }: { children: ReactNode }) {
  return (
    <ReactLenis root options={LENIS_OPTIONS}>
      {children}
    </ReactLenis>
  );
}
