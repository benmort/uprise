'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/prog/ui/button';
import { Input } from '@/components/prog/ui/input';
import Checkbox from '@/components/prog/ui/form-elements/Checkbox';
import Breadcrumbs from '@/components/prog/shared/breadcrumbs';
import {
  MessageSquare,
  Clock,
  CheckCircle,
  Search,
  Filter,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface SupportTicket {
  id: string;
  ticketId: string;
  requestedBy: string;
  email: string;
  subject: string;
  createDate: string;
  status: 'solved' | 'pending';
}

const mockTickets: SupportTicket[] = [
  {
    id: '1',
    ticketId: '323534',
    requestedBy: 'Lindsey Curtis',
    email: 'demoemail@gmail.com',
    subject: 'Issue with Dashboard Login Access',
    createDate: '12 Feb, 2027',
    status: 'solved'
  },
  {
    id: '2',
    ticketId: '323535',
    requestedBy: 'Kaiya George',
    email: 'demoemail@gmail.com',
    subject: 'Billing Information Not Updating Properly',
    createDate: '13 Mar, 2027',
    status: 'pending'
  },
  {
    id: '3',
    ticketId: '323536',
    requestedBy: 'Zain Geidt',
    email: 'demoemail@gmail.com',
    subject: 'Bug Found in Dark Mode Layout',
    createDate: '19 Mar, 2027',
    status: 'pending'
  },
  {
    id: '4',
    ticketId: '323537',
    requestedBy: 'Abram Schleifer',
    email: 'demoemail@gmail.com',
    subject: 'Request to Add New Integration Feature',
    createDate: '25 Apr, 2027',
    status: 'solved'
  },
  {
    id: '5',
    ticketId: '323538',
    requestedBy: 'Mia Chen',
    email: 'mia.chen@email.com',
    subject: 'Unable to Reset Password',
    createDate: '28 Apr, 2027',
    status: 'pending'
  },
  {
    id: '6',
    ticketId: '323539',
    requestedBy: 'John Doe',
    email: 'john.doe@email.com',
    subject: 'Feature Request: Dark Mode',
    createDate: '30 Apr, 2027',
    status: 'solved'
  },
  {
    id: '7',
    ticketId: '323540',
    requestedBy: 'Jane Smith',
    email: 'jane.smith@email.com',
    subject: 'Error 500 on Dashboard',
    createDate: '01 May, 2027',
    status: 'pending'
  },
  {
    id: '8',
    ticketId: '323541',
    requestedBy: 'Carlos Ruiz',
    email: 'carlos.ruiz@email.com',
    subject: 'Cannot Download Invoice',
    createDate: '02 May, 2027',
    status: 'solved'
  },
  {
    id: '9',
    ticketId: '323542',
    requestedBy: 'Emily Clark',
    email: 'emily.clark@email.com',
    subject: 'UI Bug in Mobile View',
    createDate: '03 May, 2027',
    status: 'pending'
  },
  {
    id: '10',
    ticketId: '323543',
    requestedBy: 'Liam Wong',
    email: 'liam.wong@email.com',
    subject: 'Account Locked',
    createDate: '04 May, 2027',
    status: 'solved'
  }
];

export default function SupportTicketsPage() {
  const router = useRouter();
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilter(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTickets(mockTickets.map(ticket => ticket.id));
    } else {
      setSelectedTickets([]);
    }
  };

  const handleSelectTicket = (ticketId: string, checked: boolean) => {
    if (checked) {
      setSelectedTickets(prev => [...prev, ticketId]);
    } else {
      setSelectedTickets(prev => prev.filter(id => id !== ticketId));
    }
  };

  const filteredTickets = mockTickets.filter(ticket => {
    const matchesSearch = ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         ticket.requestedBy.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         ticket.ticketId.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter = activeFilter === 'all' || ticket.status === activeFilter;

    return matchesSearch && matchesFilter;
  });

  const totalTickets = mockTickets.length;
  const pendingTickets = mockTickets.filter(t => t.status === 'pending').length;
  const solvedTickets = mockTickets.filter(t => t.status === 'solved').length;

  return (
    <div className="p-4 mx-auto max-w-7xl md:p-6">
      <div>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Support List</h2>
          <Breadcrumbs
            items={[
              { label: 'Home', href: '/' },
              { label: 'Support List' }
            ]}
          />
        </div>

        {/* Stats Cards */}
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          <article className="flex gap-5 rounded-xl border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="bg-brand-500/10 text-brand-500 inline-flex h-14 w-14 items-center justify-center rounded-xl">
              <MessageSquare className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <h3 className="text-title-xs mb-1 font-semibold text-gray-800 dark:text-white/90">{totalTickets.toLocaleString()}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total tickets</p>
            </div>
          </article>

          <article className="flex gap-5 rounded-xl border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="bg-warning-500/10 text-warning-500 inline-flex h-14 w-14 items-center justify-center rounded-xl">
              <Clock className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <h3 className="text-title-xs mb-1 font-semibold text-gray-800 dark:text-white/90">{pendingTickets.toLocaleString()}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Pending tickets</p>
            </div>
          </article>

          <article className="flex gap-5 rounded-xl border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="bg-success-500/10 text-success-500 inline-flex h-14 w-14 items-center justify-center rounded-xl">
              <CheckCircle className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <h3 className="text-title-xs mb-1 font-semibold text-gray-800 dark:text-white/90">{solvedTickets.toLocaleString()}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Solved tickets</p>
            </div>
          </article>
        </div>

        {/* Tickets Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          {/* Table Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Support Tickets</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Your most recent support tickets list</p>
            </div>
            <div className="flex gap-3.5">
              {/* Filter Tabs */}
              <div className="hidden h-11 items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 lg:inline-flex dark:bg-gray-900">
                <button
                  className={`text-theme-sm h-10 rounded-md px-3 py-2 font-medium hover:text-gray-900 dark:hover:text-white shadow-theme-xs ${
                    activeFilter === 'all'
                      ? 'text-gray-900 dark:text-white bg-white dark:bg-gray-800'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                  onClick={() => setActiveFilter('all')}
                >
                  All
                </button>
                <button
                  className={`text-theme-sm h-10 rounded-md px-3 py-2 font-medium hover:text-gray-900 dark:hover:text-white ${
                    activeFilter === 'solved'
                      ? 'text-gray-900 dark:text-white bg-white dark:bg-gray-800 shadow-theme-xs'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                  onClick={() => setActiveFilter('solved')}
                >
                  Solved
                </button>
                <button
                  className={`text-theme-sm h-10 rounded-md px-3 py-2 font-medium hover:text-gray-900 dark:hover:text-white ${
                    activeFilter === 'pending'
                      ? 'text-gray-900 dark:text-white bg-white dark:bg-gray-800 shadow-theme-xs'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                  onClick={() => setActiveFilter('pending')}
                >
                  Pending
                </button>
              </div>

              {/* Search and Filter */}
              <div className="hidden flex-col gap-3 sm:flex sm:flex-row sm:items-center">
                <div className="relative">
                  <span className="absolute top-1/2 left-4 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                    <Search className="w-5 h-5 fill-current" />
                  </span>
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="dark:bg-dark-900 shadow-theme-xs focus:border-brand-300 focus:ring-brand-500/10 dark:focus:border-brand-800 h-11 w-full rounded-lg border border-gray-300 bg-transparent py-2.5 pr-4 pl-11 text-sm text-gray-800 placeholder:text-gray-400 focus:ring-3 focus:outline-hidden xl:w-[300px] dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
                  />
                </div>
                <div className="relative" ref={filterRef}>
                  <Button
                    onClick={() => setShowFilter(!showFilter)}
                    className="shadow-theme-xs flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 sm:w-auto sm:min-w-[100px] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                  >
                    <Filter className="w-5 h-5" />
                    Filter
                  </Button>
                  {showFilter && (
                    <div className="absolute right-0 z-10 mt-2 w-56 rounded-lg border border-gray-200 bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                      <div className="mb-5">
                        <label className="mb-2 block text-xs font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <input type="text" className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800" placeholder="Search status..." />
                      </div>
                      <div className="mb-5">
                        <label className="mb-2 block text-xs font-medium text-gray-700 dark:text-gray-300">Requested By</label>
                        <input type="text" className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800" placeholder="Search requester..." />
                      </div>
                      <button onClick={() => setShowFilter(false)} className="h-10 w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600">Apply</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full table-auto">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="px-4 py-3 whitespace-nowrap">
                    <div className="flex w-full cursor-pointer items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedTickets.length === mockTickets.length && mockTickets.length > 0}
                          onChange={handleSelectAll}
                          className="select-none"
                        />
                        <p className="text-theme-xs font-medium text-gray-700 dark:text-gray-400">Ticket ID</p>
                      </div>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium whitespace-nowrap text-gray-700 dark:text-gray-400">
                    <div className="flex cursor-pointer items-center justify-between gap-3">
                      <p className="text-theme-xs font-medium text-gray-700 dark:text-gray-400">Requested By</p>
                      <span className="flex flex-col gap-0.5">
                        <svg className="text-gray-300 dark:text-gray-400" width="8" height="5" viewBox="0 0 8 5" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M4.40962 0.585167C4.21057 0.300808 3.78943 0.300807 3.59038 0.585166L1.05071 4.21327C0.81874 4.54466 1.05582 5 1.46033 5H6.53967C6.94418 5 7.18126 4.54466 6.94929 4.21327L4.40962 0.585167Z" fill="currentColor"></path>
                        </svg>
                        <svg className="text-gray-300 dark:text-gray-400" width="8" height="5" viewBox="0 0 8 5" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M4.40962 4.41483C4.21057 4.69919 3.78943 4.69919 3.59038 4.41483L1.05071 0.786732C0.81874 0.455343 1.05582 0 1.46033 0H6.53967C6.94418 0 7.18126 0.455342 6.94929 0.786731L4.40962 4.41483Z" fill="currentColor"></path>
                        </svg>
                      </span>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium whitespace-nowrap text-gray-700 dark:text-gray-400">Subject</th>
                  <th className="px-4 py-3 text-left text-xs font-medium whitespace-nowrap text-gray-700 dark:text-gray-400">
                    <div className="flex cursor-pointer items-center justify-between gap-3">
                      <p className="text-theme-xs font-medium text-gray-700 dark:text-gray-400">Create Date</p>
                      <span className="flex flex-col gap-0.5">
                        <svg className="text-gray-300 dark:text-gray-400" width="8" height="5" viewBox="0 0 8 5" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M4.40962 0.585167C4.21057 0.300808 3.78943 0.300807 3.59038 0.585166L1.05071 4.21327C0.81874 4.54466 1.05582 5 1.46033 5H6.53967C6.94418 5 7.18126 4.54466 6.94929 4.21327L4.40962 0.585167Z" fill="currentColor"></path>
                        </svg>
                        <svg className="text-gray-300 dark:text-gray-400" width="8" height="5" viewBox="0 0 8 5" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M4.40962 4.41483C4.21057 4.69919 3.78943 4.69919 3.59038 4.41483L1.05071 0.786732C0.81874 0.455343 1.05582 0 1.46033 0H6.53967C6.94418 0 7.18126 0.455342 6.94929 0.786731L4.40962 4.41483Z" fill="currentColor"></path>
                        </svg>
                      </span>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium whitespace-nowrap text-gray-700 dark:text-gray-400">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium whitespace-nowrap text-gray-700 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {filteredTickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="cursor-pointer transition hover:bg-gray-50 dark:hover:bg-gray-900"
                    onClick={() => router.push(`/prog/support-tickets/${ticket.ticketId}`)}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedTickets.includes(ticket.id)}
                            onChange={(checked) => handleSelectTicket(ticket.id, checked)}
                            className="select-none"
                          />
                        </div>
                        <span className="text-theme-xs font-medium text-gray-700 dark:text-gray-400">
                          #{ticket.ticketId}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div>
                        <span className="text-sm font-medium text-gray-800 dark:text-white/90">{ticket.requestedBy}</span>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{ticket.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-sm text-gray-700 dark:text-gray-400">{ticket.subject}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-sm text-gray-700 dark:text-gray-400">{ticket.createDate}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-theme-xs rounded-full px-2 py-0.5 font-medium ${
                        ticket.status === 'solved'
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
                          : 'bg-warning-50 dark:bg-warning-500/15 text-warning-600 dark:text-warning-500'
                      }`}>
                        {ticket.status === 'solved' ? 'Solved' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <Link href={`/prog/support-tickets/${ticket.ticketId}`}>
                          <Button variant="ghost" size="sm" className="text-gray-500 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400">
                            View
                          </Button>
                        </Link>
                        <Button variant="ghost" size="sm" className="text-gray-500 dark:text-gray-400">
                          <MoreHorizontal className="w-5 h-5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center flex-col sm:flex-row justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-800">
            <div className="sm:p-0 pb-3">
              <span className="block text-sm font-medium text-gray-500 dark:text-gray-400">
                Showing <span className="text-gray-800 dark:text-white/90">1</span> to <span className="text-gray-800 dark:text-white/90">{filteredTickets.length}</span> of <span className="text-gray-800 dark:text-white/90">{filteredTickets.length}</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 sm:justify-normal bg-gray-50 sm:w-auto dark:sm:bg-transparent p-4 w-full rounded-lg dark:bg-white/[0.03] sm:bg-transparent">
              <Button
                disabled
                className="shadow-theme-xs flex items-center gap-2 rounded-lg border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50 sm:p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
              >
                <ChevronLeft className="w-5 h-5 fill-current" />
              </Button>
              <span className="block text-sm font-medium text-gray-700 sm:hidden dark:text-gray-400">Page 1 of 1</span>
              <ul className="hidden items-center gap-0.5 sm:flex">
                <li>
                  <a href="#" className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium bg-brand-500 hover:bg-brand-500 text-white hover:text-white">1</a>
                </li>
              </ul>
              <Button className="shadow-theme-xs flex items-center gap-2 rounded-lg border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50 sm:p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200">
                <ChevronRight className="w-5 h-5 fill-current" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
