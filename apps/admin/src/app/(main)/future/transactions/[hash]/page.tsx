'use client';

import { useParams } from 'next/navigation';
import { Button } from '@/components/prog/ui/button';
import {
  ShoppingCart,
  CreditCard,
  Mail,
  Receipt
} from 'lucide-react';

interface OrderItem {
  id: number;
  product: string;
  quantity: number;
  unitCost: string;
  discount: string;
  total: string;
}

interface CustomerDetails {
  name: string;
  email: string;
  phone: string;
  address: string;
  country: string;
}

interface OrderHistoryItem {
  id: number;
  title: string;
  description: string;
  time: string;
  date: string;
  icon: React.ReactNode;
}

// Mock data - static replica
const mockTransactionData = {
  orderId: '#34834',
  status: 'completed' as const,
  dueDate: '25 August 2025',
  customer: {
    name: 'Mushafrof Chowdhury',
    email: 'name@example.com',
    phone: '+123 456 7890',
    address: '62 Miles Drive St, Newark, NJ 07103, California.',
    country: 'United States'
  },
  orderItems: [
    {
      id: 1,
      product: 'Macbook pro 13"',
      quantity: 1,
      unitCost: '$1200',
      discount: '0%',
      total: '$1200'
    },
    {
      id: 2,
      product: 'Apple Watch Ultra',
      quantity: 1,
      unitCost: '$300',
      discount: '50%',
      total: '$150'
    },
    {
      id: 3,
      product: 'iPhone 15 Pro Max',
      quantity: 2,
      unitCost: '$800',
      discount: '0%',
      total: '$1600'
    },
    {
      id: 4,
      product: 'iPad Pro 3rd Gen',
      quantity: 1,
      unitCost: '$900',
      discount: '0%',
      total: '$900'
    }
  ],
  orderSummary: {
    subTotal: '$3,850',
    vat: '$385',
    total: '$4,235'
  },
  orderHistory: [
    {
      id: 1,
      title: 'Checkout Started',
      description: 'via tailadmin.com',
      time: '12:54',
      date: '12th Apr 28',
      icon: <ShoppingCart className="w-5 h-5" />
    },
    {
      id: 2,
      title: 'Purchased',
      description: 'for US$4,235 via PayPal',
      time: '12:58',
      date: '12th Apr 28',
      icon: <CreditCard className="w-5 h-5" />
    },
    {
      id: 3,
      title: 'Receipt Email Sent',
      description: 'Receipt #1734535',
      time: '12:58',
      date: '12th Apr 28',
      icon: <Mail className="w-5 h-5" />
    }
  ]
};

const getStatusBadge = (status: string) => {
  const baseClasses = 'inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium';
  switch (status) {
    case 'completed':
      return `${baseClasses} bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500`;
    case 'pending':
      return `${baseClasses} bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-500`;
    case 'failed':
      return `${baseClasses} bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-500`;
    default:
      return `${baseClasses} bg-gray-50 text-gray-600 dark:bg-gray-500/15 dark:text-gray-500`;
  }
};

