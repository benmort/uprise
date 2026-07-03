'use client';

import { useState } from 'react';
import { Input } from '@/components/prog/ui/input';
import {
  Search,
  MoreHorizontal,
  Phone,
  Video,
  Smile,
  Paperclip,
  Send,
  X
} from 'lucide-react';

interface Chat {
  id: string;
  name: string;
  role: string;
  avatar: string;
  lastMessage: string;
  time: string;
  isOnline: boolean;
  unreadCount?: number;
}

interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
  isOwn: boolean;
  avatar?: string;
  image?: string;
}

const mockChats: Chat[] = [
  {
    id: '1',
    name: 'Kaiya George',
    role: 'Project Manager',
    avatar: '/images/user-1.webp',
    lastMessage: 'I want to make an appointment tomorrow from 2:00 to 5:00pm?',
    time: '15 mins',
    isOnline: true
  },
  {
    id: '2',
    name: 'Lindsey Curtis',
    role: 'Designer',
    avatar: '/images/user-2.webp',
    lastMessage: 'I want more detailed information.',
    time: '30 mins',
    isOnline: true
  },
  {
    id: '3',
    name: 'Zain Geidt',
    role: 'Content Writer',
    avatar: '/images/user-1.webp',
    lastMessage: 'Thanks for the feedback!',
    time: '45 mins',
    isOnline: true
  },
  {
    id: '4',
    name: 'Carla George',
    role: 'Front-end Developer',
    avatar: '/images/user-2.webp',
    lastMessage: 'The new design looks great!',
    time: '2 days',
    isOnline: false
  },
  {
    id: '5',
    name: 'Abram Schleifer',
    role: 'Digital Marketer',
    avatar: '/images/user-1.webp',
    lastMessage: 'Can we schedule a meeting?',
    time: '1 hour',
    isOnline: true
  },
  {
    id: '6',
    name: 'Lincoln Donin',
    role: 'Project Manager',
    avatar: '/images/user-2.webp',
    lastMessage: 'The project is on track.',
    time: '3 days',
    isOnline: true
  },
  {
    id: '7',
    name: 'Erin Geidthem',
    role: 'Copywriter',
    avatar: '/images/user-1.webp',
    lastMessage: 'I need more time for the copy.',
    time: '5 days',
    isOnline: true
  },
  {
    id: '8',
    name: 'Alena Baptista',
    role: 'SEO Expert',
    avatar: '/images/user-2.webp',
    lastMessage: 'The SEO report is ready.',
    time: '2 hours',
    isOnline: false
  },
  {
    id: '9',
    name: 'Wilium vamos',
    role: 'Content Writer',
    avatar: '/images/user-1.webp',
    lastMessage: 'Great work on the content!',
    time: '5 days',
    isOnline: true
  }
];

const mockMessages: Message[] = [
  {
    id: '1',
    sender: 'Kaiya George',
    content: 'I want to make an appointment tomorrow from 2:00 to 5:00pm?',
    timestamp: '15 mins',
    isOwn: false,
    avatar: '/images/user-1.webp'
  },
  {
    id: '2',
    sender: 'Lindsey Curtis',
    content: 'I want to make an appointment tomorrow from 2:00 to 5:00pm?',
    timestamp: '30 mins',
    isOwn: false,
    avatar: '/images/user-2.webp'
  },
  {
    id: '3',
    sender: 'You',
    content: 'If don\'t like something, I\'ll stay away from it.',
    timestamp: '2 hours ago',
    isOwn: true
  },
  {
    id: '4',
    sender: 'Lindsey Curtis',
    content: 'I want more detailed information.',
    timestamp: '2 hours ago',
    isOwn: false,
    avatar: '/images/user-2.webp'
  },
  {
    id: '5',
    sender: 'You',
    content: 'They got there early, and got really good seats.',
    timestamp: '2 hours ago',
    isOwn: true
  },
  {
    id: '6',
    sender: 'Lindsey Curtis',
    content: 'Please preview the image',
    timestamp: '2 hours ago',
    isOwn: false,
    avatar: '/images/user-2.webp',
    image: '/images/chat/chat.jpg'
  }
];

