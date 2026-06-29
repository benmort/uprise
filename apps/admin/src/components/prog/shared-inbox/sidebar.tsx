'use client';

// Functional clone of the Channels → Email sidebar (components/prog/email/sidebar.tsx),
// rehomed for the new unified Shared Inbox. Same interaction model; the folder/label
// set is the starting point for the cross-channel queue (Text/WhatsApp/Email/Calls).
import { useState } from 'react';
import { Button } from '@/components/prog/ui/button';
import {
  Mail,
  Send,
  Inbox,
  Trash2,
  Star,
  AlertCircle,
  Archive as ArchiveIcon
} from 'lucide-react';

interface SharedInboxSidebarProps {
  activeFolder?: string;
  onFolderChange?: (folder: string) => void;
}

const labels = [
  { name: 'Volunteers', color: '#12B76A' },
  { name: 'Donors', color: '#FD853A' },
  { name: 'Media', color: '#F04438' },
  { name: 'Casework', color: '#36BFFA' },
  { name: 'VIP', color: '#6172F3' }
];

export default function SharedInboxSidebar({ activeFolder = 'inbox', onFolderChange }: SharedInboxSidebarProps) {
  const [localActiveFolder, setLocalActiveFolder] = useState(activeFolder);

  const handleFolderClick = (folder: string) => {
    setLocalActiveFolder(folder);
    onFolderChange?.(folder);
  };

  const folderClass = (folder: string) =>
    `group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
      localActiveFolder === folder
        ? 'text-brand-500 bg-brand-50 dark:text-brand-400 dark:bg-brand-500/[0.12] hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-500/[0.12] dark:hover:text-brand-400'
        : 'text-gray-500 dark:text-gray-400 hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-500/[0.12] dark:hover:text-brand-400'
    }`;

  return (
    <div className="xl:col-span-3 col-span-full">
      <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="pb-5">
          <Button className="flex items-center justify-center w-full gap-2 p-3 text-sm font-medium text-white rounded-lg bg-brand-500 shadow-theme-xs hover:bg-brand-600">
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
                <li>
                  <button className={folderClass('inbox')} onClick={() => handleFolderClick('inbox')}>
                    <span className="flex items-center gap-3">
                      <Inbox className="w-5 h-5" />
                      Unified inbox
                    </span>
                    <span>24</span>
                  </button>
                </li>
                <li>
                  <button className={folderClass('mine')} onClick={() => handleFolderClick('mine')}>
                    <span className="flex items-center gap-3">
                      <Star className="w-5 h-5" />
                      Assigned to me
                    </span>
                    <span>6</span>
                  </button>
                </li>
                <li>
                  <button className={folderClass('unassigned')} onClick={() => handleFolderClick('unassigned')}>
                    <span className="flex items-center gap-3">
                      <AlertCircle className="w-5 h-5" />
                      Unassigned
                    </span>
                    <span>5</span>
                  </button>
                </li>
                <li>
                  <button className={folderClass('sent')} onClick={() => handleFolderClick('sent')}>
                    <span className="flex items-center gap-3">
                      <Send className="w-5 h-5" />
                      Sent
                    </span>
                  </button>
                </li>
                <li>
                  <button className={folderClass('drafts')} onClick={() => handleFolderClick('drafts')}>
                    <span className="flex items-center gap-3">
                      <Mail className="w-5 h-5" />
                      Drafts
                    </span>
                  </button>
                </li>
                <li>
                  <button className={folderClass('resolved')} onClick={() => handleFolderClick('resolved')}>
                    <span className="flex items-center gap-3">
                      <ArchiveIcon className="w-5 h-5" />
                      Resolved
                    </span>
                  </button>
                </li>
                <li>
                  <button className={folderClass('trash')} onClick={() => handleFolderClick('trash')}>
                    <span className="flex items-center gap-3">
                      <Trash2 className="w-5 h-5" />
                      Trash
                    </span>
                  </button>
                </li>
              </ul>
            </div>

            {/* Filter Section */}
            <div>
              <h3 className="mb-3 text-xs font-medium uppercase leading-[18px] text-gray-700 dark:text-gray-400">FILTER</h3>
              <ul className="flex flex-col gap-1">
                <li>
                  <button className="group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-500/[0.12] dark:hover:text-brand-400">
                    <span className="flex items-center gap-3">
                      <Star className="w-5 h-5" />
                      Starred
                    </span>
                  </button>
                </li>
                <li>
                  <button className="group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-500/[0.12] dark:hover:text-brand-400">
                    <span className="flex items-center gap-3">
                      <AlertCircle className="w-5 h-5" />
                      Priority
                    </span>
                  </button>
                </li>
              </ul>
            </div>

            {/* Label Section */}
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
