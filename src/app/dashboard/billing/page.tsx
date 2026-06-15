'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Billing moved into Settings → Plan & Billing (standard SaaS pattern — billing
 * lives under account settings, not the main nav). This route now redirects
 * there, deep-linking to the plan section. Kept so old links/bookmarks don't 404.
 */
export default function BillingRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/settings#plan');
  }, [router]);
  return null;
}
