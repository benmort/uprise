'use client';

import { useState } from 'react';
import { Button } from '@uprise/ui';
import { Input } from '@uprise/ui';
import {
  Upload,
  Minus,
  Plus
} from 'lucide-react';

export default function AddProductPage() {
  const [formData, setFormData] = useState({
    productName: '',
    category: '',
    brand: '',
    color: '',
    weight: '',
    length: '',
    width: '',
    description: '',
    price: '',
    stockQuantity: 0,
    availabilityStatus: '',
    productImage: null as File | null
  });

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setFormData(prev => ({
      ...prev,
      productImage: file
    }));
  };

  const handleStockChange = (operation: 'increment' | 'decrement') => {
    setFormData(prev => ({
      ...prev,
      stockQuantity: operation === 'increment'
        ? prev.stockQuantity + 1
        : Math.max(0, prev.stockQuantity - 1)
    }));
  };

  const handleSaveDraft = () => {
    // no-op
  };

  const handlePublishProduct = () => {
    // no-op
  };

  return (
    <div className="page-stack">
      <div>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Add Products</h2>
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
              <li className="text-sm text-gray-800 dark:text-white/90">Add Products</li>
            </ol>
          </nav>
        </div>

        <div className="space-y-6">
          {/* Product Description Section */}
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h2 className="text-lg font-medium text-gray-800 dark:text-white">Products Description</h2>
            </div>
            <div className="p-4 sm:p-6 dark:border-gray-800">
              <form>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Product Name</label>
                    <div className="relative">
                      <Input
                        placeholder="Enter product name"
                        value={formData.productName}
                        onChange={(e) => handleInputChange('productName', e.target.value)}
                        className="h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white/90 dark:focus:border-brand-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Category</label>
                    <div className="relative">
                      <select
                        value={formData.category}
                        onChange={(e) => handleInputChange('category', e.target.value)}
                        className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-11 text-sm shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 text-gray-400 dark:text-gray-400"
                      >
                        <option value="" disabled className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Select a category</option>
                        <option value="Laptop" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Laptop</option>
                        <option value="Phone" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Phone</option>
                        <option value="Watch" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Watch</option>
                        <option value="Electronics" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Electronics</option>
                        <option value="Accessories" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Accessories</option>
                      </select>
                      <span className="absolute text-gray-500 -translate-y-1/2 pointer-events-none right-3 top-1/2 dark:text-gray-400">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none">
                          <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4.792 7.396 10 12.604l5.208-5.208"></path>
                        </svg>
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Brand</label>
                    <div className="relative">
                      <select
                        value={formData.brand}
                        onChange={(e) => handleInputChange('brand', e.target.value)}
                        className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-11 text-sm shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 text-gray-400 dark:text-gray-400"
                      >
                        <option value="" disabled className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Select brand</option>
                        <option value="Apple" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Apple</option>
                        <option value="Samsung" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Samsung</option>
                        <option value="LG" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">LG</option>
                      </select>
                      <span className="absolute text-gray-500 -translate-y-1/2 pointer-events-none right-3 top-1/2 dark:text-gray-400">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none">
                          <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4.792 7.396 10 12.604l5.208-5.208"></path>
                        </svg>
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Color</label>
                    <div className="relative">
                      <select
                        value={formData.color}
                        onChange={(e) => handleInputChange('color', e.target.value)}
                        className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-11 text-sm shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 text-gray-400 dark:text-gray-400"
                      >
                        <option value="" disabled className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Select color</option>
                        <option value="Silver" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Silver</option>
                        <option value="Black" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Black</option>
                        <option value="White" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">White</option>
                        <option value="Gray" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Gray</option>
                      </select>
                      <span className="absolute text-gray-500 -translate-y-1/2 pointer-events-none right-3 top-1/2 dark:text-gray-400">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none">
                          <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4.792 7.396 10 12.604l5.208-5.208"></path>
                        </svg>
                      </span>
                    </div>
                  </div>

                  <div className="col-span-full">
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Weight(KG)</label>
                        <div className="relative">
                          <Input
                            placeholder="15"
                            type="number"
                            value={formData.weight}
                            onChange={(e) => handleInputChange('weight', e.target.value)}
                            className="h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white/90 dark:focus:border-brand-800"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Length(CM)</label>
                        <div className="relative">
                          <Input
                            placeholder="120"
                            type="number"
                            value={formData.length}
                            onChange={(e) => handleInputChange('length', e.target.value)}
                            className="h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white/90 dark:focus:border-brand-800"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Width(CM)</label>
                        <div className="relative">
                          <Input
                            placeholder="23"
                            type="number"
                            value={formData.width}
                            onChange={(e) => handleInputChange('width', e.target.value)}
                            className="h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white/90 dark:focus:border-brand-800"
                          />
                        </div>
                      </div>

                      <div className="col-span-full">
                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Description</label>
                        <div className="relative">
                          <textarea
                            placeholder="Receipt Info (optional)"
                            rows={6}
                            value={formData.description}
                            onChange={(e) => handleInputChange('description', e.target.value)}
                            className="w-full rounded-lg border px-4 py-2.5 text-sm shadow-theme-xs focus:outline-hidden bg-transparent text-gray-900 dark:text-gray-300 text-gray-900 border-gray-300 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>

          {/* Pricing & Availability Section */}
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h2 className="text-lg font-medium text-gray-800 dark:text-white">Pricing & Availability</h2>
            </div>
            <div className="space-y-5 p-4 sm:p-6">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Price</label>
                  <div className="relative">
                    <Input
                      placeholder="Enter price"
                      type="number"
                      value={formData.price}
                      onChange={(e) => handleInputChange('price', e.target.value)}
                      className="h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white/90 dark:focus:border-brand-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Length(CM)</label>
                  <div className="relative">
                    <Input
                      placeholder="120"
                      type="number"
                      value={formData.length}
                      onChange={(e) => handleInputChange('length', e.target.value)}
                      className="h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white/90 dark:focus:border-brand-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Width(CM)</label>
                  <div className="relative">
                    <Input
                      placeholder="23"
                      type="number"
                      value={formData.width}
                      onChange={(e) => handleInputChange('width', e.target.value)}
                      className="h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white/90 dark:focus:border-brand-800"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 inline-block text-sm font-semibold text-gray-700 dark:text-gray-400">Stock Quantity</label>
                  <div className="flex h-11 divide-x divide-gray-300 overflow-hidden rounded-lg border border-gray-300 dark:divide-gray-800 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => handleStockChange('decrement')}
                      className="inline-flex h-11 w-11 items-center justify-center bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                    >
                      <Minus className="w-6 h-6" />
                    </button>
                    <div className="flex-1">
                      <input
                        className="h-full w-full border-0 bg-white text-center text-sm text-gray-700 outline-none focus:ring-0 dark:bg-gray-900 dark:text-gray-400"
                        type="text"
                        value={formData.stockQuantity}
                        readOnly
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleStockChange('increment')}
                      className="inline-flex h-11 w-11 items-center justify-center bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                    >
                      <Plus className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Availability Status</label>
                  <div className="relative">
                    <select
                      value={formData.availabilityStatus}
                      onChange={(e) => handleInputChange('availabilityStatus', e.target.value)}
                      className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-11 text-sm shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 text-gray-400 dark:text-gray-400"
                    >
                      <option value="" disabled className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Select a Availability</option>
                      <option value="in-stock" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">In Stock</option>
                      <option value="out-of-stock" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Out of Stock</option>
                    </select>
                    <span className="absolute text-gray-500 -translate-y-1/2 pointer-events-none right-3 top-1/2 dark:text-gray-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none">
                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4.792 7.396 10 12.604l5.208-5.208"></path>
                      </svg>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Product Images Section */}
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <h2 className="text-lg font-medium text-gray-800 dark:text-white">Products Images</h2>
            </div>
            <div className="p-4 sm:p-6">
              <label htmlFor="product-image" className="shadow-theme-xs group hover:border-brand-500 block cursor-pointer rounded-lg border-2 border-dashed border-gray-300 transition dark:hover:border-brand-400 dark:border-gray-800">
                <div className="flex justify-center p-10">
                  <div className="flex max-w-[260px] flex-col items-center gap-4">
                    <div className="inline-flex h-13 w-13 items-center justify-center rounded-full border border-gray-200 text-gray-700 transition dark:border-gray-800 dark:text-gray-400">
                      <Upload className="w-6 h-6" />
                    </div>
                    <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                      <span className="font-medium text-gray-800 dark:text-white/90">Click to upload</span> or drag and drop SVG, PNG, JPG or GIF (MAX. 800x400px)
                    </p>
                  </div>
                </div>
                <input
                  id="product-image"
                  className="hidden"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                />
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              onClick={handleSaveDraft}
              variant="outline"
              className="inline-flex items-center justify-center font-medium gap-2 rounded-lg transition px-5 py-3.5 text-sm bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03] dark:hover:text-gray-300"
            >
              Draft
            </Button>
            <Button
              onClick={handlePublishProduct}
              className="inline-flex items-center justify-center font-medium gap-2 rounded-lg transition px-5 py-3.5 text-sm bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600 disabled:bg-brand-300"
            >
              Publish Product
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
