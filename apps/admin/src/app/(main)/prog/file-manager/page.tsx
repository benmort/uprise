'use client';

import { useState } from 'react';
import { Button } from '@/components/prog/ui/button';
import { Input } from '@/components/prog/ui/input';
import {
  Search,
  Plus,
  // Upload,
  MoreHorizontal,
  Trash2,
  Eye,
  Folder,
  Image,
  Video,
  Music,
  FileText,
  Download,
  HardDrive
} from 'lucide-react';

interface MediaType {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  files: number;
  size: string;
  usage: string;
  color: string;
}

interface Folder {
  id: string;
  name: string;
  files: number;
  size: string;
}

interface RecentFile {
  id: string;
  name: string;
  type: string;
  size: string;
  date: string;
  icon: string;
}

const mediaTypes: MediaType[] = [
  {
    id: 'images',
    name: 'Image',
    icon: Image,
    files: 245,
    size: '26.40 GB',
    usage: '17% Used',
    color: 'bg-success-500/[0.08] text-success-500'
  },
  {
    id: 'videos',
    name: 'Videos',
    icon: Video,
    files: 245,
    size: '26.40 GB',
    usage: '22% Used',
    color: 'bg-theme-pink-500/[0.08] text-theme-pink-500'
  },
  {
    id: 'audios',
    name: 'Audios',
    icon: Music,
    files: 830,
    size: '18.90 GB',
    usage: '23% Used',
    color: 'bg-blue-500/[0.08] text-blue-light-500'
  },
  {
    id: 'apps',
    name: 'Apps',
    icon: HardDrive,
    files: 1200,
    size: '85.30 GB',
    usage: '65% Used',
    color: 'bg-orange-500/[0.08] text-orange-500'
  },
  {
    id: 'documents',
    name: 'Documents',
    icon: FileText,
    files: 78,
    size: '5.40 GB',
    usage: '10% Used',
    color: 'bg-warning-500/[0.08] text-warning-500'
  },
  {
    id: 'downloads',
    name: 'Downloads',
    icon: Download,
    files: 245,
    size: '26.40 GB',
    usage: '16% Used',
    color: 'bg-theme-purple-500/[0.08] text-theme-purple-500'
  }
];

const folders: Folder[] = [
  { id: '1', name: 'Images', files: 345, size: '26.40 GB' },
  { id: '2', name: 'Documents', files: 130, size: '26.40 GB' },
  { id: '3', name: 'Apps', files: 130, size: '26.40 GB' },
  { id: '4', name: 'Downloads', files: 345, size: '26.40 GB' }
];

const recentFiles: RecentFile[] = [
  { id: '1', name: 'Video_947954.mp4', type: 'Video', size: '89 MB', date: '12 Jan, 2027', icon: 'video' },
  { id: '2', name: 'Travel.jpg', type: 'Image', size: '5.4 MB', date: '10 Feb, 2027', icon: 'image' },
  { id: '3', name: 'Document.pdf', type: 'Document', size: '1.2 MB', date: '8 Mar, 2027', icon: 'pdf' },
  { id: '4', name: 'Video_947954_028.mp4', type: 'Video', size: '489 MB', date: '29 Apr, 2027', icon: 'video' },
  { id: '5', name: 'Mountain.png', type: 'Image', size: '5.4 MB', date: '10 Feb, 2027', icon: 'image' },
  { id: '6', name: 'CV.pdf', type: 'Document', size: '12 MB', date: '17 Jun, 2027', icon: 'pdf' },
  { id: '7', name: 'Video_09783_882943.mp4', type: 'Video', size: '309 MB', date: '27 Jul, 2027', icon: 'video' }
];

const getFileIcon = (type: string) => {
  switch (type) {
    case 'video':
      return <Video className="h-5 w-5 text-red-500" />;
    case 'image':
      return <Image className="h-5 w-5 text-green-500" />;
    case 'pdf':
      return <FileText className="h-5 w-5 text-red-600" />;
    default:
      return <FileText className="h-5 w-5 text-gray-500" />;
  }
};

