'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Breadcrumbs from '@/components/prog/shared/breadcrumbs';
import { ChevronLeft, ChevronRight, Paperclip } from 'lucide-react';

type TicketStatus = 'in-progress' | 'solved' | 'on-hold';

interface Message {
  id: string;
  author: string;
  email: string;
  initials: string;
  bgColor: string;
  date: string;
  body: string[];
  listItems?: string[];
  isSupport?: boolean;
}

const mockMessages: Message[] = [
  {
    id: '1',
    author: 'John Doe',
    email: 'jhondelin@gmail.com',
    initials: 'JD',
    bgColor: 'bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400',
    date: 'Mon, 3:20 PM (2 hrs ago)',
    body: [
      'Hi Support Team,',
      'I hope you\'re doing well.',
      'I\'m currently working on customizing the dashboard and would like to add a new section labeled "Reports." Before I proceed, I wanted to check if there\'s any official guide or best practice you recommend for adding custom pages within the structure.',
    ],
  },
  {
    id: '2',
    author: 'Support Team',
    email: 'From - support team',
    initials: 'ST',
    bgColor: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400',
    date: 'Mon, 4:05 PM (1 hr ago)',
    isSupport: true,
    body: [
      'Hi John,',
      'Thanks for reaching out – and great to hear you\'re customizing the dashboard to fit your needs! Yes, you can definitely add custom pages like a "Reports" section, and it\'s quite straightforward. Here\'s a quick guide to help you get started:',
      'To include your new page in the sidebar:',
    ],
    listItems: [
      'Go to the sidebar configuration file (sidebarData.ts or similar)',
      'Add a new entry with the label "Reports" and route /reports',
    ],
  },
  {
    id: '3',
    author: 'John Doe',
    email: 'jhondelin@gmail.com',
    initials: 'JD',
    bgColor: 'bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400',
    date: 'Mon, 5:10 PM (30 min ago)',
    body: [
      'Hi Support Team,',
      'Thank you for the detailed response!',
      'I followed the steps you outlined and was able to successfully add the "Reports" section to the sidebar. However, I\'m now encountering an issue where the sidebar doesn\'t collapse properly on mobile devices. Could you provide guidance on fixing the responsive behavior?',
    ],
  },
];

const ticketDetails = {
  customer: 'John Doe',
  email: 'jhondelin@gmail.com',
  ticketId: '#346520',
  category: 'General Support',
  created: 'Dec 20, 2028',
  status: 'In Progress' as const,
};

