'use client';

/**
 * /quick-analyze is no longer maintained as a separate page.
 * Redirects to /analyze which includes all quick-analyze functionality.
 */
import { useEffect } from 'react';
import { useRouter } from '../../../i18n/navigation';

export default function QuickAnalyzePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/analyze');
  }, [router]);

  return null;
}
