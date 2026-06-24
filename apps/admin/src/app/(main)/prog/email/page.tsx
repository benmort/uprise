'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/prog/ui/input';
import Checkbox from '@/components/prog/ui/form-elements/Checkbox';
import EmailSidebar from '@/components/prog/email/sidebar';
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

interface Email {
  id: string;
  hash: string;
  sender: string;
  subject: string;
  preview: string;
  time: string;
  isStarred: boolean;
  isImportant?: boolean;
  label?: string;
  labelColor?: string;
}

const mockEmails: Email[] = [
  {
    id: '1',
    hash: 'abc123',
    sender: 'Material UI',
    subject: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    preview: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    time: '12:16 pm',
    isStarred: true,
    isImportant: true,
    label: 'Important',
    labelColor: 'bg-red-100 text-red-700'
  },
  {
    id: '2',
    hash: 'def456',
    sender: 'Wise',
    subject: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    preview: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    time: '12:16 pm',
    isStarred: true
  },
  {
    id: '3',
    hash: 'ghi789',
    sender: 'Search Console',
    subject: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    preview: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    time: 'Apr, 24',
    isStarred: true,
    label: 'Social',
    labelColor: 'bg-green-100 text-green-700'
  },
  {
    id: '4',
    hash: 'jkl012',
    sender: 'Paypal',
    subject: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    preview: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    time: 'Apr, 30',
    isStarred: true
  },
  {
    id: '5',
    hash: 'mno345',
    sender: 'Google Meet',
    subject: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    preview: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    time: 'Apr, 16',
    isStarred: true
  },
  {
    id: '6',
    hash: 'pqr678',
    sender: 'Loom',
    subject: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    preview: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    time: 'Apr, 24',
    isStarred: true
  },
  {
    id: '7',
    hash: 'stu901',
    sender: 'Airbnb',
    subject: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    preview: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    time: 'Mar, 05',
    isStarred: true
  },
  {
    id: '8',
    hash: 'vwx234',
    sender: 'Facebook',
    subject: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    preview: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    time: 'Feb, 25',
    isStarred: true
  },
  {
    id: '9',
    hash: 'yza567',
    sender: 'Instagram',
    subject: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    preview: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    time: 'Feb, 20',
    isStarred: true,
    label: 'Promotional',
    labelColor: 'bg-blue-100 text-blue-700'
  },
  {
    id: '10',
    hash: 'bcd890',
    sender: 'Google',
    subject: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    preview: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    time: 'Feb, 25',
    isStarred: true
  },
  {
    id: '11',
    hash: 'efg123',
    sender: 'FormBold',
    subject: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    preview: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    time: 'Jan, 22',
    isStarred: true
  },
  {
    id: '12',
    hash: 'hij456',
    sender: 'GrayGrids',
    subject: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    preview: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    time: 'Feb, 25',
    isStarred: true
  },
  {
    id: '13',
    hash: 'klm789',
    sender: 'UIdeck',
    subject: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    preview: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit. Assumenda dolor dolore esse modi nesciunt, nobis numquam sed sequi sunt totam!',
    time: 'Feb, 15',
    isStarred: true
  }
];



export default function EmailPage() {
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState('inbox');

  const handleSelectAll = () => {
    if (selectedEmails.length === mockEmails.length) {
      setSelectedEmails([]);
    } else {
      setSelectedEmails(mockEmails.map(email => email.id));
    }
  };

  const handleSelectEmail = (emailId: string) => {
    setSelectedEmails(prev =>
      prev.includes(emailId)
        ? prev.filter(id => id !== emailId)
        : [...prev, emailId]
    );
  };

  const filteredEmails = mockEmails.filter(email =>
    email.sender.toLowerCase().includes(searchQuery.toLowerCase()) ||
    email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    email.preview.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-4 mx-auto max-w-7xl md:p-6">
      <div className="">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Inbox</h2>
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
              <li className="text-sm text-gray-800 dark:text-white/90">Inbox</li>
            </ol>
          </nav>
        </div>

        <div className="sm:h-[calc(100vh-174px)] h-screen xl:h-[calc(100vh-186px)]">
          <div className="xl:grid xl:grid-cols-12 flex flex-col gap-5 sm:gap-5">
            {/* Sidebar */}
            <EmailSidebar
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
                          checked={selectedEmails.length === mockEmails.length}
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
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pl-[42px] text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                      />
                    </div>
                  </form>
                </div>
              </div>

              {/* Email List */}
              <div className="max-h-[510px] 2xl:max-h-[630px] overflow-y-auto">
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                  {filteredEmails.map((email) => (
                    <Link key={email.id} href={`/prog/email/${email.hash || email.id}`}>
                      <div className="flex cursor-pointer items-center px-4 py-4 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-white/[0.03]">
                        <div className="flex items-center w-1/5">
                          <label className="flex items-center space-x-3 group cursor-pointer" onClick={(e) => e.preventDefault()}>
                            <Checkbox
                              checked={selectedEmails.includes(email.id)}
                              onChange={() => handleSelectEmail(email.id)}
                            />
                          </label>
                          <span className="ml-3 text-gray-400 cursor-pointer" onClick={(e) => e.preventDefault()}>
                            <Star className={`w-5 h-5 ${email.isStarred ? 'fill-current text-yellow-400' : ''}`} />
                          </span>
                          <span className="ml-3 text-sm text-gray-700 truncate dark:text-gray-400">{email.sender}</span>
                        </div>

                        <div className="flex items-center w-3/5 gap-3">
                          <p className="text-sm text-gray-500 truncate">{email.preview}</p>
                          {email.label && (
                            <span className={`hidden rounded-full px-2 py-0.5 text-xs font-medium sm:inline-block ${email.labelColor}`}>
                              {email.label}
                            </span>
                          )}
                        </div>

                        <div className="w-1/5 text-right">
                          <span className="block text-xs text-gray-400">{email.time}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 flex items-center rounded-b-2xl justify-between border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-[#171f2f]">
                <p className="text-sm text-gray-500 dark:text-gray-400">Showing 1 of 159</p>
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
