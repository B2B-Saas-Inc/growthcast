import type { PostHog } from 'posthog-js';

declare global {
  interface Window {
    posthog?: PostHog;
  }
}

export const isPostHogEnabled = typeof window !== 'undefined' && Boolean(window.posthog);

const posthog = (typeof window !== 'undefined' ? window.posthog : undefined) as PostHog;

export default posthog;
