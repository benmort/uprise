'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/prog/ui/card';
import { Button } from '@/components/prog/ui/button';
import { Input } from '@/components/prog/ui/input';
import {
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Search,
  Filter,
  // Calendar,
  Clock,
  // User,
  MoreHorizontal,
  Play,
  Download,
  Trash2,
  Archive
} from 'lucide-react';

interface Call {
  id: string;
  type: 'incoming' | 'outgoing' | 'missed';
  contact: string;
  phoneNumber: string;
  duration: string;
  timestamp: string;
  status: 'completed' | 'missed' | 'voicemail';
  recording?: string;
}

const mockCalls: Call[] = [
  {
    id: '1',
    type: 'incoming',
    contact: 'John Smith',
    phoneNumber: '+1 (555) 123-4567',
    duration: '5:32',
    timestamp: '2:45 PM',
    status: 'completed',
    recording: 'recording_001.mp3'
  },
  {
    id: '2',
    type: 'outgoing',
    contact: 'Sarah Johnson',
    phoneNumber: '+1 (555) 987-6543',
    duration: '12:18',
    timestamp: '1:30 PM',
    status: 'completed'
  },
  {
    id: '3',
    type: 'missed',
    contact: 'Mike Wilson',
    phoneNumber: '+1 (555) 456-7890',
    duration: '0:00',
    timestamp: '11:15 AM',
    status: 'missed'
  },
  {
    id: '4',
    type: 'incoming',
    contact: 'Unknown',
    phoneNumber: '+1 (555) 321-0987',
    duration: '0:00',
    timestamp: '10:30 AM',
    status: 'voicemail',
    recording: 'voicemail_001.mp3'
  },
  {
    id: '5',
    type: 'outgoing',
    contact: 'Emily Davis',
    phoneNumber: '+1 (555) 654-3210',
    duration: '8:45',
    timestamp: '9:20 AM',
    status: 'completed'
  },
  {
    id: '6',
    type: 'incoming',
    contact: 'Robert Brown',
    phoneNumber: '+1 (555) 789-0123',
    duration: '3:12',
    timestamp: 'Yesterday',
    status: 'completed'
  },
  {
    id: '7',
    type: 'missed',
    contact: 'Lisa Anderson',
    phoneNumber: '+1 (555) 234-5678',
    duration: '0:00',
    timestamp: 'Yesterday',
    status: 'missed'
  },
  {
    id: '8',
    type: 'outgoing',
    contact: 'David Miller',
    phoneNumber: '+1 (555) 567-8901',
    duration: '15:30',
    timestamp: 'Yesterday',
    status: 'completed'
  }
];

const getCallIcon = (type: string, status: string) => {
  if (status === 'missed') return PhoneMissed;
  if (type === 'incoming') return PhoneIncoming;
  if (type === 'outgoing') return PhoneOutgoing;
  return PhoneCall;
};

const getCallIconColor = (type: string, status: string) => {
  if (status === 'missed') return 'text-red-500';
  if (type === 'incoming') return 'text-green-500';
  if (type === 'outgoing') return 'text-blue-500';
  return 'text-gray-500';
};

const getStatusBadge = (status: string) => {
  const baseClasses = 'px-2 py-1 rounded-full text-xs font-medium';
  switch (status) {
    case 'completed':
      return `${baseClasses} bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400`;
    case 'missed':
      return `${baseClasses} bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400`;
    case 'voicemail':
      return `${baseClasses} bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400`;
    default:
      return `${baseClasses} bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400`;
  }
};

