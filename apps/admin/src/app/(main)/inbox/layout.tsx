'use client';

// Shared Inbox folder shell — the breadcrumb, sidebar and compose modal live here once
// (they persist across list ↔ detail navigation). The folder is a URL path segment; the
// list/detail pages render only the main content pane (`xl:col-span-9`) as children.
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Inbox } from 'lucide-react';
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <Inbox className="h-6 w-6 shrink-0 text-primary" />
            <h1 className="text-2xl font-extrabold">Inbox</h1>
          </div>
          <nav>
            <ol className="flex items-center gap-1.5">
              <li>
                <a className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400" href="/dashboard">
                  Dashboard
                  <BreadcrumbChevron />
                </a>
              </li>
              {folder === 'inbox' ? (
                // Default /inbox — Inbox is the current page: Dashboard > Inbox.
                <li className="text-sm text-gray-800 dark:text-white/90">Inbox</li>
              ) : (
                // A sub-folder — Inbox links back, the folder is current: Dashboard > Inbox > {Folder}.
                <>
                  <li>
                    <Link
                      className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400"
                      href="/inbox"
                    >
                      Inbox
                      <BreadcrumbChevron />
                    </Link>
                  </li>
                  <li className="text-sm text-gray-800 dark:text-white/90">{folderLabel(folder)}</li>
                </>
              )}
            </ol>
          </nav>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          Every conversation across your channels, in one queue.
        </p>

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
