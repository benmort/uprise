'use client';

// Shared Inbox sidebar. The selected folder is the URL path segment (/inbox/<folder>,
// with the default 'inbox' folder at the bare /inbox), so each mailbox folder is a
// <Link> and the active state derives from useParams() — no local state. Filters/labels
// are decorative placeholders until the backend models them.
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Button } from '@uprise/ui';
import { Mail, Send, Inbox, Trash2, Star, AlertCircle, Archive as ArchiveIcon } from 'lucide-react';

interface SharedInboxSidebarProps {
  /** Opens the "Start a new conversation" channel picker. */
  onCompose?: () => void;
}

const MAILBOX: { key: string; label: string; icon: typeof Inbox; count?: number }[] = [
  { key: 'inbox', label: 'Unified inbox', icon: Inbox, count: 24 },
  { key: 'mine', label: 'Assigned to me', icon: Star, count: 6 },
  { key: 'unassigned', label: 'Unassigned', icon: AlertCircle, count: 5 },
  { key: 'sent', label: 'Sent', icon: Send },
  { key: 'drafts', label: 'Drafts', icon: Mail },
  { key: 'resolved', label: 'Resolved', icon: ArchiveIcon },
  { key: 'trash', label: 'Trash', icon: Trash2 },
];

const labels = [
  { name: 'Volunteers', color: '#12B76A' },
  { name: 'Donors', color: '#FD853A' },
  { name: 'Media', color: '#F04438' },
  { name: 'Casework', color: '#36BFFA' },
  { name: 'VIP', color: '#6172F3' },
];

export default function SharedInboxSidebar({ onCompose }: SharedInboxSidebarProps) {
  const params = useParams();
  const search = useSearchParams();
  const activeFolder = String(params.folder ?? 'inbox');
  const query = search.toString();

  // The default 'inbox' folder lives at the bare /inbox; the others nest under it.
  const folderBase = (key: string) => (key === 'inbox' ? '/inbox' : `/inbox/${key}`);
  const folderHref = (key: string) => `${folderBase(key)}${query ? `?${query}` : ''}`;
  const folderClass = (key: string) =>
    `group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
      activeFolder === key
        ? 'text-brand-500 bg-brand-50 dark:text-brand-400 dark:bg-brand-500/[0.12] hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-500/[0.12] dark:hover:text-brand-400'
        : 'text-gray-500 dark:text-gray-400 hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-500/[0.12] dark:hover:text-brand-400'
    }`;

  return (
    <div className="xl:col-span-3 col-span-full">
      <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="pb-5">
          <Button
            type="button"
            onClick={onCompose}
            className="flex items-center justify-center w-full gap-2 p-3 text-sm font-medium text-white rounded-lg bg-brand-500 shadow-theme-xs hover:bg-brand-600"
          >
            <Send className="w-5 h-5" />
            Compose
          </Button>
        </div>

        <div className="max-h-[550px] 2xl:max-h-[670px] overflow-y-auto">
          <nav className="space-y-5">
            {/* Mailbox Section */}
            <div>
              <h3 className="mb-3 text-xs font-medium uppercase leading-[18px] text-gray-700 dark:text-gray-400">MAILBOX</h3>
              <ul className="flex flex-col gap-1">
                {MAILBOX.map(({ key, label, icon: Icon, count }) => (
                  <li key={key}>
                    <Link href={folderHref(key)} className={folderClass(key)}>
                      <span className="flex items-center gap-3">
                        <Icon className="w-5 h-5" />
                        {label}
                      </span>
                      {count != null ? <span>{count}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Filter Section (decorative until backend support) */}
            <div>
              <h3 className="mb-3 text-xs font-medium uppercase leading-[18px] text-gray-700 dark:text-gray-400">FILTER</h3>
              <ul className="flex flex-col gap-1">
                <li>
                  <Link
                    href={`${folderBase(activeFolder)}?filter=priority`}
                    className="group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-500/[0.12] dark:hover:text-brand-400"
                  >
                    <span className="flex items-center gap-3">
                      <Star className="w-5 h-5" />
                      Starred
                    </span>
                  </Link>
                </li>
                <li>
                  <Link
                    href={`${folderBase(activeFolder)}?filter=priority`}
                    className="group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-500/[0.12] dark:hover:text-brand-400"
                  >
                    <span className="flex items-center gap-3">
                      <AlertCircle className="w-5 h-5" />
                      Priority
                    </span>
                  </Link>
                </li>
              </ul>
            </div>

            {/* Label Section (decorative) */}
            <div>
              <h3 className="mb-3 text-xs font-medium uppercase leading-[18px] text-gray-700 dark:text-gray-400">LABEL</h3>
              <ul className="flex flex-col gap-1">
                {labels.map((label) => (
                  <li key={label.name}>
                    <button className="group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-500/[0.12] dark:hover:text-brand-400">
                      <span className="flex items-center gap-3">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M11.7567 3.89683C11.6331 3.72282 11.4696 3.58089 11.28 3.48289C11.0904 3.3849 10.8801 3.33367 10.6667 3.3335L3.33333 3.34016C2.59667 3.34016 2 3.93016 2 4.66683V11.3335C2 12.0702 2.59667 12.6602 3.33333 12.6602L10.6667 12.6668C11.1167 12.6668 11.5133 12.4435 11.7567 12.1035L14.6667 8.00016L11.7567 3.89683Z" fill={label.color}></path>
                        </svg>
                        {label.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
