'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@uprise/ui';
import { Input } from '@uprise/ui';
import {
  Search,
  Download,
  MoreHorizontal,
  ChevronUp,
  ChevronDown,
  Check,
  Plus,
  Filter
} from 'lucide-react';

interface Invoice {
  id: string;
  invoiceNumber: string;
  customer: string;
  creationDate: string;
  dueDate: string;
  total: string;
  status: 'paid' | 'unpaid' | 'draft';
}

const mockInvoices: Invoice[] = [
  {
    id: '1',
    invoiceNumber: '#323534',
    customer: 'Lindsey Curtis',
    creationDate: 'August 7, 2028',
    dueDate: 'February 28, 2028',
    total: '$999',
    status: 'paid'
  },
  {
    id: '2',
    invoiceNumber: '#323535',
    customer: 'John Doe',
    creationDate: 'July 1, 2028',
    dueDate: 'January 1, 2029',
    total: '$1200',
    status: 'unpaid'
  },
  {
    id: '3',
    invoiceNumber: '#323536',
    customer: 'Jane Smith',
    creationDate: 'June 15, 2028',
    dueDate: 'December 15, 2028',
    total: '$850',
    status: 'draft'
  },
  {
    id: '4',
    invoiceNumber: '#323537',
    customer: 'Michael Brown',
    creationDate: 'May 10, 2028',
    dueDate: 'November 10, 2028',
    total: '$1500',
    status: 'paid'
  },
  {
    id: '5',
    invoiceNumber: '#323538',
    customer: 'Emily Davis',
    creationDate: 'April 5, 2028',
    dueDate: 'October 5, 2028',
    total: '$700',
    status: 'unpaid'
  },
  {
    id: '6',
    invoiceNumber: '#323539',
    customer: 'Chris Wilson',
    creationDate: 'March 1, 2028',
    dueDate: 'September 1, 2028',
    total: '$1100',
    status: 'paid'
  },
  {
    id: '7',
    invoiceNumber: '#323540',
    customer: 'Jessica Lee',
    creationDate: 'February 20, 2028',
    dueDate: 'August 20, 2028',
    total: '$950',
    status: 'draft'
  },
  {
    id: '8',
    invoiceNumber: '#323541',
    customer: 'David Kim',
    creationDate: 'January 15, 2028',
    dueDate: 'July 15, 2028',
    total: '$1300',
    status: 'paid'
  },
  {
    id: '9',
    invoiceNumber: '#323542',
    customer: 'Sarah Clark',
    creationDate: 'December 10, 2027',
    dueDate: 'June 10, 2028',
    total: '$800',
    status: 'unpaid'
  },
  {
    id: '10',
    invoiceNumber: '#323543',
    customer: 'Matthew Lewis',
    creationDate: 'November 5, 2027',
    dueDate: 'May 5, 2028',
    total: '$1400',
    status: 'paid'
  }
];

const getStatusBadge = (status: string) => {
  const baseClasses = 'text-xs rounded-full px-2 py-0.5 font-medium';
  switch (status) {
    case 'paid':
      return `${baseClasses} bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-500`;
    case 'unpaid':
      return `${baseClasses} bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500`;
    case 'draft':
      return `${baseClasses} bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400`;
    default:
      return `${baseClasses} bg-gray-50 text-gray-700 dark:bg-gray-500/15 dark:text-gray-500`;
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'paid':
      return 'Paid';
    case 'unpaid':
      return 'Unpaid';
    case 'draft':
      return 'Draft';
    default:
      return status;
  }
};

