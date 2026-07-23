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
  Check,
  MoreHorizontal,
  MapPin,
  Clock,
  Users
} from 'lucide-react';
import Image from 'next/image';

interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  attendees: number;
  maxAttendees: number;
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  image: string;
  category: string;
}

const mockEvents: Event[] = [
  {
    id: '1',
    title: 'Tech Conference 2024',
    description: 'Annual technology conference featuring the latest innovations in AI, blockchain, and cloud computing.',
    date: '2024-03-15',
    time: '09:00 AM',
    location: 'Convention Center, San Francisco',
    attendees: 245,
    maxAttendees: 500,
    status: 'upcoming',
    image: '/images/user-1.webp',
    category: 'Technology'
  },
  {
    id: '2',
    title: 'Marketing Workshop',
    description: 'Learn the latest digital marketing strategies and tools for business growth.',
    date: '2024-03-20',
    time: '02:00 PM',
    location: 'Business Center, New York',
    attendees: 89,
    maxAttendees: 100,
    status: 'upcoming',
    image: '/images/user-2.webp',
    category: 'Marketing'
  },
  {
    id: '3',
    title: 'Product Launch Event',
    description: 'Exclusive launch event for our new product line with live demonstrations.',
    date: '2024-03-10',
    time: '06:00 PM',
    location: 'Grand Hotel, Los Angeles',
    attendees: 156,
    maxAttendees: 200,
    status: 'ongoing',
    image: '/images/user-1.webp',
    category: 'Product'
  },
  {
    id: '4',
    title: 'Team Building Retreat',
    description: 'Annual team building activities and workshops to strengthen collaboration.',
    date: '2024-02-28',
    time: '10:00 AM',
    location: 'Mountain Resort, Colorado',
    attendees: 45,
    maxAttendees: 50,
    status: 'completed',
    image: '/images/user-2.webp',
    category: 'Team Building'
  },
  {
    id: '5',
    title: 'Customer Success Summit',
    description: 'Gathering of customer success professionals to share best practices and insights.',
    date: '2024-03-25',
    time: '08:30 AM',
    location: 'Conference Hall, Chicago',
    attendees: 0,
    maxAttendees: 300,
    status: 'upcoming',
    image: '/images/user-1.webp',
    category: 'Customer Success'
  },
  {
    id: '6',
    title: 'Design Thinking Workshop',
    description: 'Hands-on workshop on design thinking methodologies and user-centered design.',
    date: '2024-02-15',
    time: '01:00 PM',
    location: 'Creative Studio, Austin',
    attendees: 32,
    maxAttendees: 40,
    status: 'completed',
    image: '/images/user-2.webp',
    category: 'Design'
  },
  {
    id: '7',
    title: 'Sales Training Bootcamp',
    description: 'Intensive sales training program for new and experienced sales professionals.',
    date: '2024-03-05',
    time: '09:00 AM',
    location: 'Training Center, Miami',
    attendees: 78,
    maxAttendees: 80,
    status: 'cancelled',
    image: '/images/user-1.webp',
    category: 'Sales'
  }
];

