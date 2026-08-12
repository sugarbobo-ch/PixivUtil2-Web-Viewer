export const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)';

export const prefersReducedMotion = (): boolean => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia(REDUCED_MOTION_MEDIA_QUERY).matches
);

export const getMotionAwareScrollBehavior = (
  preferred: ScrollBehavior = 'smooth',
): ScrollBehavior => (prefersReducedMotion() ? 'auto' : preferred);