export default function FileManagerPage() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="p-4 mx-auto max-w-7xl md:p-6">
      <div>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">
            File Manager
          </h2>
          <nav>
            <ol className="flex items-center gap-1.5">
              <li>
                <a
                  className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400"
                  href="/"
                >
                  Home
                  <svg
                    className="stroke-current"
                    width="17"
                    height="16"
                    viewBox="0 0 17 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.0765 12.667L10.2432 8.50033L6.0765 4.33366"
                      stroke=""
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
              </li>
              <li className="text-sm text-gray-800 dark:text-white/90">
                File Manager
              </li>
            </ol>
          </nav>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* All Media Section */}
          <div className="col-span-12">
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="px-4 py-4 sm:pl-6 sm:pr-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                    All Media
                  </h3>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative">
                      <button className="absolute text-gray-500 -translate-y-1/2 left-4 top-1/2 dark:text-gray-400">
                        <Search className="h-5 w-5" />
                      </button>
                      <Input
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="dark:bg-dark-900 h-11 w-full rounded-lg border border-gray-300 bg-transparent py-2.5 pl-[42px] pr-3.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 xl:w-[300px]"
                      />
                    </div>
                    <Button className="flex items-center justify-center w-full gap-2 px-4 py-3 text-sm font-medium text-white rounded-lg bg-brand-500 shadow-theme-xs hover:bg-brand-600 sm:w-auto">
                      <Plus className="h-5 w-5" />
                      Upload File
                    </Button>
                  </div>
                </div>
              </div>

              {/* Media Type Cards */}
              <div className="p-4 border-t border-gray-100 dark:border-gray-800 sm:p-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
                  {mediaTypes.map((media) => (
                    <div key={media.id} className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white py-4 pl-4 pr-4 dark:border-gray-800 dark:bg-white/[0.03] xl:pr-5">
                      <div className="flex items-center gap-4">
                        <div className={`flex h-[52px] w-[52px] items-center justify-center rounded-xl ${media.color}`}>
                          <media.icon className="h-6 w-6" />
                        </div>
                        <div>
                          <h4 className="mb-1 text-sm font-medium text-gray-800 dark:text-white/90">
                            {media.name}
                          </h4>
                          <span className="block text-sm text-gray-500 dark:text-gray-400">
                            {media.usage}
                          </span>
                        </div>
                      </div>
                      <div>
                        <span className="block mb-1 text-sm text-right text-gray-500 dark:text-gray-400">
                          {media.files} files
                        </span>
                        <span className="block text-sm text-right text-gray-500 dark:text-gray-400">
                          {media.size}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* All Folders Section */}
          <div className="col-span-12 xl:col-span-8">
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="px-4 py-4 sm:pl-6 sm:pr-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                    All Folders
                  </h3>
                  <a
                    href="#"
                    className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-brand-500 dark:text-gray-400 dark:hover:text-brand-500"
                  >
                    View All
                    <svg
                      className="fill-current"
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M17.4175 9.9986C17.4178 10.1909 17.3446 10.3832 17.198 10.53L12.2013 15.5301C11.9085 15.8231 11.4337 15.8233 11.1407 15.5305C10.8477 15.2377 10.8475 14.7629 11.1403 14.4699L14.8604 10.7472L3.33301 10.7472C2.91879 10.7472 2.58301 10.4114 2.58301 9.99715C2.58301 9.58294 2.91879 9.24715 3.33301 9.24715L14.8549 9.24715L11.1403 5.53016C10.8475 5.23717 10.8477 4.7623 11.1407 4.4695C11.4336 4.1767 11.9085 4.17685 12.2013 4.46984L17.1588 9.43049C17.3173 9.568 17.4175 9.77087 17.4175 9.99715C17.4175 9.99763 17.4175 9.99812 17.4175 9.9986Z"
                        fill=""
                      />
                    </svg>
                  </a>
                </div>
              </div>

              {/* Folder Cards */}
              <div className="p-5 border-t border-gray-100 dark:border-gray-800 sm:p-6">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
                  {folders.map((folder) => (
                    <div key={folder.id} className="rounded-2xl border border-gray-100 bg-gray-50 px-6 py-6 dark:border-gray-800 dark:bg-white/[0.03] xl:py-[27px]">
                      <div className="flex justify-between mb-6">
                        <div>
                          <Folder className="h-9 w-9 text-yellow-500" />
                        </div>
                        <div className="relative">
                          <button className="dropdown-toggle">
                            <MoreHorizontal className="h-6 w-6 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300" />
                          </button>
                        </div>
                      </div>
                      <h4 className="mb-1 text-sm font-medium text-gray-800 dark:text-white/90">
                        {folder.name}
                      </h4>
                      <div className="flex items-center justify-between">
                        <span className="block text-sm text-gray-500 dark:text-gray-400">
                          {folder.files} Files
                        </span>
                        <span className="block text-sm text-right text-gray-500 dark:text-gray-400">
                          {folder.size}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Storage Details */}
          <div className="col-span-12 xl:col-span-4">
            <div className="px-4 pt-6 pb-6 bg-white border border-gray-200 rounded-2xl dark:border-gray-800 dark:bg-gray-900 sm:px-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                    Storage Details
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    585 GB Free space left
                  </p>
                </div>
              </div>

              {/* Simple Storage Chart Placeholder */}
              <div className="flex justify-center mx-auto">
                <div className="relative w-64 h-64">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-800 dark:text-white">
                        Total 160 GB
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        160
                      </div>
                    </div>
                  </div>
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="#e5e7eb"
                      strokeWidth="8"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="8"
                      strokeDasharray={`${2 * Math.PI * 40 * 0.65} ${2 * Math.PI * 40}`}
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>

              {/* Legend */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                  <span className="text-gray-600 dark:text-gray-400">Downloads</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <span className="text-gray-600 dark:text-gray-400">Apps</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <span className="text-gray-600 dark:text-gray-400">Documents</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-gray-600 dark:text-gray-400">Media</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Files Table */}
          <div className="col-span-12">
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white pt-4 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between px-6 mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                    Recent Files
                  </h3>
                </div>
                <a
                  className="inline-flex items-center gap-2 text-gray-500 hover:text-brand-500 dark:text-gray-400 dark:hover:text-brand-500"
                  href="/"
                >
                  View All
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    fill="none"
                  >
                    <path
                      fill="currentColor"
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M17.418 9.999a.75.75 0 0 1-.22.531l-4.997 5a.75.75 0 1 1-1.06-1.06l3.72-3.723H3.332a.75.75 0 0 1 0-1.5h11.522L11.14 5.53a.75.75 0 0 1 1.061-1.06l4.958 4.96c.158.138.259.34.259.567z"
                    />
                  </svg>
                </a>
              </div>

              <div className="max-w-full overflow-x-auto">
                <table className="w-full border-collapse table-auto">
                  <thead>
                    <tr className="border-t border-gray-200 dark:border-gray-800">
                      <th className="px-6 py-3 font-medium text-left text-gray-500 text-sm dark:text-gray-400">
                        File Name
                      </th>
                      <th className="px-6 py-3 font-medium text-left text-gray-500 text-sm dark:text-gray-400">
                        Category
                      </th>
                      <th className="px-6 py-3 font-medium text-left text-gray-500 text-sm dark:text-gray-400">
                        Size
                      </th>
                      <th className="px-6 py-3 font-medium text-left text-gray-500 text-sm dark:text-gray-400">
                        Date Modified
                      </th>
                      <th className="px-6 py-3 font-medium text-center text-gray-500 text-sm dark:text-gray-400">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentFiles.map((file) => (
                      <tr key={file.id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-6 py-[18px] text-sm text-gray-700 dark:text-gray-400">
                          <div className="flex items-center gap-2">
                            {getFileIcon(file.icon)}
                            {file.name}
                          </div>
                        </td>
                        <td className="px-6 py-[18px] text-gray-700 text-sm dark:text-gray-400">
                          {file.type}
                        </td>
                        <td className="px-6 py-[18px] text-gray-700 text-sm dark:text-gray-400">
                          {file.size}
                        </td>
                        <td className="px-6 py-[18px] text-gray-700 text-sm dark:text-gray-400">
                          {file.date}
                        </td>
                        <td className="px-6 py-[18px] text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button className="text-gray-500 hover:text-error-500 dark:text-gray-400 dark:hover:text-error-500">
                              <Trash2 className="h-5 w-5" />
                            </button>
                            <button className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white/90">
                              <Eye className="h-5 w-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
