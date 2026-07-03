'use client';

// Shared Inbox folder shell — the breadcrumb, sidebar and compose modal live here once
// (they persist across list ↔ detail navigation). The folder is a URL path segment; the
// list/detail pages render only the main content pane (`xl:col-span-9`) as children.
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { createBlastAndOpen } from '@/lib/blasts';
import { NewConversationMenu } from '@/components/inbox/new-conversation-menu';
import SharedInboxSidebar from '@/components/prog/shared-inbox/sidebar';
import { folderLabel } from './conversations';

export default function SharedInboxFolderLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const folder = String(params.folder ?? 'inbox');
  const [composeOpen, setComposeOpen] = useState(false);

  return (
    <div className="page-stack">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Shared inbox</h2>
          <nav>
            <ol className="flex items-center gap-1.5">
              <li>
                <a className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400" href="/dashboard">
                  Dashboard
                  <BreadcrumbChevron />
                </a>
              </li>
              <li>
                <Link
                  className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400"
                  href="/inbox"
                >
                  Shared inbox
                  <BreadcrumbChevron />
                </Link>
              </li>
              <li className="text-sm text-gray-800 dark:text-white/90">{folderLabel(folder)}</li>
            </ol>
          </nav>
        </div>

        <div className="sm:h-[calc(100vh-174px)] h-screen xl:h-[calc(100vh-186px)]">
          <div className="xl:grid xl:grid-cols-12 flex flex-col gap-5 sm:gap-5">
            <SharedInboxSidebar onCompose={() => setComposeOpen(true)} />
            <NewConversationMenu
              open={composeOpen}
              onClose={() => setComposeOpen(false)}
              onPick={(ch) => {
                if (ch === 'sms') void createBlastAndOpen(router, showToast, { channel: 'SMS' });
              }}
            />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function BreadcrumbChevron() {
  return (
    <svg className="stroke-current" width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.0765 12.667L10.2432 8.50033L6.0765 4.33366" stroke="" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"></path>
    </svg>
  );
}
