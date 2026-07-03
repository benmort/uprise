'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import EmailSidebar from '@/components/prog/email/sidebar';
import {
  Mail,
  ArrowLeft,
  Trash,
  Archive,
  Info,
  ChevronLeft,
  ChevronRight,
  Reply,
  Forward,
  ReplyAll,
  Paperclip
} from 'lucide-react';

interface EmailDetail {
  id: string;
  hash: string;
  sender: string;
  senderEmail: string;
  subject: string;
  content: string;
  time: string;
  isStarred: boolean;
  isImportant?: boolean;
  label?: string;
  labelColor?: string;
  attachments?: Attachment[];
}

interface Attachment {
  id: string;
  name: string;
  type: string;
  size: string;
  icon: string;
}

const mockEmailDetail: EmailDetail = {
  id: '1',
  hash: 'abc123',
  sender: 'Codescandy',
  senderEmail: 'hello@example.com',
  subject: 'Contact For "Website Design"',
  content: `Hello Dear Alexander,

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Praesent ut rutrum mi. Aenean ac leo non justo suscipit consectetur. Nam vestibulum eleifend magna quis porta. ipsum dolor sit amet, consectetur adipiscing elit. Praesent ut rutrum mi. Aenean ac leo

Praesent ut rutrum mi. Aenean ac leo non justo suscipit consectetur. Nam vestibulum eleifend magna quis porta.

Nullam tincidunt sodales diam, quis rhoncus dolor aliquet a. Nulla a rhoncus lectus. In nunc neque, pellentesque non massa ornare, accumsan ornare massa. odales diam, quis rhoncus dolor aliquet a. Nulla a rhoncus lectus. In nunc neque

Suspendisse semper vel turpis vitae aliquam. Aenean semper dui in consequat ullamcorper.

Nullam tincidunt sodales diam, quis rhoncus dolor aliquet a. Nulla a rhoncus lectus. In nunc neque, pellentesque non massa ornare, accumsan ornare massa. sodales diam, quis rhoncus dolor aliquet a. Nulla a rhoncus lectus. In nunc neque

Praesent ut rutrum mi. Aenean ac leo non justo suscipit consectetur. Nam vestibulum eleifend magna quis porta.`,
  time: '12:16 pm',
  isStarred: true,
  isImportant: true,
  label: 'Important',
  labelColor: 'bg-red-100 text-red-700',
  attachments: [
    {
      id: '1',
      name: 'Guidelines.pdf',
      type: 'PDF',
      size: '2.4 MB',
      icon: '/images/task/pdf.svg'
    },
    {
      id: '2',
      name: 'Branding Assets',
      type: 'Media',
      size: '15.2 MB',
      icon: '/images/task/google-drive.svg'
    }
  ]
};