export default function ChatsPage() {
  const [selectedChat, setSelectedChat] = useState<Chat | null>(mockChats[1]); // Default to Lindsey Curtis
  const [searchQuery, setSearchQuery] = useState('');
  const [messageInput, setMessageInput] = useState('');

  const filteredChats = mockChats.filter(chat =>
    chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSendMessage = () => {
    if (messageInput.trim()) {
      // Here you would typically send the message to your backend
      console.log('Sending message:', messageInput);
      setMessageInput('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="p-4 mx-auto max-w-7xl md:p-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Chats</h2>
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
              <li className="text-sm text-gray-800 dark:text-white/90">Chats</li>
            </ol>
          </nav>
        </div>

        <div className="h-[calc(100vh-150px)] overflow-hidden sm:h-[calc(100vh-174px)]">
          <div className="flex flex-col h-full gap-6 xl:flex-row xl:gap-5">
            {/* Chat List Sidebar */}
            <div className="flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] xl:flex xl:w-1/4">
              <div className="sticky px-4 pt-4 pb-4 sm:px-5 sm:pt-5 xl:pb-0">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-800 text-xl dark:text-white/90 sm:text-2xl">Chats</h3>
                  </div>
                  <div className="relative">
                    <button className="dropdown-toggle">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                        <path fill="currentColor" d="M10.244 6c0-.966.784-1.75 1.75-1.75h.01a1.75 1.75 0 1 1 0 3.5h-.01A1.75 1.75 0 0 1 10.244 6m0 12c0-.966.784-1.75 1.75-1.75h.01a1.75 1.75 0 1 1 0 3.5h-.01a1.75 1.75 0 0 1-1.75-1.75m1.75-7.75a1.75 1.75 0 1 0 0 3.5h.01a1.75 1.75 0 1 0 0-3.5z"></path>
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-4">
                  <button className="flex items-center justify-center w-full text-gray-700 border border-gray-300 rounded-lg h-11 max-w-11 dark:border-gray-700 dark:text-gray-400 xl:hidden">
                    <svg className="fill-current" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" clipRule="evenodd" d="M3.25 6C3.25 5.58579 3.58579 5.25 4 5.25H20C20.4142 5.25 20.75 5.58579 20.75 6C20.75 6.41421 20.4142 6.75 20 6.75L4 6.75C3.58579 6.75 3.25 6.41422 3.25 6ZM3.25 18C3.25 17.5858 3.58579 17.25 4 17.25L20 17.25C20.4142 17.25 20.75 17.5858 20.75 18C20.75 18.4142 20.4142 18.75 20 18.75L4 18.75C3.58579 18.75 3.25 18.4142 3.25 18ZM4 11.25C3.58579 11.25 3.25 11.5858 3.25 12C3.25 12.4142 3.58579 12.75 4 12.75L20 12.75C20.4142 12.75 20.75 12.4142 20.75 12C20.75 11.5858 20.4142 11.25 20 11.25L4 11.25Z" fill=""></path>
                    </svg>
                  </button>

                  <div className="relative w-full my-2">
                    <form>
                      <button className="absolute -translate-y-1/2 left-4 top-1/2">
                        <Search className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                      </button>
                      <Input
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-11 w-full rounded-lg border border-gray-300 bg-transparent py-2.5 pl-[42px] pr-3.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                      />
                    </form>
                  </div>
                </div>
              </div>

              <div className="flex-col overflow-auto no-scrollbar transition-all duration-300 hidden xl:flex">
                <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-800 xl:hidden">
                  <div>
                    <h3 className="font-semibold text-gray-800 text-xl dark:text-white/90 sm:text-2xl">Chat</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <div>
                      <button className="dropdown-toggle">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                          <path fill="currentColor" d="M10.244 6c0-.966.784-1.75 1.75-1.75h.01a1.75 1.75 0 1 1 0 3.5h-.01A1.75 1.75 0 0 1 10.244 6m0 12c0-.966.784-1.75 1.75-1.75h.01a1.75 1.75 0 1 1 0 3.5h-.01a1.75 1.75 0 0 1-1.75-1.75m1.75-7.75a1.75 1.75 0 1 0 0 3.5h.01a1.75 1.75 0 1 0 0-3.5z"></path>
                        </svg>
                      </button>
                    </div>
                    <button className="flex items-center justify-center w-10 h-10 text-gray-700 transition border border-gray-300 rounded-full dark:border-gray-700 dark:text-gray-400 dark:hover:text-white/90">
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col max-h-full px-4 overflow-auto sm:px-5">
                  <div className="max-h-full space-y-1 overflow-auto custom-scrollbar">
                    {filteredChats.map((chat) => (
                      <div
                        key={chat.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg p-3 hover:bg-gray-100 dark:hover:bg-white/[0.03] ${
                          selectedChat?.id === chat.id ? 'bg-gray-100 dark:bg-white/[0.03]' : ''
                        }`}
                        onClick={() => setSelectedChat(chat)}
                      >
                        <div className="relative h-12 w-full max-w-[48px] rounded-full">
                          <img
                            alt="profile"
                            loading="lazy"
                            width="48"
                            height="48"
                            className="object-cover object-center w-full h-full overflow-hidden rounded-full"
                            src={chat.avatar}
                          />
                          <span className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full border-[1.5px] border-white dark:border-gray-900 ${
                            chat.isOnline ? 'bg-green-500' : 'bg-gray-400'
                          }`}></span>
                        </div>
                        <div className="w-full">
                          <div className="flex items-start justify-between">
                            <div>
                              <h5 className="text-sm font-medium text-gray-800 dark:text-white/90">{chat.name}</h5>
                              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{chat.role}</p>
                            </div>
                            <span className="text-gray-400 text-xs">{chat.time}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Chat Window */}
            <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] xl:w-3/4">
              {selectedChat ? (
                <>
                  {/* Chat Header */}
                  <div className="sticky flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 xl:px-6">
                    <div className="flex items-center gap-3">
                      <div className="relative h-12 w-full max-w-[48px] rounded-full">
                        <img
                          alt="profile"
                          loading="lazy"
                          width="48"
                          height="48"
                          className="object-cover object-center w-full h-full overflow-hidden rounded-full"
                          src={selectedChat.avatar}
                        />
                        <span className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full border-[1.5px] border-white bg-green-500 dark:border-gray-900`}></span>
                      </div>
                      <h5 className="text-sm font-medium text-gray-500 dark:text-gray-400">{selectedChat.name}</h5>
                    </div>
                    <div className="flex items-center gap-3">
                      <button className="text-gray-700 hover:text-brand-500 dark:text-gray-400 dark:hover:text-white/90">
                        <Phone className="w-6 h-6" />
                      </button>
                      <button className="text-gray-700 hover:text-brand-500 dark:text-gray-400 dark:hover:text-white/90">
                        <Video className="w-6 h-6" />
                      </button>
                      <div className="relative -mb-1.5">
                        <button className="dropdown-toggle">
                          <MoreHorizontal className="w-6 h-6 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 max-h-full p-5 space-y-6 overflow-auto custom-scrollbar xl:space-y-8 xl:p-6">
                    {mockMessages.map((message) => (
                      <div key={message.id} className={`flex items-start gap-4 ${message.isOwn ? 'justify-end' : ''}`}>
                        {!message.isOwn && (
                          <div className="w-10 h-10 overflow-hidden rounded-full">
                            <img
                              alt={`${message.sender} profile`}
                              loading="lazy"
                              width="40"
                              height="40"
                              className="object-cover object-center w-full h-full"
                              src={message.avatar}
                            />
                          </div>
                        )}
                        <div className={message.isOwn ? 'text-right' : ''}>
                          {message.image && (
                            <div className="mb-2 w-full max-w-[270px] overflow-hidden rounded-lg">
                              <img
                                alt="chat"
                                loading="lazy"
                                width="270"
                                height="150"
                                className="object-cover w-full"
                                src={message.image}
                              />
                            </div>
                          )}
                          <div className={`px-3 py-2 rounded-lg text-gray-800 dark:text-white/90 rounded-tl-sm ${
                            message.isOwn
                              ? 'bg-brand-500 text-white dark:bg-brand-500 rounded-tr-sm'
                              : 'bg-gray-100 dark:bg-white/5'
                          }`}>
                            <p className="text-sm">{message.content}</p>
                          </div>
                          <p className="mt-2 text-gray-500 text-xs dark:text-gray-400">
                            {message.sender}, {message.timestamp}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Message Input */}
                  <div className="sticky bottom-0 p-3 border-t border-gray-200 dark:border-gray-800">
                    <form className="flex items-center justify-between">
                      <div className="relative w-full">
                        <button className="absolute text-gray-500 -translate-y-1/2 left-1 top-1/2 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white/90 sm:left-3">
                          <Smile className="w-6 h-6" />
                        </button>
                        <Input
                          placeholder="Type a message"
                          value={messageInput}
                          onChange={(e) => setMessageInput(e.target.value)}
                          onKeyPress={handleKeyPress}
                          className="w-full pl-12 pr-5 text-sm text-gray-800 bg-transparent border-none outline-hidden h-9 placeholder:text-gray-400 focus:border-0 focus:ring-0 dark:text-white/90"
                        />
                      </div>
                      <div className="flex items-center">
                        <button className="mr-2 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white/90">
                          <Paperclip className="w-6 h-6" />
                        </button>
                        <button className="flex items-center justify-center ml-3 text-white rounded-lg h-9 w-9 bg-brand-500 hover:bg-brand-600 xl:ml-5">
                          <Send className="w-5 h-5" />
                        </button>
                      </div>
                    </form>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      Select a chat to start messaging
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Choose a conversation from the sidebar to view messages
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
