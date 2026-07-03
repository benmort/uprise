'use client';

import { useState } from 'react';
// import { Button } from '@/components/prog/ui/button';
import { Input } from '@/components/prog/ui/input';
import {
  Plus,
  Search,
  Copy,
  Link,
  Send,
  MoreHorizontal
} from 'lucide-react';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ChatHistory {
  id: string;
  title: string;
  date: string;
  category: 'today' | 'yesterday' | 'older';
}

const mockMessages: ChatMessage[] = [
  {
    id: '1',
    type: 'user',
    content: 'Can you generate some random, creative, and engaging placeholder text for me? It doesn\'t need to follow any specific structure – just something fun or interesting to fill space temporarily.',
    timestamp: '2024-03-15T10:30:00Z'
  },
  {
    id: '2',
    type: 'assistant',
    content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus et varius tortor. Aenean dui magna, vehicula in lacinia non, euismod sed odio. Aliquam erat volutpat.\n\nInteger iaculis eu tellus vel tincidunt. Sed sed dictum orci, in pretium erat. Proin ut mi a arcu mollis hendrerit. Ut id est finibus, egestas tellus ac, pharetra ante.',
    timestamp: '2024-03-15T10:31:00Z'
  },
  {
    id: '3',
    type: 'user',
    content: 'I\'m looking for a block of random, imaginative text – something quirky or unexpected to use as placeholder content.',
    timestamp: '2024-03-15T10:35:00Z'
  },
  {
    id: '4',
    type: 'assistant',
    content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus et varius tortor. Aenean dui magna, vehicula in lacinia non, euismod sed odio. Aliquam erat volutpat. Integer iaculis eu tellus vel tincidunt. Sed sed dictum orci, in pretium erat.\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus et varius tortor.',
    timestamp: '2024-03-15T10:36:00Z'
  }
];