export default function EmailDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [activeFolder, setActiveFolder] = useState('inbox');
  const hash = params.hash as string;

  // In a real app, you would fetch the email based on the hash
  const email = mockEmailDetail;

  const handleBack = () => {
    router.push('/future/email');
  };

  const handleReply = () => {
    // TODO: Implement reply functionality
    console.log('Reply to email:', email.id);
  };

  const handleReplyAll = () => {
    // TODO: Implement reply all functionality
    console.log('Reply all to email:', email.id);
  };

  const handleForward = () => {
    // TODO: Implement forward functionality
    console.log('Forward email:', email.id);
  };

  const handleDownloadAttachment = (attachment: Attachment) => {
    // TODO: Implement download functionality
    console.log('Download attachment:', attachment.name);
  };

  return (
    <div className="page-stack">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Inbox Details</h2>
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
              <li className="text-sm text-gray-800 dark:text-white/90">Inbox Details</li>
            </ol>
          </nav>
        </div>

        <div className="sm:h-[calc(100vh-174px)] xl:h-[calc(100vh-186px)]">
          <div className="xl:grid xl:grid-cols-12 flex flex-col gap-5 sm:gap-5">
            {/* Sidebar */}
            <EmailSidebar
              activeFolder={activeFolder}
              onFolderChange={setActiveFolder}
            />

            {/* Main Content */}
            <div className="xl:col-span-9 w-full">
              <div className="flex flex-col justify-between overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] xl:h-full">
                {/* Header */}
                <div className="flex flex-col justify-between border-b border-gray-200 dark:border-gray-800 sm:flex-row">
                  <div className="flex items-center justify-between w-full gap-3 px-4 py-4 sm:justify-normal">
                    <button
                      onClick={handleBack}
                      className="flex h-10 w-full max-w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 hover:text-gray-800 dark:border-gray-800 dark:bg-white/[0.03] transition dark:text-gray-400 dark:hover:bg-white/[0.07] dark:hover:text-gray-200"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-3">
                      <div className="flex">
                        <button className="flex h-10 w-10 items-center justify-center text-gray-500 ring-1 ring-inset ring-gray-200 first:rounded-l-lg last:rounded-r-lg hover:bg-gray-100 transition hover:text-error-500 dark:bg-white/[0.03] dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.05] dark:hover:text-error-500">
                          <Trash className="w-5 h-5" />
                        </button>
                        <button className="-ml-px flex h-10 w-10 items-center justify-center text-gray-500 ring-1 ring-inset ring-gray-200 first:rounded-l-lg last:rounded-r-lg hover:bg-gray-100 transition hover:text-gray-700 dark:bg-white/[0.03] dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.05] dark:hover:text-white">
                          <Info className="w-5 h-5" />
                        </button>
                        <button className="-ml-px flex h-10 w-10 items-center justify-center rounded-r-lg text-gray-500 ring-1 ring-inset ring-gray-200 first:rounded-l-lg last:rounded-r-lg hover:bg-gray-100 hover:text-gray-700 dark:bg-white/[0.03] dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.05] transition dark:hover:text-white">
                          <Archive className="w-5 h-5" />
                        </button>
                      </div>
                      <button className="flex h-10 transition w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200">
                        <Mail className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between w-full gap-4 px-4 py-3 border-t border-gray-200 dark:border-gray-800 sm:justify-end sm:border-t-0 sm:py-5">
                    <p className="text-sm text-gray-500 dark:text-gray-400">4 of 120</p>
                    <div className="flex items-center justify-end gap-2">
                      <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:text-gray-200 dark:text-gray-400 dark:hover:bg-white/[0.07] transition">
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:text-gray-200 dark:text-gray-400 dark:hover:bg-white/[0.07] transition">
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Email Content */}
                <div className="max-h-[500px] 2xl:max-h-[780px] overflow-y-auto">
                  <div className="p-5 xl:p-6">
                    {/* Email Header */}
                    <div className="flex items-center gap-3 mb-9">
                      <div className="w-12 h-12 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                        <span className="text-lg font-semibold text-gray-600 dark:text-gray-300">
                          {email.sender.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <span className="mb-0.5 block text-sm font-medium text-gray-800 dark:text-white/90">
                          {email.subject}
                        </span>
                        <span className="block text-gray-500 text-xs dark:text-gray-400">
                          {email.sender} {email.senderEmail}
                        </span>
                      </div>
                    </div>

                    {/* Email Body */}
                    <div className="text-sm text-gray-500 mb-7 dark:text-gray-400 whitespace-pre-line">
                      {email.content}
                    </div>

                    {/* Attachments */}
                    {email.attachments && email.attachments.length > 0 && (
                      <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 sm:p-4">
                        <div className="flex items-center gap-2 mb-5">
                          <Paperclip className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                          <span className="text-sm text-gray-700 dark:text-gray-400">
                            {email.attachments.length} Attachments
                          </span>
                        </div>
                        <div className="flex flex-col items-center gap-3 sm:flex-row">
                          {email.attachments.map((attachment) => (
                            <div
                              key={attachment.id}
                              onClick={() => handleDownloadAttachment(attachment)}
                              className="relative hover:border-gray-300 dark:hover:border-white/[0.05] flex w-full cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white py-2.5 pl-3 pr-5 dark:border-gray-800 dark:bg-white/5 sm:w-auto"
                            >
                              <div className="w-full h-10 max-w-10 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                                  {attachment.type}
                                </span>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                                  {attachment.name}
                                </p>
                                <span className="flex items-center gap-1.5">
                                  <span className="text-gray-500 text-xs dark:text-gray-400">
                                    {attachment.type}
                                  </span>
                                  <span className="inline-block w-1 h-1 bg-gray-400 rounded-full"></span>
                                  <span className="text-gray-500 text-xs dark:text-gray-400">
                                    Download
                                  </span>
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="sticky bottom-0 border-t border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#171f2f]">
                  <div className="flex flex-wrap sm:flex-row flex-col gap-3">
                    <button
                      onClick={handleReply}
                      className="items-center inline-flex justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-500 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
                    >
                      <Reply className="w-5 h-5" />
                      Reply
                    </button>
                    <button
                      onClick={handleReplyAll}
                      className="items-center inline-flex justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-500 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
                    >
                      <ReplyAll className="w-5 h-5" />
                      Reply all
                    </button>
                    <button
                      onClick={handleForward}
                      className="items-center inline-flex justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-500 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
                    >
                      <Forward className="w-5 h-5" />
                      Forward
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