export default function CallsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCalls, setSelectedCalls] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'incoming' | 'outgoing' | 'missed'>('all');
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

  const filteredCalls = mockCalls.filter(call => {
    const matchesSearch = call.contact.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         call.phoneNumber.includes(searchQuery);
    const matchesFilter = filterType === 'all' || call.type === filterType;
    return matchesSearch && matchesFilter;
  });

  const handleSelectCall = (callId: string) => {
    setSelectedCalls(prev =>
      prev.includes(callId)
        ? prev.filter(id => id !== callId)
        : [...prev, callId]
    );
  };

  const _handleSelectAll = () => {
    if (selectedCalls.length === filteredCalls.length) {
      setSelectedCalls([]);
    } else {
      setSelectedCalls(filteredCalls.map(call => call.id));
    }
  };

  return (
    <div className="page-stack">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Calls</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Manage your call history and recordings
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Phone className="w-4 h-4 mr-2" />
            Make Call
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg dark:bg-green-900/20">
                <PhoneIncoming className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Incoming</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {mockCalls.filter(call => call.type === 'incoming').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-900/20">
                <PhoneOutgoing className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Outgoing</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {mockCalls.filter(call => call.type === 'outgoing').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg dark:bg-red-900/20">
                <PhoneMissed className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Missed</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {mockCalls.filter(call => call.type === 'missed').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-gray-100 rounded-lg dark:bg-gray-900/20">
                <Clock className="w-6 h-6 text-gray-600 dark:text-gray-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Duration</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">2h 45m</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Call History</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search calls..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-full sm:w-64"
                />
              </div>
              <div className="relative" ref={filterRef}>
                <Button variant="outline" size="sm" onClick={() => setShowFilter(!showFilter)}>
                  <Filter className="w-4 h-4 mr-2" />
                  Filter
                </Button>
                {showFilter && (
                  <div className="absolute right-0 z-10 mt-2 w-56 rounded-lg border border-gray-200 bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                    <div className="mb-5">
                      <label className="mb-2 block text-xs font-medium text-gray-700 dark:text-gray-300">Contact</label>
                      <input type="text" className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800" placeholder="Search contact..." />
                    </div>
                    <div className="mb-5">
                      <label className="mb-2 block text-xs font-medium text-gray-700 dark:text-gray-300">Duration</label>
                      <input type="text" className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800" placeholder="Min duration..." />
                    </div>
                    <button onClick={() => setShowFilter(false)} className="h-10 w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600">Apply</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filter Tabs */}
          <div className="flex gap-2 mb-6">
            {[
              { key: 'all', label: 'All Calls' },
              { key: 'incoming', label: 'Incoming' },
              { key: 'outgoing', label: 'Outgoing' },
              { key: 'missed', label: 'Missed' }
            ].map((filter) => (
              <Button
                key={filter.key}
                variant={filterType === filter.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType(filter.key as 'all' | 'incoming' | 'outgoing' | 'missed')}
              >
                {filter.label}
              </Button>
            ))}
          </div>

          {/* Call List */}
          <div className="space-y-2">
            {filteredCalls.length > 0 ? (
              filteredCalls.map((call) => {
                const CallIcon = getCallIcon(call.type, call.status);
                const iconColor = getCallIconColor(call.type, call.status);

                return (
                  <div
                    key={call.id}
                    className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCalls.includes(call.id)}
                      onChange={() => handleSelectCall(call.id)}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    />

                    <div className={`p-2 rounded-lg ${iconColor.includes('red') ? 'bg-red-100 dark:bg-red-900/20' : iconColor.includes('green') ? 'bg-green-100 dark:bg-green-900/20' : iconColor.includes('blue') ? 'bg-blue-100 dark:bg-blue-900/20' : 'bg-gray-100 dark:bg-gray-900/20'}`}>
                      <CallIcon className={`w-5 h-5 ${iconColor}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {call.contact}
                        </p>
                        <span className={getStatusBadge(call.status)}>
                          {call.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {call.phoneNumber}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {call.duration}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {call.timestamp}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {call.recording && (
                        <Button variant="ghost" size="sm">
                          <Play className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12">
                <Phone className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  No calls found
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {searchQuery ? 'Try adjusting your search criteria' : 'Your call history will appear here'}
                </p>
              </div>
            )}
          </div>

          {/* Bulk Actions */}
          {selectedCalls.length > 0 && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedCalls.length} call{selectedCalls.length !== 1 ? 's' : ''} selected
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                  <Button variant="outline" size="sm">
                    <Archive className="w-4 h-4 mr-2" />
                    Archive
                  </Button>
                  <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