export default function SingleTransactionPage() {
  const params = useParams();
  const hash = params.hash as string;

  // Static replica: select from inline mock regardless of hash
  const transaction = mockTransactionData;

  const handleViewReceipt = () => {
    // No-op static replica
  };

  const handleRefund = () => {
    // No-op static replica
  };

  const handleResend = () => {
    // No-op static replica
  };

  const handleForward = () => {
    // No-op static replica
  };

  const handlePreview = () => {
    // No-op static replica
  };

  return (
    <div className="page-stack">
      <div>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Single Transaction</h2>
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
              <li className="text-sm text-gray-800 dark:text-white/90">Single Transaction</li>
            </ol>
          </nav>
        </div>

        <div className="space-y-6">
          {/* Transaction Header */}
          <div className="flex flex-col justify-between gap-6 rounded-2xl border border-gray-200 bg-white px-6 py-5 sm:flex-row sm:items-center dark:border-gray-800 dark:bg-white/3">
            <div className="flex flex-col gap-2.5 divide-gray-300 sm:flex-row sm:divide-x dark:divide-gray-700">
              <div className="flex items-center gap-2 sm:pr-3">
                <span className="text-base font-medium text-gray-700 dark:text-gray-400">
                  Order ID : {transaction.orderId}
                </span>
                <span className={getStatusBadge(transaction.status)}>
                  {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                </span>
              </div>
              <p className="text-sm text-gray-500 sm:pl-3 dark:text-gray-400">
                Due date:&nbsp;{transaction.dueDate}
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleViewReceipt}
                className="bg-brand-500 shadow-theme-xs hover:bg-brand-600 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white transition"
              >
                <Receipt className="w-4 h-4" />
                View Receipt
              </Button>
              <Button
                onClick={handleRefund}
                variant="outline"
                className="shadow-theme-xs inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-medium text-gray-700 ring-1 ring-gray-300 transition hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03]"
              >
                Refund
              </Button>
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Order Details - Left Column */}
            <div className="lg:col-span-8 2xl:col-span-9">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/3">
                <h2 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90">Order Details</h2>

                {/* Order Items Table */}
                <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800">
                  <div className="custom-scrollbar overflow-x-auto">
                    <table className="min-w-full text-left text-sm text-gray-700 dark:border-gray-800">
                      <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr className="border-b border-gray-100 whitespace-nowrap dark:border-gray-800">
                          <th className="px-5 py-4 text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-400">S. No.</th>
                          <th className="px-5 py-4 text-sm font-medium whitespace-nowrap text-gray-500 dark:text-gray-400">Products</th>
                          <th className="px-5 py-4 text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-400">Quantity</th>
                          <th className="px-5 py-4 text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-400">Unit Cost</th>
                          <th className="px-5 py-4 text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-400">Discount</th>
                          <th className="px-5 py-4 text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-400">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-white/[0.03]">
                        {transaction.orderItems.map((item) => (
                          <tr key={item.id}>
                            <td className="px-5 py-4 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">{item.id}</td>
                            <td className="px-5 py-4 text-sm font-medium whitespace-nowrap text-gray-800 dark:text-white/90">{item.product}</td>
                            <td className="px-5 py-4 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">{item.quantity}</td>
                            <td className="px-5 py-4 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">{item.unitCost}</td>
                            <td className="px-5 py-4 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">{item.discount}</td>
                            <td className="px-5 py-4 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">{item.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Order Summary */}
                <div className="flex flex-wrap justify-between sm:justify-end">
                  <div className="mt-6 w-full space-y-1 text-right sm:w-[220px]">
                    <p className="mb-4 text-left text-sm font-medium text-gray-800 dark:text-white/90">Order summary</p>
                    <ul className="space-y-2">
                      <li className="flex justify-between gap-5">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Sub Total</span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-400">{transaction.orderSummary.subTotal}</span>
                      </li>
                      <li className="flex items-center justify-between">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Vat (10%):</span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-400">{transaction.orderSummary.vat}</span>
                      </li>
                      <li className="flex items-center justify-between">
                        <span className="font-medium text-gray-700 dark:text-gray-400">Total</span>
                        <span className="text-lg font-semibold text-gray-800 dark:text-white/90">{transaction.orderSummary.total}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6 lg:col-span-4 2xl:col-span-3">
              {/* Customer Details */}
              <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/3">
                <h2 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90">Customer Details</h2>
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  <li className="flex items-start gap-5 py-2.5">
                    <span className="w-1/2 text-sm text-gray-500 sm:w-1/3 dark:text-gray-400">Name</span>
                    <span className="w-1/2 text-sm text-gray-700 sm:w-2/3 dark:text-gray-400">{transaction.customer.name}</span>
                  </li>
                  <li className="flex items-start gap-5 py-2.5">
                    <span className="w-1/2 text-sm text-gray-500 sm:w-1/3 dark:text-gray-400">Email</span>
                    <span className="w-1/2 text-sm text-gray-700 sm:w-2/3 dark:text-gray-400">{transaction.customer.email}</span>
                  </li>
                  <li className="flex items-start gap-5 py-2.5">
                    <span className="w-1/2 text-sm text-gray-500 sm:w-1/3 dark:text-gray-400">Phone</span>
                    <span className="w-1/2 text-sm text-gray-700 sm:w-2/3 dark:text-gray-400">{transaction.customer.phone}</span>
                  </li>
                  <li className="flex items-start gap-5 py-2.5">
                    <span className="w-1/2 text-sm text-gray-500 sm:w-1/3 dark:text-gray-400">Country</span>
                    <span className="w-1/2 text-sm text-gray-700 sm:w-2/3 dark:text-gray-400">{transaction.customer.country}</span>
                  </li>
                  <li className="flex items-start gap-5 py-2.5">
                    <span className="w-1/2 text-sm text-gray-500 sm:w-1/3 dark:text-gray-400">Address</span>
                    <span className="w-1/2 text-sm text-gray-700 sm:w-2/3 dark:text-gray-400">{transaction.customer.address}</span>
                  </li>
                </ul>
              </div>

              {/* Order History */}
              <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/3">
                <h2 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90">Order History</h2>
                <div className="relative pb-7 pl-11">
                  {transaction.orderHistory.map((item, index) => (
                    <div key={item.id} className={`relative ${index < transaction.orderHistory.length - 1 ? 'pb-7' : ''}`}>
                      <div className="absolute top-0 left-0 z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 border-gray-50 bg-white text-gray-700 ring ring-gray-200 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:ring-gray-800">
                        {item.icon}
                      </div>
                      <div className="ml-4 flex justify-between">
                        <div>
                          <h4 className="font-medium text-gray-800 dark:text-white/90">{item.title}</h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{item.description}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{item.time}</span>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{item.date}</p>
                        </div>
                      </div>
                      {index < transaction.orderHistory.length - 1 && (
                        <div className="absolute top-8 left-6 h-full w-px border border-dashed border-gray-300 dark:border-gray-700"></div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="mt-5 flex items-center justify-center gap-2">
                  <Button
                    onClick={handleResend}
                    variant="outline"
                    size="sm"
                    className="shadow-theme-xs rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Resend
                  </Button>
                  <Button
                    onClick={handleForward}
                    variant="outline"
                    size="sm"
                    className="shadow-theme-xs rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Forward
                  </Button>
                  <Button
                    onClick={handlePreview}
                    variant="outline"
                    size="sm"
                    className="shadow-theme-xs rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Preview
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
