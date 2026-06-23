'use client';

import { useState } from 'react';
import { Button } from '@/components/prog/ui/button';
import { Input } from '@/components/prog/ui/input';
import {
  Search,
  Download,
  MoreHorizontal,
  ChevronUp,
  ChevronDown,
  Check
} from 'lucide-react';

interface Transaction {
  id: string;
  orderId: string;
  customer: string;
  email: string;
  amount: string;
  dueDate: string;
  status: 'completed' | 'pending' | 'failed';
}

const mockTransactions: Transaction[] = [
  {
    id: '1',
    orderId: '#323537',
    customer: 'Abram Schleifer',
    email: 'abram@example.com',
    amount: '$43,999',
    dueDate: '25 Apr, 2027',
    status: 'completed'
  },
  {
    id: '2',
    orderId: '#323544',
    customer: 'Ava Smith',
    email: 'ava.smith@example.com',
    amount: '$1,200',
    dueDate: '01 Dec, 2027',
    status: 'pending'
  },
  {
    id: '3',
    orderId: '#323538',
    customer: 'Carla George',
    email: 'carla65@example.com',
    amount: '$919',
    dueDate: '11 May, 2027',
    status: 'completed'
  },
  {
    id: '4',
    orderId: '#323543',
    customer: 'Ekstrom Bothman',
    email: 'ekstrom@example.com',
    amount: '$679',
    dueDate: '15 Nov, 2027',
    status: 'completed'
  },
  {
    id: '5',
    orderId: '#323552',
    customer: 'Ella Davis',
    email: 'ella.davis@example.com',
    amount: '$210',
    dueDate: '01 Mar, 2028',
    status: 'failed'
  },
  {
    id: '6',
    orderId: '#323539',
    customer: 'Emery Culhane',
    email: 'emery09@example.com',
    amount: '$839',
    dueDate: '29 Jun, 2027',
    status: 'completed'
  },
  {
    id: '7',
    orderId: '#323547',
    customer: 'Ethan Patel',
    email: 'ethan.patel@example.com',
    amount: '$2,100',
    dueDate: '05 Jan, 2028',
    status: 'pending'
  },
  {
    id: '8',
    orderId: '#323553',
    customer: 'James Martinez',
    email: 'james.martinez@example.com',
    amount: '$3,300',
    dueDate: '15 Mar, 2028',
    status: 'completed'
  },
  {
    id: '9',
    orderId: '#323535',
    customer: 'Kaiya George',
    email: 'kaiya@example.com',
    amount: '$1,579',
    dueDate: '13 Mar, 2027',
    status: 'failed'
  },
  {
    id: '10',
    orderId: '#323549',
    customer: 'Liam Brown',
    email: 'liam.brown@example.com',
    amount: '$450',
    dueDate: '28 Jan, 2028',
    status: 'failed'
  }
];

