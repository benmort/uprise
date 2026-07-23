'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/prog/ui/button';
import { Input } from '@uprise/ui';
import {
  Search,
  Download,
  Plus,
  Filter,
  ChevronUp,
  ChevronDown,
  Check
} from 'lucide-react';
import Image from 'next/image';

interface Product {
  id: string;
  name: string;
  category: string;
  brand: string;
  price: string;
  stock: 'in-stock' | 'out-of-stock';
  createdAt: string;
  image: string;
}

const mockProducts: Product[] = [
  {
    id: '1',
    name: 'ASUS ROG Gaming Laptop',
    category: 'Laptop',
    brand: 'ASUS',
    price: '$2,199',
    stock: 'out-of-stock',
    createdAt: '01 Dec, 2027',
    image: '/images/product/product-03.jpg'
  },
  {
    id: '2',
    name: 'Airpods Pro 2nd Gen',
    category: 'Accessories',
    brand: 'Apple',
    price: '$839',
    stock: 'in-stock',
    createdAt: '29 Jun, 2027',
    image: '/images/product/product-01.jpg'
  },
  {
    id: '3',
    name: 'Apple Watch Ultra',
    category: 'Watch',
    brand: 'Apple',
    price: '$1,579',
    stock: 'out-of-stock',
    createdAt: '13 Mar, 2027',
    image: '/images/product/product-02.jpg'
  },
  {
    id: '4',
    name: 'Bose QuietComfort Earbuds',
    category: 'Audio',
    brand: 'Bose',
    price: '$279',
    stock: 'in-stock',
    createdAt: '18 Nov, 2027',
    image: '/images/product/product-01.jpg'
  },
  {
    id: '5',
    name: 'Canon EOS R5 Camera',
    category: 'Camera',
    brand: 'Canon',
    price: '$3,899',
    stock: 'in-stock',
    createdAt: '28 Sep, 2027',
    image: '/images/product/product-02.jpg'
  },
  {
    id: '6',
    name: 'Dell XPS 13 Laptop',
    category: 'Laptop',
    brand: 'Dell',
    price: '$1,299',
    stock: 'in-stock',
    createdAt: '18 Aug, 2027',
    image: '/images/product/product-04.jpg'
  },
  {
    id: '7',
    name: 'Google Pixel 8 Pro',
    category: 'Phone',
    brand: 'Google',
    price: '$899',
    stock: 'out-of-stock',
    createdAt: '02 Sep, 2027',
    image: '/images/product/product-05.jpg'
  }
];

const getStockBadge = (stock: string) => {
  const baseClasses = 'text-xs rounded-full px-2 py-0.5 font-medium';
  switch (stock) {
    case 'in-stock':
      return `${baseClasses} bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-500`;
    case 'out-of-stock':
      return `${baseClasses} bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-500`;
    default:
      return `${baseClasses} bg-gray-50 text-gray-700 dark:bg-gray-500/15 dark:text-gray-500`;
  }
};

const getStockText = (stock: string) => {
  switch (stock) {
    case 'in-stock':
      return 'In Stock';
    case 'out-of-stock':
      return 'Out of Stock';
    default:
      return stock;
  }
};