const getStatusBadge = (status: string) => {
  const baseClasses = 'text-xs rounded-full px-2 py-0.5 font-medium';
  switch (status) {
    case 'upcoming':
      return `${baseClasses} bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-500`;
    case 'ongoing':
      return `${baseClasses} bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-500`;
    case 'completed':
      return `${baseClasses} bg-gray-50 dark:bg-gray-500/15 text-gray-700 dark:text-gray-500`;
    case 'cancelled':
      return `${baseClasses} bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-500`;
    default:
      return `${baseClasses} bg-gray-50 text-gray-700 dark:bg-gray-500/15 dark:text-gray-500`;
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'upcoming':
      return 'Upcoming';
    case 'ongoing':
      return 'Ongoing';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
};

export default function EventsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
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

  const filteredEvents = mockEvents.filter(event => {
    const matchesSearch =
      event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.category.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter =
      activeFilter === 'all' ||
      event.status === activeFilter;

    return matchesSearch && matchesFilter;
  });

  const handleSelectAll = () => {
    if (selectedEvents.length === filteredEvents.length) {
      setSelectedEvents([]);
    } else {
      setSelectedEvents(filteredEvents.map(event => event.id));
    }
  };

  const handleSelectEvent = (eventId: string) => {
    setSelectedEvents(prev =>
      prev.includes(eventId)
        ? prev.filter(id => id !== eventId)
        : [...prev, eventId]
    );
  };

  const handleCreateEvent = () => {
    // Implement create event functionality
    console.log('Creating new event...');
  };

  const handleExport = () => {
    // Implement export functionality
    console.log('Exporting events...');
  };


  return (
    <div className="page-stack">
      <div>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Events</h2>
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
              <li className="text-sm text-gray-800 dark:text-white/90">Events</li>
            </ol>
          </nav>
        </div>

        {/* Events Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          {/* Table Header */}
          <div className="flex flex-col justify-between gap-5 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-center dark:border-gray-800">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Events List</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Manage and track all your events and activities.</p>
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
                onClick={handleCreateEvent}
                className="bg-brand-500 shadow-sm hover inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-600"
              >
                <Plus className="w-5 h-5" />
                Create Event
              </Button>
            </div>
          </div>

          {/* Search and Filter */}
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <div className="flex gap-3 sm:justify-between">
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
                  All Events
                </button>
                <button
                  onClick={() => setActiveFilter('upcoming')}
                  className={`text-sm h-10 rounded-md px-3 py-2 font-medium hover:text-gray-900 dark:hover:text-white ${
                    activeFilter === 'upcoming'
                      ? 'text-gray-900 dark:text-white bg-white dark:bg-gray-800'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  Upcoming
                </button>
                <button
                  onClick={() => setActiveFilter('ongoing')}
                  className={`text-sm h-10 rounded-md px-3 py-2 font-medium hover:text-gray-900 dark:hover:text-white ${
                    activeFilter === 'ongoing'
                      ? 'text-gray-900 dark:text-white bg-white dark:bg-gray-800'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  Ongoing
                </button>
                <button
                  onClick={() => setActiveFilter('completed')}
                  className={`text-sm h-10 rounded-md px-3 py-2 font-medium hover:text-gray-900 dark:hover:text-white ${
                    activeFilter === 'completed'
                      ? 'text-gray-900 dark:text-white bg-white dark:bg-gray-800'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  Completed
                </button>
              </div>

              {/* Search and Actions */}
              <div className="hidden flex-col gap-3 sm:flex sm:flex-row sm:items-center">
                <div className="relative">
                  <span className="absolute top-1/2 left-4 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                    <Search className="w-5 h-5" />
                  </span>
                  <Input
                    placeholder="Search events..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="shadow-theme-xs focus:border-brand-300 focus:ring-brand-500/10 dark:focus:border-brand-800 h-11 w-full rounded-lg border border-gray-300 bg-transparent py-2.5 pr-4 pl-11 text-sm text-gray-800 placeholder:text-gray-400 focus:ring-3 focus:outline-hidden xl:w-[300px] dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
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
                        <label className="mb-2 block text-xs font-medium text-gray-700 dark:text-gray-300">Location</label>
                        <input type="text" className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800" placeholder="Search location..." />
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
                <tr className="border-b border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                  <th className="p-4">
                    <div className="flex w-full cursor-pointer items-center justify-between">
                      <div className="flex items-center gap-3">
                        <label className="flex cursor-pointer items-center text-sm font-medium text-gray-700 select-none dark:text-gray-400">
                          <span className="relative">
                            <input
                              className="sr-only"
                              type="checkbox"
                              checked={selectedEvents.length === filteredEvents.length && filteredEvents.length > 0}
                              onChange={handleSelectAll}
                            />
                            <span className="flex h-4 w-4 items-center justify-center rounded-sm border-[1.25px] bg-transparent border-gray-300 dark:border-gray-700">
                              <span className={`${selectedEvents.length === filteredEvents.length && filteredEvents.length > 0 ? 'opacity-100' : 'opacity-0'}`}>
                                <Check className="w-3 h-3 text-white" />
                              </span>
                            </span>
                          </span>
                        </label>
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-400">Event</p>
                      </div>
                    </div>
                  </th>
                  <th className="cursor-pointer p-4 text-left text-xs font-medium text-gray-700 dark:text-gray-400">
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-400">Date &amp; Time</p>
                      <span className="flex flex-col gap-0.5">
                        <ChevronUp className="w-2 h-2 text-gray-300" />
                        <ChevronDown className="w-2 h-2 text-gray-300" />
                      </span>
                    </div>
                  </th>
                  <th className="cursor-pointer p-4 text-left text-xs font-medium text-gray-700 dark:text-gray-400">
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-400">Location</p>
                      <span className="flex flex-col gap-0.5">
                        <ChevronUp className="w-2 h-2 text-gray-300" />
                        <ChevronDown className="w-2 h-2 text-gray-300" />
                      </span>
                    </div>
                  </th>
                  <th className="cursor-pointer p-4 text-left text-xs font-medium text-gray-700 dark:text-gray-400">
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-400">Attendees</p>
                      <span className="flex flex-col gap-0.5">
                        <ChevronUp className="w-2 h-2 text-gray-300" />
                        <ChevronDown className="w-2 h-2 text-gray-300" />
                      </span>
                    </div>
                  </th>
                  <th className="p-4 text-left text-xs font-medium text-gray-700 dark:text-gray-400">Category</th>
                  <th className="p-4 text-left text-xs font-medium text-gray-700 dark:text-gray-400">Status</th>
                  <th className="p-4 text-left text-xs font-medium text-gray-700 dark:text-gray-400">
                    <div className="relative">
                      <span className="sr-only">Action</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-x divide-y divide-gray-200 dark:divide-gray-800">
                {filteredEvents.map((event) => (
                  <tr key={event.id} className="transition hover:bg-gray-50 dark:hover:bg-gray-900">
                    <td className="p-4 whitespace-nowrap">
                      <div className="group flex items-center gap-3">
                        <label className="flex cursor-pointer items-center text-sm font-medium text-gray-700 select-none dark:text-gray-400">
                          <span className="relative">
                            <input
                              className="sr-only"
                              type="checkbox"
                              checked={selectedEvents.includes(event.id)}
                              onChange={() => handleSelectEvent(event.id)}
                            />
                            <span className="flex h-4 w-4 items-center justify-center rounded-sm border-[1.25px] bg-transparent border-gray-300 dark:border-gray-700">
                              <span className={`${selectedEvents.includes(event.id) ? 'opacity-100' : 'opacity-0'}`}>
                                <Check className="w-3 h-3 text-white" />
                              </span>
                            </span>
                          </span>
                        </label>
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12">
                            <Image
                              alt={event.title}
                              width={48}
                              height={48}
                              className="h-12 w-12 rounded-md object-cover"
                              src={event.image}
                            />
                          </div>
                          <div>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-400">{event.title}</span>
                            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{event.description}</p>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-sm text-gray-700 dark:text-gray-400">{event.date}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{event.time}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <p className="text-sm text-gray-700 dark:text-gray-400">{event.location}</p>
                      </div>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-400" />
                        <p className="text-sm text-gray-700 dark:text-gray-400">{event.attendees}/{event.maxAttendees}</p>
                      </div>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <p className="text-sm text-gray-700 dark:text-gray-400">{event.category}</p>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className={getStatusBadge(event.status)}>
                        {getStatusText(event.status)}
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
                Showing <span className="text-gray-800 dark:text-white/90">1</span> to <span className="text-gray-800 dark:text-white/90">7</span> of <span className="text-gray-800 dark:text-white/90">7</span>
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
              <span className="block text-sm font-medium text-gray-700 sm:hidden dark:text-gray-400">Page 1 of 1</span>
              <ul className="hidden items-center gap-0.5 sm:flex">
                <li>
                  <Button size="sm" className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium bg-brand-500 text-white">1</Button>
                </li>
              </ul>
              <Button
                disabled
                variant="outline"
                size="sm"
                className="shadow-theme-xs flex items-center gap-2 rounded-lg border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50 sm:p-2.5 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
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
