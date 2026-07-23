'use client';

import { useParams } from 'next/navigation';
import { Button } from '@uprise/ui';
import {
  Printer
} from 'lucide-react';

interface InvoiceItem {
  id: number;
  product: string;
  quantity: number;
  unitCost: string;
  discount: string;
  total: string;
}

interface InvoiceData {
  id: string;
  from: {
    company: string;
    address: string;
    issuedOn: string;
  };
  to: {
    name: string;
    address: string;
    dueOn: string;
  };
  items: InvoiceItem[];
  summary: {
    subTotal: string;
    vat: string;
    total: string;
  };
}

// Mock data - static replica
const mockInvoiceData: InvoiceData = {
  id: '#348',
  from: {
    company: 'Pimjo LLC',
    address: '1280, Clair Street,\nMassachusetts, New York - 02543',
    issuedOn: '11 March, 2027'
  },
  to: {
    name: 'Albert Word',
    address: '355, Shobe Lane\nColorado, Fort Collins - 80543',
    dueOn: '16 March, 2027'
  },
  items: [
    {
      id: 1,
      product: 'Macbook pro 13"',
      quantity: 1,
      unitCost: '$48',
      discount: '0%',
      total: '$1,200'
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
      quantity: 3,
      unitCost: '$800',
      discount: '0%',
      total: '$1,600'
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
  summary: {
    subTotal: '$3,098',
    vat: '$312',
    total: '$3,410'
  }
};

export default function SingleInvoicePage() {
  const params = useParams();
  const hash = params.hash as string;

  // Static replica: select from inline mock regardless of hash
  const invoice = mockInvoiceData;

  const handleProceedToPayment = () => {
    // No-op static replica
  };

  const handlePrint = () => {
    // No-op static replica
  };

  return (
    <div className="page-stack">
      <div>
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] w-full">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="font-medium text-gray-800 text-xl dark:text-white/90">Invoice</h3>
            <h4 className="text-base font-medium text-gray-700 dark:text-gray-400">ID : {invoice.id}</h4>
          </div>

          {/* Content */}
          <div className="p-5 xl:p-8">
            {/* From/To Section */}
            <div className="flex flex-col gap-6 mb-9 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-400">From</span>
                <h5 className="mb-2 text-base font-semibold text-gray-800 dark:text-white/90">{invoice.from.company}</h5>
                <p className="mb-4 text-sm text-gray-500 dark:text-gray-400 whitespace-pre-line">{invoice.from.address}</p>
                <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Issued On:</span>
                <span className="block text-sm text-gray-500 dark:text-gray-400">{invoice.from.issuedOn}</span>
              </div>
              <div className="h-px w-full bg-gray-200 dark:bg-gray-800 sm:h-[158px] sm:w-px"></div>
              <div className="sm:text-right">
                <span className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-400">To</span>
                <h5 className="mb-2 text-base font-semibold text-gray-800 dark:text-white/90">{invoice.to.name}</h5>
                <p className="mb-4 text-sm text-gray-500 dark:text-gray-400 whitespace-pre-line">{invoice.to.address}</p>
                <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Due On:</span>
                <span className="block text-sm text-gray-500 dark:text-gray-400">{invoice.to.dueOn}</span>
              </div>
            </div>

            {/* Items Table */}
            <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
              <table className="min-w-full text-left text-gray-700 dark:text-gray-400">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <th className="px-5 py-3 text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-400">S.No.#</th>
                    <th className="px-5 py-3 text-xs font-medium whitespace-nowrap text-gray-500 dark:text-gray-400">Products</th>
                    <th className="px-5 py-3 text-center text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-400">Quantity</th>
                    <th className="px-5 py-3 text-center text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-400">Unit Cost</th>
                    <th className="px-5 py-3 text-center text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-400">Discount</th>
                    <th className="px-5 py-3 text-right text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-400">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {invoice.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">{item.id}</td>
                      <td className="px-5 py-3 text-sm font-medium text-gray-800 dark:text-white/90">{item.product}</td>
                      <td className="px-5 py-3 text-center text-sm text-gray-500 dark:text-gray-400">{item.quantity}</td>
                      <td className="px-5 py-3 text-center text-sm text-gray-500 dark:text-gray-400">{item.unitCost}</td>
                      <td className="px-5 py-3 text-center text-sm text-gray-500 dark:text-gray-400">{item.discount}</td>
                      <td className="px-5 py-3 text-right text-sm text-gray-500 dark:text-gray-400">{item.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div className="pb-6 my-6 text-right border-b border-gray-100 dark:border-gray-800">
              <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">Sub Total amount: {invoice.summary.subTotal}</p>
              <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">Vat (10%): {invoice.summary.vat}</p>
              <p className="text-lg font-semibold text-gray-800 dark:text-white/90">Total : {invoice.summary.total}</p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3">
              <Button
                onClick={handleProceedToPayment}
                variant="outline"
                className="inline-flex items-center justify-center font-medium gap-2 rounded-lg transition px-5 py-3.5 text-sm bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03] dark:hover:text-gray-300"
              >
                Proceed to payment
              </Button>
              <Button
                onClick={handlePrint}
                className="inline-flex items-center justify-center font-medium gap-2 rounded-lg transition px-5 py-3.5 text-sm bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600 disabled:bg-brand-300"
              >
                <Printer className="w-5 h-5" />
                Print
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
