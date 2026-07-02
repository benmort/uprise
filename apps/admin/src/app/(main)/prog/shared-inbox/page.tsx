'use client';

// Base shared-inbox route → resume the last folder/filter/search from localStorage
// (folder is a path segment, so the resume happens here at the redirect boundary),
// falling back to the inbox. Filters/search ride as query params, mirroring /inbox.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { SHARED_INBOX_ROUTE_KEY } from './conversations';

export default function SharedInboxIndex() {
  const router = useRouter();
  useEffect(() => {
    let folder = 'inbox';
    let filter = 'all';
    let q = '';
    try {
      const raw = window.localStorage.getItem(SHARED_INBOX_ROUTE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { folder?: string; filter?: string; q?: string };
        folder = saved.folder || folder;
        filter = saved.filter || filter;
        q = saved.q || '';
      }
    } catch {
      /* ignore */
    }
    const params = new URLSearchParams();
    params.set('filter', filter);
    if (q) params.set('q', q);
    router.replace(`/prog/shared-inbox/${folder}?${params.toString()}`);
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-gray-400" role="status" aria-live="polite">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}