export default function ProductsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
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

  const filteredProducts = mockProducts.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.brand.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectAll = () => {
    if (selectedProducts.length === filteredProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(filteredProducts.map(product => product.id));
    }
  };

  const handleSelectProduct = (productId: string) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleExport = () => {
    // no-op
  };

  const handleAddProduct = () => {
    // no-op
  };


  return (
    <div className="page-stack">
      <div>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Products</h2>
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
              <li className="text-sm text-gray-800 dark:text-white/90">Products</li>
            </ol>
          </nav>
        </div>

        {/* Products Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          {/* Table Header */}
          <div className="flex flex-col justify-between gap-5 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-center dark:border-gray-800">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Products List</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Track your store's progress to boost your sales.</p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleExport}
                variant="outline"
                className="inline-flex items-center justify-center font-medium gap-2 rounded-lg transition px-5 py-3.5 text-sm bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03] dark:hover:text-gray-300"
              >
                <Download className="w-5 h-5" />
                Export
              </Button>
              <Button
                onClick={handleAddProduct}
                className="bg-brand-500 shadow-sm hover inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-600"
              >
                <Plus className="w-5 h-5" />
                Add Product
              </Button>
            </div>
          </div>

          {/* Search and Filter */}
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <div className="flex gap-3 sm:justify-between">
              <div className="relative flex-1 sm:flex-auto">
                <span className="absolute top-1/2 left-4 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                  <Search className="w-5 h-5" />
                </span>
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="shadow-sm focus:border-brand-300 focus:ring-brand-500/10 dark:focus:border-brand-800 h-11 w-full rounded-lg border border-gray-300 bg-transparent py-2.5 pr-4 pl-11 text-sm text-gray-800 placeholder:text-gray-400 focus:ring-3 focus:outline-none sm:w-[300px] sm:min-w-[300px] dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
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
                      <label className="mb-2 block text-xs font-medium text-gray-700 dark:text-gray-300">Category</label>
                      <input type="text" className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800" placeholder="Search category..." />
                    </div>
                    <div className="mb-5">
                      <label className="mb-2 block text-xs font-medium text-gray-700 dark:text-gray-300">Brand</label>
                      <input type="text" className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800" placeholder="Search brand..." />
                    </div>
                    <button onClick={() => setShowFilter(false)} className="h-10 w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600">Apply</button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                  <th className="w-14 px-5 py-4 text-left">
                    <label className="cursor-pointer text-sm font-medium text-gray-700 select-none dark:text-gray-400">
                      <input
                        className="sr-only"
                        type="checkbox"
                        checked={selectedProducts.length === filteredProducts.length && filteredProducts.length > 0}
                        onChange={handleSelectAll}
                      />
                      <span className="flex h-4 w-4 items-center justify-center rounded-sm border-[1.25px] bg-transparent border-gray-300 dark:border-gray-700">
                        <span className={`${selectedProducts.length === filteredProducts.length && filteredProducts.length > 0 ? 'opacity-100' : 'opacity-0'}`}>
                          <Check className="w-3 h-3 text-white" />
                        </span>
                      </span>
                    </label>
                  </th>
                  <th className="cursor-pointer px-5 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Products</p>
                      <span className="flex flex-col gap-0.5">
                        <ChevronUp className="w-2 h-2 text-gray-500 dark:text-gray-400" />
                        <ChevronDown className="w-2 h-2 text-gray-300 dark:text-gray-400/50" />
                      </span>
                    </div>
                  </th>
                  <th className="cursor-pointer px-5 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Category</p>
                      <span className="flex flex-col gap-0.5">
                        <ChevronUp className="w-2 h-2 text-gray-300 dark:text-gray-400/50" />
                        <ChevronDown className="w-2 h-2 text-gray-300 dark:text-gray-400/50" />
                      </span>
                    </div>
                  </th>
                  <th className="cursor-pointer px-5 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Brand</p>
                      <span className="flex flex-col gap-0.5">
                        <ChevronUp className="w-2 h-2 text-gray-300 dark:text-gray-400/50" />
                        <ChevronDown className="w-2 h-2 text-gray-300 dark:text-gray-400/50" />
                      </span>
                    </div>
                  </th>
                  <th className="cursor-pointer px-5 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Price</p>
                      <span className="flex flex-col gap-0.5">
                        <ChevronUp className="w-2 h-2 text-gray-300" />
                        <ChevronDown className="w-2 h-2 text-gray-300" />
                      </span>
                    </div>
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Stock</th>
                  <th className="px-5 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Created At</th>
                  <th className="px-5 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                    <div className="relative">
                      <span className="sr-only">Action</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-x divide-y divide-gray-200 dark:divide-gray-800">
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="transition hover:bg-gray-50 dark:hover:bg-gray-900">
                    <td className="w-14 px-5 py-4 whitespace-nowrap">
                      <label className="cursor-pointer text-sm font-medium text-gray-700 select-none dark:text-gray-400">
                        <input
                          className="sr-only"
                          type="checkbox"
                          checked={selectedProducts.includes(product.id)}
                          onChange={() => handleSelectProduct(product.id)}
                        />
                        <span className="flex h-4 w-4 items-center justify-center rounded-sm border-[1.25px] bg-transparent border-gray-300 dark:border-gray-700">
                          <span className={`${selectedProducts.includes(product.id) ? 'opacity-100' : 'opacity-0'}`}>
                            <Check className="w-3 h-3 text-white" />
                          </span>
                        </span>
                      </label>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12">
                          <Image
                            alt={product.name}
                            width={48}
                            height={48}
                            className="h-12 w-12 rounded-md"
                            src={product.image}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-400">{product.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-500 dark:text-gray-400">{product.category}</p>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-700 dark:text-gray-400">{product.brand}</p>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-700 dark:text-gray-400">{product.price}</p>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className={getStockBadge(product.stock)}>
                        {getStockText(product.stock)}
                      </span>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-700 dark:text-gray-400">{product.createdAt}</p>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex items-center flex-col sm:flex-row justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-800">
            <div className="pb-3 sm:pb-0">
              <span className="block text-sm font-medium text-gray-500 dark:text-gray-400">
                Showing <span className="text-gray-800 dark:text-white/90">1</span> to <span className="text-gray-800 dark:text-white/90">7</span> of <span className="text-gray-800 dark:text-white/90">20</span>
              </span>
            </div>
            <div className="flex w-full items-center justify-between gap-2 rounded-lg bg-gray-50 p-4 sm:w-auto sm:justify-normal sm:rounded-none sm:bg-transparent sm:p-0 dark:bg-gray-900 dark:sm:bg-transparent">
              <Button
                disabled
                variant="outline"
                size="sm"
                className="shadow-sm flex items-center gap-2 rounded-lg border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50 sm:p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
              >
                <svg className="fill-current w-5 h-5" viewBox="0 0 20 20" fill="none">
                  <path fillRule="evenodd" clipRule="evenodd" d="M2.58203 9.99868C2.58174 10.1909 2.6549 10.3833 2.80152 10.53L7.79818 15.5301C8.09097 15.8231 8.56584 15.8233 8.85883 15.5305C9.15183 15.2377 9.152 14.7629 8.85921 14.4699L5.13911 10.7472L16.6665 10.7472C17.0807 10.7472 17.4165 10.4114 17.4165 9.99715C17.4165 9.58294 17.0807 9.24715 16.6665 9.24715L5.14456 9.24715L8.85919 5.53016C9.15199 5.23717 9.15184 4.7623 8.85885 4.4695C8.56587 4.1767 8.09099 4.17685 7.79819 4.46984L2.84069 9.43049C2.68224 9.568 2.58203 9.77087 2.58203 9.99715C2.58203 9.99766 2.58203 9.99817 2.58203 9.99868Z"></path>
                </svg>
              </Button>
              <span className="block text-sm font-medium text-gray-700 sm:hidden dark:text-gray-400">Page <span>1</span> of <span>3</span></span>
              <ul className="hidden items-center gap-0.5 sm:flex">
                <li>
                  <Button size="sm" className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium bg-brand-500 text-white">1</Button>
                </li>
                <li>
                  <Button variant="outline" size="sm" className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium text-gray-700 dark:text-gray-400 hover:bg-brand-500 hover:text-white dark:hover:text-white">2</Button>
                </li>
                <li>
                  <Button variant="outline" size="sm" className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium text-gray-700 dark:text-gray-400 hover:bg-brand-500 hover:text-white dark:hover:text-white">3</Button>
                </li>
              </ul>
              <Button
                variant="outline"
                size="sm"
                className="shadow-sm flex items-center gap-2 rounded-lg border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50 sm:p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
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