export default function InvoicesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [invoices] = useState<Invoice[]>(mockInvoices);
  const [_loading] = useState(false);
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

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch =
      invoice.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      invoice.customer.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter =
      activeFilter === 'all' ||
      invoice.status === activeFilter;

    return matchesSearch && matchesFilter;
  });

  const handleSelectAll = () => {
    if (selectedInvoices.length === filteredInvoices.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(filteredInvoices.map(invoice => invoice.id));
    }
  };

  const handleSelectInvoice = (invoiceId: string) => {
    setSelectedInvoices(prev =>
      prev.includes(invoiceId)
        ? prev.filter(id => id !== invoiceId)
        : [...prev, invoiceId]
    );
  };

  const handleCreateInvoice = () => {
    // No-op static replica
  };

  const handleExport = () => {
    // No-op static replica
  };


  return (
    <div className="page-stack">
      <div>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Invoices</h2>
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
              <li className="text-sm text-gray-800 dark:text-white/90">Invoices</li>
            </ol>
          </nav>
        </div>

        {/* Overview Section */}
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-800 dark:text-white/90">Overview</h2>
            </div>
            <div>
              <Button
                onClick={handleCreateInvoice}
                className="bg-brand-500 shadow-theme-xs hover:bg-brand-600 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white transition"
              >
                <Plus className="w-5 h-5" />
                Create an Invoice
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 rounded-xl border border-gray-200 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0 dark:divide-gray-800 dark:border-gray-800">
            <div className="border-b p-5 sm:border-r lg:border-b-0">
              <p className="mb-1.5 text-sm text-gray-400 dark:text-gray-500">Overdue</p>
              <h3 className="text-3xl text-gray-800 dark:text-white/90">$120.80</h3>
            </div>
            <div className="border-b p-5 lg:border-b-0">
              <p className="mb-1.5 text-sm text-gray-400 dark:text-gray-500">Due within next 30 days</p>
              <h3 className="text-3xl text-gray-800 dark:text-white/90">0.00</h3>
            </div>
            <div className="border-b p-5 sm:border-r sm:border-b-0">
              <p className="mb-1.5 text-sm text-gray-400 dark:text-gray-500">Average time to get paid</p>
              <h3 className="text-3xl text-gray-800 dark:text-white/90">24 days</h3>
            </div>
            <div className="p-5">
              <p className="mb-1.5 text-sm text-gray-400 dark:text-gray-500">Upcoming Payout</p>
              <h3 className="text-3xl text-gray-800 dark:text-white/90">$3,450.50</h3>
            </div>
          </div>
        </div>

        {/* Invoices Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          {/* Table Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Invoices</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Your most recent invoices list</p>
            </div>
            <div className="flex gap-3.5">
              {/* Filter Tabs */}
              <div className="hidden h-11 items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 lg:inline-flex dark:bg-gray-900">
                <button
                  onClick={() => setActiveFilter('all')}
                  className={`text-sm h-10 rounded-md px-3 py-2 font-medium hover:text-gray-900 dark:hover:text-white shadow-theme-xs ${
                    activeFilter === 'all'
                      ? 'text-gray-900 dark:text-white bg-white dark:bg-gray-800'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  All Invoices
                </button>
                <button
                  onClick={() => setActiveFilter('unpaid')}
                  className={`text-sm h-10 rounded-md px-3 py-2 font-medium hover:text-gray-900 dark:hover:text-white ${
                    activeFilter === 'unpaid'
                      ? 'text-gray-900 dark:text-white bg-white dark:bg-gray-800'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  Unpaid
                </button>
                <button
                  onClick={() => setActiveFilter('draft')}
                  className={`text-sm h-10 rounded-md px-3 py-2 font-medium hover:text-gray-900 dark:hover:text-white ${
                    activeFilter === 'draft'
                      ? 'text-gray-900 dark:text-white bg-white dark:bg-gray-800'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  Draft
                </button>
              </div>

              {/* Search and Actions */}
              <div className="hidden flex-col gap-3 sm:flex sm:flex-row sm:items-center">
                <div className="relative">
                  <span className="absolute top-1/2 left-4 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                    <Search className="w-5 h-5" />
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
                    variant="outline"
                    className="shadow-theme-xs flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 sm:w-auto sm:min-w-[100px] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                  >
                    <Filter className="w-5 h-5" />
                    Filter
                  </Button>
                  {showFilter && (
                    <div className="absolute right-0 z-10 mt-2 w-56 rounded-lg border border-gray-200 bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                      <div className="mb-5">
                        <label className="mb-2 block text-xs font-medium text-gray-700 dark:text-gray-300">Customer</label>
                        <input type="text" className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800" placeholder="Search customer..." />
                      </div>
                      <div className="mb-5">
                        <label className="mb-2 block text-xs font-medium text-gray-700 dark:text-gray-300">Amount</label>
                        <input type="text" className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800" placeholder="Search amount..." />
                      </div>
                      <button onClick={() => setShowFilter(false)} className="h-10 w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600">Apply</button>
                    </div>
                  )}
                </div>
                <Button
                  onClick={handleExport}
                  variant="outline"
                  className="shadow-theme-xs flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-[11px] text-sm font-medium text-gray-700 sm:w-auto dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                >
                  <Download className="w-5 h-5" />
                  Export
                </Button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full table-auto">
              <thead>
                <tr className="border-b border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                  <th className="p-4 whitespace-nowrap">
                    <div className="flex w-full cursor-pointer items-center justify-between">
                      <div className="flex items-center gap-3">
                        <label className="flex cursor-pointer items-center text-sm font-medium text-gray-700 select-none dark:text-gray-400">
                          <span className="relative">
                            <input
                              className="sr-only"
                              type="checkbox"
                              checked={selectedInvoices.length === filteredInvoices.length && filteredInvoices.length > 0}
                              onChange={handleSelectAll}
                            />
                            <span className="flex h-4 w-4 items-center justify-center rounded-sm border-[1.25px] bg-transparent border-gray-300 dark:border-gray-700">
                              <span className={`${selectedInvoices.length === filteredInvoices.length && filteredInvoices.length > 0 ? 'opacity-100' : 'opacity-0'}`}>
                                <Check className="w-3 h-3 text-white" />
                              </span>
                            </span>
                          </span>
                        </label>
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-400">Invoice Number</p>
                      </div>
                    </div>
                  </th>
                  <th className="cursor-pointer p-4 text-left text-xs font-medium text-gray-700 dark:text-gray-400">
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-400">Customer</p>
                      <span className="flex flex-col gap-0.5">
                        <ChevronUp className="w-2 h-2 text-gray-300" />
                        <ChevronDown className="w-2 h-2 text-gray-300" />
                      </span>
                    </div>
                  </th>
                  <th className="cursor-pointer p-4 text-left text-xs font-medium text-gray-700 dark:text-gray-400">
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-400">Creation Date</p>
                      <span className="flex flex-col gap-0.5">
                        <ChevronUp className="w-2 h-2 text-gray-300" />
                        <ChevronDown className="w-2 h-2 text-gray-300" />
                      </span>
                    </div>
                  </th>
                  <th className="cursor-pointer p-4 text-left text-xs font-medium text-gray-700 dark:text-gray-400">
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-400">Due Date</p>
                      <span className="flex flex-col gap-0.5">
                        <ChevronUp className="w-2 h-2 text-gray-300" />
                        <ChevronDown className="w-2 h-2 text-gray-300" />
                      </span>
                    </div>
                  </th>
                  <th className="p-4 text-left text-xs font-medium text-gray-700 dark:text-gray-400">Total</th>
                  <th className="p-4 text-left text-xs font-medium text-gray-700 dark:text-gray-400">Status</th>
                  <th className="p-4 text-left text-xs font-medium text-gray-700 dark:text-gray-400">
                    <div className="relative">
                      <span className="sr-only">Action</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-x divide-y divide-gray-200 dark:divide-gray-800">
                {filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="transition hover:bg-gray-50 dark:hover:bg-gray-900">
                    <td className="p-4 whitespace-nowrap">
                      <div className="group flex items-center gap-3">
                        <label className="flex cursor-pointer items-center text-sm font-medium text-gray-700 select-none dark:text-gray-400">
                          <span className="relative">
                            <input
                              className="sr-only"
                              type="checkbox"
                              checked={selectedInvoices.includes(invoice.id)}
                              onChange={() => handleSelectInvoice(invoice.id)}
                            />
                            <span className="flex h-4 w-4 items-center justify-center rounded-sm border-[1.25px] bg-transparent border-gray-300 dark:border-gray-700">
                              <span className={`${selectedInvoices.includes(invoice.id) ? 'opacity-100' : 'opacity-0'}`}>
                                <Check className="w-3 h-3 text-white" />
                              </span>
                            </span>
                          </span>
                        </label>
                        <a
                          className="text-xs font-medium text-gray-700 group-hover:underline dark:text-gray-400"
                          href={`/admin/invoices/${invoice.id}`}
                        >
                          {invoice.invoiceNumber}
                        </a>
                      </div>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-400">{invoice.customer}</span>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <p className="text-sm text-gray-700 dark:text-gray-400">{invoice.creationDate}</p>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <p className="text-sm text-gray-700 dark:text-gray-400">{invoice.dueDate}</p>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <p className="text-sm text-gray-700 dark:text-gray-400">{invoice.total}</p>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className={getStatusBadge(invoice.status)}>
                        {getStatusText(invoice.status)}
                      </span>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <div className="relative flex justify-center dropdown">
                        <div>
                          <div>
                            <button className="text-gray-500 dark:text-gray-400">
                              <MoreHorizontal className="w-6 h-6" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex items-center flex-col sm:flex-row justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-800">
            <div className="pb-4 sm:pb-0">
              <span className="block text-sm font-medium text-gray-500 dark:text-gray-400">
                Showing <span className="text-gray-800 dark:text-white/90">1</span> to <span className="text-gray-800 dark:text-white/90">10</span> of <span className="text-gray-800 dark:text-white/90">25</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 bg-gray-50 p-4 sm:p-0 rounded-lg sm:bg-transparent dark:sm:bg-transparent w-full sm:w-auto dark:bg-white/[0.03] sm:justify-normal">
              <Button
                disabled
                variant="outline"
                size="sm"
                className="shadow-theme-xs flex items-center gap-2 rounded-lg border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-50 hover:text-gray-800 sm:p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200 opacity-50 cursor-not-allowed"
              >
                <svg className="fill-current w-5 h-5" viewBox="0 0 20 20" fill="none">
                  <path fillRule="evenodd" clipRule="evenodd" d="M2.58203 9.99868C2.58174 10.1909 2.6549 10.3833 2.80152 10.53L7.79818 15.5301C8.09097 15.8231 8.56584 15.8233 8.85883 15.5305C9.15183 15.2377 9.152 14.7629 8.85921 14.4699L5.13911 10.7472L16.6665 10.7472C17.0807 10.7472 17.4165 10.4114 17.4165 9.99715C17.4165 9.58294 17.0807 9.24715 16.6665 9.24715L5.14456 9.24715L8.85919 5.53016C9.15199 5.23717 9.15184 4.7623 8.85885 4.4695C8.56587 4.1767 8.09099 4.17685 7.79819 4.46984L2.84069 9.43049C2.68224 9.568 2.58203 9.77087 2.58203 9.99715C2.58203 9.99766 2.58203 9.99817 2.58203 9.99868Z"></path>
                </svg>
              </Button>
              <span className="block text-sm font-medium text-gray-700 sm:hidden dark:text-gray-400">Page 1 of 3</span>
              <ul className="hidden items-center gap-0.5 sm:flex">
                <li>
                  <Button size="sm" className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium bg-brand-500 text-white">1</Button>
                </li>
                <li>
                  <Button variant="outline" size="sm" className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium hover:bg-brand-500 text-gray-700 hover:text-white dark:text-gray-400 dark:hover:text-white">2</Button>
                </li>
                <li>
                  <Button variant="outline" size="sm" className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium hover:bg-brand-500 text-gray-700 hover:text-white dark:text-gray-400 dark:hover:text-white">3</Button>
                </li>
              </ul>
              <Button
                variant="outline"
                size="sm"
                className="shadow-theme-xs flex items-center gap-2 rounded-lg border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-50 hover:text-gray-800 sm:p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
              >
                <svg className="fill-current w-5 h-5" viewBox="0 0 20 20" fill="none">
                  <path fillRule="evenodd" clipRule="evenodd" d="M17.4165 9.9986C17.4168 10.1909 17.3437 10.3832 17.197 10.53L12.2004 15.5301C11.9076 15.8231 11.4327 15.8233 11.1397 15.5305C10.8467 15.2377 10.8465 14.7629 11.1393 14.4699L14.8594 10.7472L3.33203 10.7472C2.91782 10.7472 2.58203 10.4114 2.58203 9.99715C2.58203 9.58294 2.91782 9.24715 3.33203 9.24715L14.854 9.24715L11.1393 5.53016C10.8465 5.23717 10.8467 4.7623 11.1397 4.4695C11.4327 4.1767 11.9075 4.17685 12.2003 4.46984L17.1578 9.43049C17.3163 9.568 17.4165 9.77087 17.4165 9.99715C17.4165 9.99763 17.4165 9.99812 17.4165 9.9986Z"></path>
                </svg>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
