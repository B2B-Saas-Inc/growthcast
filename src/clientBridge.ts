// Bridge to the analytics client that BaseLayout.astro already initialises on
// window. The filename stays vendor-neutral on purpose: content blockers match
// the emitted chunk URL, so a vendor name in it would get the asset blocked.
import type { PostHog } from 'posthog-js';

declare global {
  interface Window {
    posthog?: PostHog;
  }
}

export const isPostHogEnabled = typeof window !== 'undefined' && Boolean(window.posthog);

const posthog = (typeof window !== 'undefined' ? window.posthog : undefined) as PostHog;

export default posthog;
