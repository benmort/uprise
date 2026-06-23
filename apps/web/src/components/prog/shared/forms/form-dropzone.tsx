'use client';

import * as React from 'react';
import { useCallback, useState } from 'react';
import { cn } from '@/components/prog/cn';
import { Upload } from 'lucide-react';

export interface FormDropzoneProps {
  onFilesSelected?: (files: File[]) => void;
  accept?: string;
  className?: string;
}

export function FormDropzone({
  onFilesSelected,
  accept = 'image/png,image/jpeg,image/webp,image/svg+xml',
  className,
}: FormDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      onFilesSelected?.(files);
    },
    [onFilesSelected]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      onFilesSelected?.(files);
    },
    [onFilesSelected]
  );

  return (
    <form
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        'rounded-xl border border-dashed border-gray-300 bg-gray-50 p-7 lg:p-10 dark:border-gray-700 dark:bg-gray-900',
        isDragging && 'border-brand-500 dark:border-brand-500',
        'hover:border-brand-500 dark:hover:border-brand-500',
        'cursor-pointer',
        className
      )}
    >
      <label className="flex cursor-pointer flex-col items-center">
        <input
          type="file"
          accept={accept}
          onChange={handleChange}
          multiple
          className="hidden"
        />
        <div className="mb-[22px] flex justify-center">
          <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-400">
            <Upload className="h-7 w-7 fill-current" />
          </div>
        </div>
        <h4 className="text-theme-xl mb-3 font-semibold text-gray-800 dark:text-white/90">
          Drag & Drop File Here
        </h4>
        <span className="mx-auto mb-5 block w-full max-w-[290px] text-center text-sm text-gray-700 dark:text-gray-400">
          Drag and drop your PNG, JPG, WebP, SVG images here or browse
        </span>
        <span className="text-theme-sm font-medium text-brand-500 underline">Browse File</span>
      </label>
    </form>
  );
}
