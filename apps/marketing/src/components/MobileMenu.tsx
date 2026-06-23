"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, CircleIcon } from "lucide-react";
import { authAppUrl } from "@/lib/links";

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const [expandedSections, setExpandedSections] = useState<{
    products: boolean;
    resources: boolean;
    policies: boolean;
    community: boolean;
  }>({
    products: false,
    resources: false,
    policies: false,
    community: false,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Prevent body scroll when mobile menu is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    // Cleanup function to restore scroll when component unmounts
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] h-dvh w-full overflow-hidden bg-transparent duration-200 xl:hidden visible opacity-100">
      <div className="relative h-full bg-white flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto p-5 pt-20 pb-24 min-h-0">
          <ul>
            <li className="group relative">
              <Link
                href="/#channels"
                className="flex items-center justify-between gap-2 border-b border-gray-200 p-3 text-base text-gray-700 duration-200 hover:text-blue-600"
                onClick={onClose}
              >
                Channels
              </Link>
            </li>
            <li className="group relative">
              <Link
                href="/#features"
                className="flex items-center justify-between gap-2 border-b border-gray-200 p-3 text-base text-gray-700 duration-200 hover:text-blue-600"
                onClick={onClose}
              >
                Features
              </Link>
            </li>
            <li className="group relative">
              <button
                className="flex w-full items-center justify-between gap-2 border-b border-gray-200 p-3 text-base text-gray-700 duration-200 hover:text-blue-600"
                onClick={() => toggleSection('resources')}
              >
                Resources
                <span className={`duration-200 ${expandedSections.resources ? 'rotate-180' : ''}`}>
                  <ChevronDown className="h-5 w-5" />
                </span>
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  expandedSections.resources ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="mt-2 rounded-lg border border-gray-200 p-3">
                  <Link
                    href="/about-us"
                    className="flex w-full rounded-2xl p-3 text-base duration-200 hover:bg-gray-100"
                    onClick={onClose}
                  >
                    About Us
                  </Link>
                  <Link
                    href="/blog"
                    className="flex w-full rounded-2xl p-3 text-base duration-200 hover:bg-gray-100"
                    onClick={onClose}
                  >
                    Blog
                  </Link>
                  <Link
                    href="/plans"
                    className="flex w-full rounded-2xl p-3 text-base duration-200 hover:bg-gray-100"
                    onClick={onClose}
                  >
                    Plans
                  </Link>
                  <Link
                    href="/for-campaigners"
                    className="flex w-full rounded-2xl p-3 text-base duration-200 hover:bg-gray-100"
                    onClick={onClose}
                  >
                    For Campaigners
                  </Link>
                  <Link
                    href="/integrations"
                    className="flex w-full rounded-2xl p-3 text-base duration-200 hover:bg-gray-100"
                    onClick={onClose}
                  >
                    Integrations
                  </Link>
                </div>
              </div>
            </li>
            <li className="group relative">
              <button
                className="flex w-full items-center justify-between gap-2 border-b border-gray-200 p-3 text-base text-gray-700 duration-200 hover:text-blue-600"
                onClick={() => toggleSection('community')}
              >
                Community
                <span className={`duration-200 ${expandedSections.community ? 'rotate-180' : ''}`}>
                  <ChevronDown className="h-5 w-5" />
                </span>
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  expandedSections.community ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="mt-2 rounded-lg border border-gray-200 p-3">
                  <Link
                    href="/support-centre"
                    className="flex w-full rounded-2xl p-3 text-base duration-200 hover:bg-gray-100"
                    onClick={onClose}
                  >
                    Support Centre
                  </Link>
                  <Link
                    href="/contact-us"
                    className="flex w-full rounded-2xl p-3 text-base duration-200 hover:bg-gray-100"
                    onClick={onClose}
                  >
                    Contact Us
                  </Link>
                  <Link
                    href="/request-demo"
                    className="flex w-full rounded-2xl p-3 text-base duration-200 hover:bg-gray-100"
                    onClick={onClose}
                  >
                    Request a Demo
                  </Link>
                </div>
              </div>
            </li>
            <li className="group relative">
              <button
                className="flex w-full items-center justify-between gap-2 border-b border-gray-200 p-3 text-base text-gray-700 duration-200 hover:text-blue-600"
                onClick={() => toggleSection('policies')}
              >
                Policies
                <span className={`duration-200 ${expandedSections.policies ? 'rotate-180' : ''}`}>
                  <ChevronDown className="h-5 w-5" />
                </span>
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  expandedSections.policies ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="mt-2 rounded-lg border border-gray-200 p-3">
                  <Link
                    href="/privacy-policy"
                    className="flex w-full rounded-2xl p-3 text-base duration-200 hover:bg-gray-100"
                    onClick={onClose}
                  >
                    Privacy Policy
                  </Link>
                  <Link
                    href="/terms-of-service"
                    className="flex w-full rounded-2xl p-3 text-base duration-200 hover:bg-gray-100"
                    onClick={onClose}
                  >
                    Terms of Service
                  </Link>
                  <Link
                    href="/security"
                    className="flex w-full rounded-2xl p-3 text-base duration-200 hover:bg-gray-100"
                    onClick={onClose}
                  >
                    Security
                  </Link>
                  <Link
                    href="/compliance"
                    className="flex w-full rounded-2xl p-3 text-base duration-200 hover:bg-gray-100"
                    onClick={onClose}
                  >
                    Compliance
                  </Link>
                  <Link
                    href="/donations-policy"
                    className="flex w-full rounded-2xl p-3 text-base duration-200 hover:bg-gray-100"
                    onClick={onClose}
                  >
                    Donations Policy
                  </Link>
                </div>
              </div>
            </li>
          </ul>
        </div>
        <div className="flex-shrink-0 w-full bg-white border-t border-gray-200 p-4 pb-safe">
          <div className="flex flex-col gap-3">
            <Link
              href="/plans"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-[rgb(52,64,84)] px-4 py-3 text-sm font-medium text-white shadow-theme-xs duration-200 hover:bg-[#1e293b] h-12 w-full touch-manipulation"
              onClick={onClose}
            >
              View Plans
              <ChevronRight className="h-5 w-5" />
            </Link>
            <a
              href={`${authAppUrl()}/sign-up`}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white duration-200 h-12 w-full touch-manipulation"
              onClick={onClose}
            >
              <span>
                <CircleIcon className="h-5 w-5" />
              </span>
              Get Started
            </a>
            <a
              href={`${authAppUrl()}/sign-in`}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-xs duration-200 hover:bg-gray-50 hover:text-gray-800 h-12 w-full touch-manipulation"
              onClick={onClose}
            >
              Login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