export default function TicketReplyPage() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.id as string;
  const [status, setStatus] = useState<TicketStatus>('in-progress');
  const [reply, setReply] = useState('');

  const statusOptions: { value: TicketStatus; label: string }[] = [
    { value: 'in-progress', label: 'In-Progress' },
    { value: 'solved', label: 'Solved' },
    { value: 'on-hold', label: 'On-Hold' },
  ];

  return (
    <div className="mx-auto max-w-screen-2xl p-4 pb-10 md:p-6 md:pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Ticket Reply</h2>
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Support Tickets', href: '/admin/support-tickets' },
            { label: 'Ticket Reply' },
          ]}
        />
      </div>

      <div className="overflow-hidden xl:h-[calc(100vh-180px)]">
        <div className="grid h-full grid-cols-1 gap-5 xl:grid-cols-12">
          {/* Left - Conversation */}
          <div className="xl:col-span-8 2xl:col-span-9">
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
              {/* Header */}
              <div className="flex flex-col justify-between gap-5 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-center dark:border-gray-800">
                <div>
                  <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">
                    Ticket #{ticketId} - Sidebar not responsive on mobile
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Mon,&nbsp;3:20 PM&nbsp;(2 days ago)
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">4 of 120</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => router.back()}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white/90"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white/90">
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="relative px-6 py-7">
                {/* Messages */}
                <div className="custom-scrollbar h-[calc(58vh-162px)] space-y-7 divide-y divide-gray-200 overflow-y-auto pr-2 dark:divide-gray-800">
                  {mockMessages.map((message) => (
                    <article key={message.id} className={message.id !== '1' ? 'pt-7' : ''}>
                      <div className="mb-6 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium ${message.bgColor}`}>
                            {message.initials}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                              {message.author}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {message.email}
                            </p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {message.date}
                          </p>
                        </div>
                      </div>
                      <div className="pb-6">
                        {message.body.map((paragraph, idx) => (
                          <p
                            key={idx}
                            className={`text-sm text-gray-500 dark:text-gray-400 ${
                              idx < message.body.length - 1 ? 'mb-5' : ''
                            }`}
                          >
                            {paragraph}
                          </p>
                        ))}
                        {message.listItems && (
                          <ul className="mt-2 list-inside list-disc pl-2 text-sm text-gray-500 dark:text-gray-400">
                            {message.listItems.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </article>
                  ))}
                </div>

                {/* Reply Input */}
                <div className="pt-5">
                  <div className="mx-auto max-h-[162px] w-full rounded-2xl border border-gray-200 shadow-xs dark:border-gray-800 dark:bg-gray-800">
                    <textarea
                      placeholder="Type your reply here..."
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      className="h-20 w-full resize-none border-none bg-transparent p-5 font-normal text-gray-800 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-white"
                    />
                    <div className="flex items-center justify-between p-3">
                      <button className="flex h-9 items-center gap-1.5 rounded-lg bg-transparent px-2 py-3 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-300">
                        <Paperclip className="h-5 w-5" />
                        Attach
                      </button>
                      <button className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600">
                        Reply
                      </button>
                    </div>
                  </div>
                </div>

                {/* Status */}
                <div className="mt-6 flex flex-wrap items-center gap-4">
                  <span className="text-gray-500 dark:text-gray-400">Status:</span>
                  <div className="flex items-center gap-4">
                    {statusOptions.map((option) => (
                      <label
                        key={option.value}
                        className="flex cursor-pointer select-none items-center text-sm font-medium text-gray-700 dark:text-gray-400"
                      >
                        <div className="relative mr-3">
                          <input
                            type="radio"
                            name="ticket-status"
                            value={option.value}
                            checked={status === option.value}
                            onChange={() => setStatus(option.value)}
                            className="sr-only"
                          />
                          <div
                            className={`flex h-4 w-4 items-center justify-center rounded-full border-[1.25px] transition-colors hover:border-brand-500 dark:hover:border-brand-500 ${
                              status === option.value
                                ? 'border-brand-500 bg-brand-500'
                                : 'border-gray-300 bg-transparent dark:border-gray-700'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                status === option.value
                                  ? 'bg-white'
                                  : 'bg-white dark:bg-gray-900'
                              }`}
                            />
                          </div>
                        </div>
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right - Ticket Details */}
          <div className="xl:col-span-4 2xl:col-span-3">
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="border-b border-gray-200 px-6 py-5 dark:border-gray-800">
                <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">
                  Ticket Details
                </h3>
              </div>
              <ul className="divide-y divide-gray-100 px-6 py-3 dark:divide-gray-800">
                <li className="grid grid-cols-2 gap-5 py-2.5">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Customer</span>
                  <span className="text-sm text-gray-700 dark:text-gray-400">{ticketDetails.customer}</span>
                </li>
                <li className="grid grid-cols-2 gap-5 py-2.5">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Email</span>
                  <span className="break-words text-sm text-gray-700 dark:text-gray-400">{ticketDetails.email}</span>
                </li>
                <li className="grid grid-cols-2 gap-5 py-2.5">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Ticket ID</span>
                  <span className="text-sm text-gray-700 dark:text-gray-400">#{ticketId}</span>
                </li>
                <li className="grid grid-cols-2 gap-5 py-2.5">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Category</span>
                  <span className="text-sm text-gray-700 dark:text-gray-400">{ticketDetails.category}</span>
                </li>
                <li className="grid grid-cols-2 gap-5 py-2.5">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Created</span>
                  <span className="text-sm text-gray-700 dark:text-gray-400">{ticketDetails.created}</span>
                </li>
                <li className="grid grid-cols-2 gap-5 py-2.5">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Status</span>
                  <div>
                    <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-500 dark:bg-blue-500/15 dark:text-blue-400">
                      {ticketDetails.status}
                    </span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