const getStatusBadge = (status: string) => {
  const baseClasses = 'text-xs rounded-full px-2 py-0.5 font-medium';
  switch (status) {
    case 'completed':
      return `${baseClasses} bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500`;
    case 'pending':
      return `${baseClasses} bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500`;
    case 'failed':
      return `${baseClasses} bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-500`;
    default:
      return `${baseClasses} bg-gray-50 text-gray-700 dark:bg-gray-500/15 dark:text-gray-500`;
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'pending':
      return 'Pending';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
};

export default function TransactionsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [timeFilter, setTimeFilter] = useState('Last 7 Days');
  const [transactions] = useState<Transaction[]>(mockTransactions);
  const [loading] = useState(false);

  const filteredTransactions = transactions.filter(transaction =>
    transaction.orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    transaction.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
    transaction.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectAll = () => {
    if (selectedTransactions.length === filteredTransactions.length) {
      setSelectedTransactions([]);
    } else {
      setSelectedTransactions(filteredTransactions.map(transaction => transaction.id));
    }
  };

  const handleSelectTransaction = (transactionId: string) => {
    setSelectedTransactions(prev =>
      prev.includes(transactionId)
        ? prev.filter(id => id !== transactionId)
        : [...prev, transactionId]
    );
  };

  const handleExportCSV = () => {
    // No-op static replica
  };

  return (
    <div className="p-4 mx-auto max-w-7xl md:p-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Transactions</h2>
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
              <li className="text-sm text-gray-800 dark:text-white/90">Transactions</li>
            </ol>
          </nav>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Transactions</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Your most recent transactions list</p>
            </div>
            <div className="flex gap-3.5">
              <div className="hidden flex-col gap-3 sm:flex sm:flex-row sm:items-center">
                <div className="relative">
                  <span className="absolute top-1/2 left-4 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                    <Search className="w-5 h-5" />
                  </span>
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="shadow-theme-xs focus:border-brand-300 focus:ring-brand-500/10 dark:focus:border-brand-800 h-11 w-full rounded-lg border border-gray-300 bg-transparent py-2.5 pr-4 pl-11 text-sm text-gray-800 placeholder:text-gray-400 focus:ring-3 focus:outline-hidden xl:w-[300px] dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
                  />
                </div>
                <div className="hidden lg:block">
                  <select
                    value={timeFilter}
                    onChange={(e) => setTimeFilter(e.target.value)}
                    className="shadow-theme-xs focus:border-brand-300 focus:ring-brand-500/10 dark:focus:border-brand-800 h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 pr-11 text-sm text-gray-800 placeholder:text-gray-400 focus:ring-3 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
                  >
                    <option>Last 7 Days</option>
                    <option>Last 10 Days</option>
                    <option>Last 15 Days</option>
                    <option>Last 30 Days</option>
                  </select>
                </div>
                <div>
                  <Button
                    onClick={handleExportCSV}
                    variant="outline"
                    className="shadow-theme-xs flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-700 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                  >
                    <Download className="w-5 h-5" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="custom-scrollbar overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="border-b border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                  <th className="p-4">
                    <div className="flex w-full items-center gap-3">
                      <label className="flex cursor-pointer items-center text-sm font-medium text-gray-700 select-none dark:text-gray-400">
                        <span className="relative">
                          <input
                            className="sr-only"
                            type="checkbox"
                            checked={selectedTransactions.length === filteredTransactions.length && filteredTransactions.length > 0}
                            onChange={handleSelectAll}
                          />
                          <span className="flex h-4 w-4 items-center justify-center rounded-sm border-[1.25px] bg-transparent border-gray-300 dark:border-gray-700">
                            <span className={`${selectedTransactions.length === filteredTransactions.length && filteredTransactions.length > 0 ? 'opacity-100' : 'opacity-0'}`}>
                              <Check className="w-3 h-3 text-white" />
                            </span>
                          </span>
                        </span>
                      </label>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Order ID</p>
                    </div>
                  </th>
                  <th className="p-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                    <div className="flex cursor-pointer items-center gap-3">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Customer</p>
                      <span className="flex flex-col gap-0.5">
                        <ChevronUp className="w-2 h-2 text-gray-800 dark:text-gray-400" />
                        <ChevronDown className="w-2 h-2 text-gray-300" />
                      </span>
                    </div>
                  </th>
                  <th className="p-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                    <div className="flex cursor-pointer items-center gap-3">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Email</p>
                      <span className="flex flex-col gap-0.5">
                        <ChevronUp className="w-2 h-2 text-gray-300" />
                        <ChevronDown className="w-2 h-2 text-gray-300" />
                      </span>
                    </div>
                  </th>
                  <th className="p-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                    <div className="flex cursor-pointer items-center gap-3">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Amount</p>
                      <span className="flex flex-col gap-0.5">
                        <ChevronUp className="w-2 h-2 text-gray-300" />
                        <ChevronDown className="w-2 h-2 text-gray-300" />
                      </span>
                    </div>
                  </th>
                  <th className="p-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Due Date</th>
                  <th className="p-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                  <th className="p-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                    <div className="relative">
                      <span className="sr-only">Action</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-x divide-y divide-gray-200 dark:divide-gray-800">
                {filteredTransactions.map((transaction) => (
                  <tr key={transaction.id} className="transition hover:bg-gray-50 dark:hover:bg-gray-900">
                    <td className="p-4 whitespace-nowrap">
                      <div className="group flex items-center gap-3">
                        <label className="flex cursor-pointer items-center text-sm font-medium text-gray-700 select-none dark:text-gray-400">
                          <span className="relative">
                            <input
                              className="sr-only"
                              type="checkbox"
                              checked={selectedTransactions.includes(transaction.id)}
                              onChange={() => handleSelectTransaction(transaction.id)}
                            />
                            <span className="flex h-4 w-4 items-center justify-center rounded-sm border-[1.25px] bg-transparent border-gray-300 dark:border-gray-700">
                              <span className={`${selectedTransactions.includes(transaction.id) ? 'opacity-100' : 'opacity-0'}`}>
                                <Check className="w-3 h-3 text-white" />
                              </span>
                            </span>
                          </span>
                        </label>
                        <a
                          className="text-xs font-medium text-gray-700 group-hover:underline dark:text-gray-400"
                          href={`/admin/transactions/${transaction.id}`}
                        >
                          {transaction.orderId}
                        </a>
                      </div>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-400">{transaction.customer}</span>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <p className="text-sm text-gray-500 dark:text-gray-400">{transaction.email}</p>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <p className="text-sm text-gray-700 dark:text-gray-400">{transaction.amount}</p>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <p className="text-sm text-gray-700 dark:text-gray-400">{transaction.dueDate}</p>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className={getStatusBadge(transaction.status)}>
                        {getStatusText(transaction.status)}
                      </span>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <div className="relative inline-block">
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
          <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-800">
            <div className="flex justify-center pb-4 sm:hidden">
              <span className="block text-sm font-medium text-gray-500 dark:text-gray-400">
                Showing <span className="text-gray-800 dark:text-white/90">1</span> to <span className="text-gray-800 dark:text-white/90">10</span> of <span className="text-gray-800 dark:text-white/90">20</span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="hidden sm:block">
                <span className="block text-sm font-medium text-gray-500 dark:text-gray-400">
                  Showing <span className="text-gray-800 dark:text-white/90">1</span> to <span className="text-gray-800 dark:text-white/90">10</span> of <span className="text-gray-800 dark:text-white/90">20</span>
                </span>
              </div>
              <div className="flex w-full items-center justify-between gap-2 rounded-lg bg-gray-50 p-4 sm:w-auto sm:justify-normal sm:rounded-none sm:bg-transparent sm:p-0 dark:bg-gray-900 dark:sm:bg-transparent">
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
                <span className="block text-sm font-medium text-gray-700 sm:hidden dark:text-gray-400">Page 1 of 2</span>
                <ul className="hidden items-center gap-0.5 sm:flex">
                  <li>
                    <Button size="sm" className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium bg-brand-500 text-white">1</Button>
                  </li>
                  <li>
                    <Button variant="outline" size="sm" className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium text-gray-700 hover:bg-brand-500 hover:text-white dark:text-gray-400 dark:hover:text-white">2</Button>
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
    </div>
  );
}
