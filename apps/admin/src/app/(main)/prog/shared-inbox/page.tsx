'use client';

// Shared Inbox — list view. A functional clone of the Channels → Email page
// (app/(main)/prog/email/page.tsx), rehomed to /prog/shared-inbox as the base
// for the unified cross-channel queue. Same structure + interactions; mock data
// is themed to span Email / Text / WhatsApp / Calls so it reads as a shared inbox.
// Next step is to back this with the real inbox API rather than the mock array.
import { useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/prog/ui/input';
import Checkbox from '@/components/prog/ui/form-elements/Checkbox';
import SharedInboxSidebar from '@/components/prog/shared-inbox/sidebar';
import {
  Star,
  Search,
  ChevronDown,
  MoreHorizontal,
  RefreshCw,
  Trash,
  Archive,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface Conversation {
  id: string;
  hash: string;
  sender: string;
  subject: string;
  preview: string;
  time: string;
  isStarred: boolean;
  label?: string;
  labelColor?: string;
}

const mockConversations: Conversation[] = [
  {
    id: '1',
    hash: 'priya',
    sender: 'Priya Nandakumar',
    subject: 'Re: Volunteer induction this Saturday',
    preview: "Thanks for the details — I'll be there at 9. Quick question about parking…",
    time: '8:02 am',
    isStarred: true,
    label: 'Email',
    labelColor: 'bg-indigo-100 text-indigo-700'
  },
  {
    id: '2',
    hash: 'marcus',
    sender: 'Marcus Webb',
    subject: 'Phone bank shift swap',
    preview: 'Can I swap to the Tuesday phone bank instead? Something came up Saturday 🙏',
    time: '7:48 am',
    isStarred: false,
    label: 'WhatsApp',
    labelColor: 'bg-green-100 text-green-700'
  },
  {
    id: '3',
    hash: 'deb',
    sender: 'Deb Castellano',
    subject: 'Saturday Climate Rally',
    preview: 'YES count me in for the rally on Saturday 🙌 Can I bring my two kids?',
    time: '7:31 am',
    isStarred: false,
    label: 'Text',
    labelColor: 'bg-blue-100 text-blue-700'
  },
  {
    id: '4',
    hash: 'vm',
    sender: '+61 401 556 098',
    subject: 'Voicemail · 0:42',
    preview: '“…really concerned about the new coal approval that went through this week…”',
    time: '7:05 am',
    isStarred: false,
    label: 'Call',
    labelColor: 'bg-orange-100 text-orange-700'
  },
  {
    id: '5',
    hash: 'jordan',
    sender: 'Jordan (website)',
    subject: 'Update monthly donation',
    preview: "How do I update my monthly donation amount? I'd like to bump it from $25 to $40.",
    time: 'Yesterday',
    isStarred: false,
    label: 'Live chat',
    labelColor: 'bg-sky-100 text-sky-700'
  },
  {
    id: '6',
    hash: 'ff',
    sender: '@frontline_friends',
    subject: 'Petition link?',
    preview: 'Loved the reel! Where do we sign the petition? 🌏',
    time: 'Yesterday',
    isStarred: false,
    label: 'Social',
    labelColor: 'bg-pink-100 text-pink-700'
  },
  {
    id: '7',
    hash: 'helen',
    sender: 'Helen Zhao',
    subject: 'Receipt request for June donation',
    preview: "Could you please re-send the tax receipt for my June monthly donation?",
    time: 'Tue',
    isStarred: true,
    label: 'Email',
    labelColor: 'bg-indigo-100 text-indigo-700'
  },
  {
    id: '8',
    hash: 'sam',
    sender: 'Sam Patel',
    subject: 'Opted out',
    preview: 'STOP',
    time: 'Mon',
    isStarred: false,
    label: 'Text',
    labelColor: 'bg-blue-100 text-blue-700'
  }
];

export default function SharedInboxPage() {
  const [selectedConversations, setSelectedConversations] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState('inbox');

  const handleSelectAll = () => {
    if (selectedConversations.length === mockConversations.length) {
      setSelectedConversations([]);
    } else {
      setSelectedConversations(mockConversations.map((c) => c.id));
    }
  };

  const handleSelectConversation = (id: string) => {
    setSelectedConversations((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const filtered = mockConversations.filter((c) =>
    c.sender.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.preview.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="page-stack">
      <div className="">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Shared inbox</h2>
          <nav>
            <ol className="flex items-center gap-1.5">
              <li>
                <a className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400" href="/">
                  Home
                  <svg className="stroke-current" width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6.0765 12.667L10.2432 8.50033L6.0765 4.33366" stroke="" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"></path>
                  </svg>
                </a>
              </li>
              <li className="text-sm text-gray-800 dark:text-white/90">Shared inbox</li>
            </ol>
          </nav>
        </div>

        <div className="sm:h-[calc(100vh-174px)] h-screen xl:h-[calc(100vh-186px)]">
          <div className="xl:grid xl:grid-cols-12 flex flex-col gap-5 sm:gap-5">
            {/* Sidebar */}
            <SharedInboxSidebar
              activeFolder={activeFolder}
              onFolderChange={setActiveFolder}
            />

            {/* Main Content */}
            <div className="rounded-2xl xl:col-span-9 w-full border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
              {/* Header */}
              <div className="flex flex-col justify-between gap-3 p-4 border-b border-gray-200 dark:border-gray-800 sm:flex-row">
                <div className="flex items-center w-full gap-2">
                  <div className="relative w-full sm:w-auto">
                    <button className="flex items-center dropdown-toggle justify-between w-full gap-3 p-3 border border-gray-200 rounded-lg dark:border-gray-800 sm:justify-center">
                      <label className="flex items-center space-x-3 group cursor-pointer">
                        <Checkbox
                          checked={selectedConversations.length === mockConversations.length}
                          onChange={handleSelectAll}
                        />
                      </label>
                      <span className="text-gray-500 duration-300 dropdown-toggle ease-linear dark:text-gray-40">
                        <ChevronDown className="w-4 h-4" />
                      </span>
                    </button>
                  </div>

                  <button className="flex items-center justify-center w-full h-10 text-gray-500 transition-colors border border-gray-200 rounded-lg max-w-10 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
                    <RefreshCw className="w-5 h-5" />
                  </button>

                  <button className="flex items-center justify-center w-full h-10 text-gray-500 transition-colors border border-gray-200 rounded-lg max-w-10 hover:bg-gray-100 hover:text-error-500 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-error-500">
                    <Trash className="w-5 h-5" />
                  </button>

                  <button className="flex items-center justify-center w-full h-10 text-gray-500 border border-gray-200 rounded-lg max-w-10 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
                    <Archive className="w-5 h-5" />
                  </button>

                  <div className="relative inline-block">
                    <button className="flex items-center w-10 dropdown-toggle text-gray-500 justify-center h-10 transition-colors border border-gray-200 rounded-lg max-w-10 dark:text-gray-400 hover:bg-gray-100 dark:border-white/[0.05] dark:hover:bg-gray-800">
                      <MoreHorizontal className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                <div className="w-full sm:max-w-[236px]">
                  <form>
                    <div className="relative">
                      <span className="absolute -translate-y-1/2 left-4 top-1/2 pointer-events-none">
                        <Search className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                      </span>
                      <Input
                        placeholder="Search every channel..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pl-[42px] text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                      />
                    </div>
                  </form>
                </div>
              </div>

              {/* Conversation List */}
              <div className="max-h-[510px] 2xl:max-h-[630px] overflow-y-auto">
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                  {filtered.map((c) => (
                    <Link key={c.id} href={`/prog/shared-inbox/${c.hash || c.id}`}>
                      <div className="flex cursor-pointer items-center px-4 py-4 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-white/[0.03]">
                        <div className="flex items-center w-1/5">
                          <label className="flex items-center space-x-3 group cursor-pointer" onClick={(e) => e.preventDefault()}>
                            <Checkbox
                              checked={selectedConversations.includes(c.id)}
                              onChange={() => handleSelectConversation(c.id)}
                            />
                          </label>
                          <span className="ml-3 text-gray-400 cursor-pointer" onClick={(e) => e.preventDefault()}>
                            <Star className={`w-5 h-5 ${c.isStarred ? 'fill-current text-yellow-400' : ''}`} />
                          </span>
                          <span className="ml-3 text-sm text-gray-700 truncate dark:text-gray-400">{c.sender}</span>
                        </div>

                        <div className="flex items-center w-3/5 gap-3">
                          <p className="text-sm text-gray-500 truncate">
                            <span className="font-medium text-gray-700 dark:text-gray-300">{c.subject}</span>
                            <span className="mx-1.5 text-gray-300 dark:text-gray-600">—</span>
                            {c.preview}
                          </p>
                          {c.label && (
                            <span className={`hidden rounded-full px-2 py-0.5 text-xs font-medium sm:inline-block ${c.labelColor}`}>
                              {c.label}
                            </span>
                          )}
                        </div>

                        <div className="w-1/5 text-right">
                          <span className="block text-xs text-gray-400">{c.time}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 flex items-center rounded-b-2xl justify-between border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-[#171f2f]">
                <p className="text-sm text-gray-500 dark:text-gray-400">Showing {filtered.length} of 48</p>
                <div className="flex items-center justify-end gap-2">
                  <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400 dark:hover:bg-white/[0.03]">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400 dark:hover:bg-white/[0.03]">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