const mockChatHistory: ChatHistory[] = [
  { id: '1', title: 'Write a follow-up email to a client', date: '2024-03-15', category: 'today' },
  { id: '2', title: 'Generate responsive login form layout', date: '2024-03-15', category: 'today' },
  { id: '3', title: 'Create a warning state modal', date: '2024-03-15', category: 'today' },
  { id: '4', title: 'Suggest color palette for dark theme', date: '2024-03-15', category: 'today' },
  { id: '5', title: 'Improve login page accessibility', date: '2024-03-14', category: 'yesterday' },
  { id: '6', title: 'Create a warning state modal with animation', date: '2024-03-14', category: 'yesterday' },
  { id: '7', title: 'Add password visibility toggle', date: '2024-03-14', category: 'yesterday' },
  { id: '8', title: 'Write validation logic for login form...', date: '2024-03-14', category: 'yesterday' },
  { id: '9', title: 'Fix mobile responsiveness of login UI...', date: '2024-03-14', category: 'yesterday' }
];

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(mockMessages);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const handleSendMessage = () => {
    if (newMessage.trim()) {
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'user',
        content: newMessage,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, userMessage]);
      setNewMessage('');

      // Simulate AI response
      setTimeout(() => {
        const aiMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: 'This is a simulated AI response. In a real implementation, this would connect to an AI service.',
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, aiMessage]);
      }, 1000);
    }
  };

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const handleNewChat = () => {
    setMessages([]);
  };

  const filteredHistory = mockChatHistory.filter(chat =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const todayChats = filteredHistory.filter(chat => chat.category === 'today');
  const yesterdayChats = filteredHistory.filter(chat => chat.category === 'yesterday');

  return (
    <div className="relative h-[calc(100vh-134px)] xl:h-[calc(100vh-146px)] px-4 xl:flex xl:px-0">
      {/* Mobile Chat History Header */}
      <div className="my-6 flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-3 xl:hidden dark:border-gray-800 dark:bg-gray-900">
        <h4 className="pl-2 text-lg font-medium text-gray-800 dark:text-white/90">Chats History</h4>
        <button className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-400">
          <MoreHorizontal className="w-6 h-6" />
        </button>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 xl:py-10">
        <div className="relative mx-auto items-center max-w-[720px]">
          {/* Messages */}
          <div className="custom-scrollbar relative z-20 max-h-[50vh] flex-1 mx-auto space-y-7 w-full overflow-y-auto pb-10 lg:pb-7">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`shadow-theme-xs max-w-[480px] rounded-xl px-4 py-3 ${
                  message.type === 'user'
                    ? 'bg-brand-100 dark:bg-brand-500/20 rounded-tr-xs'
                    : 'bg-gray-100 dark:bg-white/5 rounded-tl-xs'
                }`}>
                  <p className="text-left text-sm font-normal text-gray-800 dark:text-white/90 whitespace-pre-line">
                    {message.content}
                  </p>
                </div>
                {message.type === 'assistant' && (
                  <div className="mt-3">
                    <button
                      onClick={() => handleCopyMessage(message.content)}
                      className="flex h-8 items-center gap-1 rounded-full border border-gray-100 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-500 dark:border-white/5 dark:bg-gray-900 dark:text-gray-400 dark:hover:text-white/90"
                    >
                      <Copy className="w-4 h-4" />
                      <span>Copy</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Input Area */}
          <div className="fixed bottom-5 lg:bottom-10 left-1/2 z-20 w-full -translate-x-1/2 transform px-4 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[720px] rounded-2xl border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800 dark:bg-gray-800">
              <textarea
                placeholder="Type your prompt here..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                className="h-20 w-full resize-none border-none bg-transparent p-0 font-normal text-gray-800 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-white"
              />
              <div className="flex items-center justify-between pt-2">
                <button className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
                  <Link className="w-5 h-5" />
                  Attach
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gray-900 text-white transition hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white/90 dark:text-gray-800 dark:hover:bg-gray-900 dark:hover:text-white/90"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="relative">
        <aside className="w-[280px] flex-col h-full border-l border-gray-200 bg-white p-6 ease-in-out dark:border-gray-800 dark:bg-gray-900 hidden xl:flex">
          {/* New Chat Button */}
          <button
            onClick={handleNewChat}
            className="bg-brand-500 hover:bg-brand-600 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white transition"
          >
            <Plus className="w-5 h-5" />
            New Chat
          </button>

          {/* Search */}
          <div className="mt-5">
            <form>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2">
                  <Search className="w-5 h-5 fill-gray-500 dark:fill-gray-400" />
                </span>
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="shadow-theme-xs focus:border-brand-300 focus:ring-brand-500/10 dark:focus:border-brand-800 h-11 w-full rounded-lg border border-gray-300 bg-transparent py-2.5 pr-3.5 pl-[42px] text-sm text-gray-800 placeholder:text-gray-400 focus:ring-3 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
                />
              </div>
            </form>
          </div>

          {/* Chat History */}
          <div className="custom-scrollbar mt-6 h-full flex-1 space-y-3 overflow-y-auto text-sm">
            {/* Today's Chats */}
            {todayChats.length > 0 && (
              <div>
                <p className="mb-3 pl-3 text-xs text-gray-400 uppercase">Today</p>
                <ul className="space-y-1">
                  {todayChats.map((chat) => (
                    <li key={chat.id} className="group relative rounded-full px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-950">
                      <div className="flex cursor-pointer items-center justify-between">
                        <a href="#" className="block truncate text-sm text-gray-700 dark:text-gray-400">
                          {chat.title}
                        </a>
                        <button className="invisible ml-2 rounded-full p-1 text-gray-700 group-hover:visible hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Yesterday's Chats */}
            {yesterdayChats.length > 0 && (
              <div className="relative">
                <p className="mb-3 pl-3 text-xs text-gray-400 uppercase">Yesterday</p>
                <ul className="space-y-1">
                  {yesterdayChats.map((chat) => (
                    <li key={chat.id} className="group relative rounded-full px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-950">
                      <div className="flex cursor-pointer items-center justify-between">
                        <a href="#" className="block truncate text-sm text-gray-700 dark:text-gray-400">
                          {chat.title}
                        </a>
                        <button className="invisible ml-2 rounded-full p-1 text-gray-700 group-hover:visible hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="pointer-events-none absolute bottom-0 left-0 z-10 h-8 w-full bg-gradient-to-t from-white to-transparent dark:from-gray-900"></div>
              </div>
            )}

            {/* Show More Button */}
            <div className="mt-4 pl-3">
              <button className="text-primary-500 flex w-full items-center justify-between text-xs font-medium text-gray-400">
                <span>Show more...</span>
                <svg className="ml-2 transition-transform" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3.83331 6.41669L7.99998 10.5834L12.1666 6.41669" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"></path>
                </svg>
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
