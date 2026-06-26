// Browser polyfills for design-sync bundling only.
// Next.js and Supabase reference Node.js globals; we stub them so the
// IIFE bundle initializes without throwing in a browser preview context.
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).process === 'undefined') {
  (globalThis as any).process = {
    env: {
      NODE_ENV: 'development',
      // Supabase SSR validates URL+key at createClient() time; placeholder
      // values let the constructor succeed so the IIFE completes.
      NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key',
    },
    browser: true,
    version: '',
    versions: {},
  };
}
