import type { SubscriptionProvider } from './subscription-accounts.ts';

// Official CLIs own their OAuth login. Never inherit an alternate billing
// route from the runner or a project. Keep HOME for the CLI-managed login.
export function subscriptionEnv(_provider: SubscriptionProvider, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key]) =>
        !/(API_KEY|ACCESS_TOKEN|AUTH_TOKEN)/i.test(key) &&
        !/^(GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_GENAI_USE_VERTEXAI|GOOGLE_GENAI_USE_GCA|GOOGLE_CLOUD_PROJECT|GOOGLE_CLOUD_LOCATION|CLOUDSDK_AUTH_ACCESS_TOKEN)$/.test(
          key,
        ),
    ),
  );
}
