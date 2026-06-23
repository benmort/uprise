import React from "react";
import { CircleIcon } from "lucide-react";
import Link from "next/link";
import FooterAecWidget from "./FooterAecWidget";
import NewsletterSignup from "./NewsletterSignup";

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-gray-200 bg-gray-50 px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Main Footer Content - 4 Column Grid */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 mb-12">
          {/* Company Info */}
          <div className="lg:col-span-3">
            <div className="flex items-center gap-2 mb-6">
              <CircleIcon className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold text-gray-900">Foment</span>
            </div>
            <p className="text-gray-600 mb-6 max-w-md">
              Built for progressive organisations, nonprofits, and changemakers who want to make a real impact.
            </p>

            <FooterAecWidget />

          </div>

          {/* About */}
          <div className="lg:col-span-2">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Resources</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/about-us" className="text-gray-600 hover:text-primary transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/blog" className="text-gray-600 hover:text-primary transition-colors">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/plans" className="text-gray-600 hover:text-primary transition-colors">
                  Plans
                </Link>
              </li>
              <li>
                <Link href="/for-campaigners" className="text-gray-600 hover:text-primary transition-colors">
                  For Campaigners
                </Link>
              </li>
              <li>
                <Link href="/integrations" className="text-gray-600 hover:text-primary transition-colors">
                  Integrations
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div className="lg:col-span-2">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Community</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/support-centre" className="text-gray-600 hover:text-primary transition-colors">
                  Support Centre
                </Link>
              </li>
              <li>
                <Link href="/contact-us" className="text-gray-600 hover:text-primary transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="/request-demo" className="text-gray-600 hover:text-primary transition-colors">
                  Request a Demo
                </Link>
              </li>
              <li>
                <Link href="/developers" className="text-gray-600 hover:text-primary transition-colors">
                  Developers
                </Link>
              </li>
            </ul>
          </div>

          {/* Legals */}
          <div className="lg:col-span-2">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Policies</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/terms-of-service" className="text-gray-600 hover:text-primary transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/privacy-policy" className="text-gray-600 hover:text-primary transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/security" className="text-gray-600 hover:text-primary transition-colors">
                  Security
                </Link>
              </li>
              <li>
                <Link href="/donations-policy" className="text-gray-600 hover:text-primary transition-colors">
                  Donations Policy
                </Link>
              </li>
              <li>
                <Link href="/compliance" className="text-gray-600 hover:text-primary transition-colors">
                  Compliance
                </Link>
              </li>
            </ul>
          </div>

          {/* Newsletter */}
          <div className="lg:col-span-3">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Newsletter</h3>
            <p className="text-gray-600 mb-4">Subscribe for the latest updates</p>
            <NewsletterSignup />
          </div>
        </div>

        {/* Bottom Footer */}
        <div className="border-t border-gray-200 pt-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">
                Current Version: 0.0.1
              </span>
              <span className="text-sm text-gray-500">•</span>
              <span className="text-sm text-gray-500">
                © 2025 Foment - All Rights Reserved.
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>A product by</span>
              <CircleIcon className="h-4 w-4 text-primary" />
              <span className="font-medium text-gray-700">Foment</span>
            </div>
          </div>
        </div>

        {/* Acknowledgment */}
        <div className="pt-2 mt-2">
          <div className="text-left">
            <p className="text-sm text-gray-500 max-w-4xl leading-relaxed">
              We pay respect to our elders and acknowledge the Traditional Owners who&apos;ve cared for country since time immemorial.
              <br />
              Sovereignty was never ceded - it always was, and always will be, Aboriginal land.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
