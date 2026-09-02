import posthog from 'posthog-js';

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;

export const isPostHogEnabled = Boolean(posthogKey);

if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: '/gcast-io',
    ui_host: 'https://us.posthog.com',
    defaults: '2026-05-30',
    disable_session_recording: true,
    disable_surveys: true,
    disable_conversations: true,
    disable_product_tours: true,
    advanced_disable_feature_flags: true,
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
  });
}

export default posthog;
