import React from "react";

export default function CommsChannels() {
  return (
    <section id="channels" className="relative z-10 bg-[linear-gradient(180deg,rgba(242,244,247,0.00)_53.55%,#F2F4F7_101.85%)] py-16 md:py-24 lg:py-30">
      <div className="container">
        <div className="mx-auto mb-12 w-full max-w-[810px] text-center lg:mb-15">
          <span className="mb-3 inline-block text-lg font-medium text-blue-600">
            Connect through every channel that matters
          </span>
          <h2 className="text-3xl font-bold !leading-[1.2] text-gray-900 md:text-[40px]">
            Reach your supporters across email, social media, SMS, phone, and tradional mail
          </h2>
        </div>
      </div>
      
      <div className="px-4 xl:px-10 2xl:px-16 min-[1800px]:px-[115px]">
        <div className="grid gap-7.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {/* Email Channel Card */}
          <div className="@container group relative rounded-3xl border border-gray-200 bg-white duration-200 hover:border-blue-200">
            <div className="py-8 px-5 @xs:px-8 mx-auto flex h-full w-full max-w-[280px] flex-col justify-between text-center">
              <div className="flex-1">
                <h3 className="mb-7.5 text-xl font-semibold text-gray-900">Email Marketing</h3>
                <div className="inline-flex cursor-pointer items-center justify-center rounded-full border-[14px] border-gray-50 bg-gray-50">
                  <div className="inline-flex items-center justify-center gap-3 rounded-full border-[6px] border-gray-100 bg-white p-2.5">
                    <span className="flex aspect-square w-12 items-center justify-center rounded-full bg-gradient-to-b from-blue-500 to-blue-600 shadow-lg">
                      <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </span>
                    <span>
                      <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </span>
                    <span className="flex aspect-square w-12 items-center justify-center rounded-full bg-gradient-to-b from-blue-400 to-blue-500 shadow-lg">
                      <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </span>
                  </div>
                </div>
                <p className="mb-7.5 text-base text-gray-600">Send targeted campaigns, newsletters, and updates to your supporters</p>
              </div>
              <a className="flex h-12 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-50 text-sm font-medium text-blue-600 duration-200 group-hover:bg-blue-600 group-hover:text-white hover:!bg-blue-700" href="#">
                Explore Now
                <svg className="h-5 w-5" viewBox="0 0 21 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M7.79167 15.8335L13 10.6252L7.79167 5.41683" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Social Media Channel Card */}
          <div className="@container group relative rounded-3xl border border-gray-200 bg-white duration-200 hover:border-blue-200">
            <div className="py-8 px-5 @xs:px-8 mx-auto flex h-full w-full max-w-[280px] flex-col justify-between text-center">
              <div className="flex-1">
                <h3 className="mb-7.5 text-xl font-semibold text-gray-900">Social Media</h3>
                <div className="inline-flex cursor-pointer items-center justify-center rounded-full border-[14px] border-gray-50 bg-gray-50">
                  <div className="inline-flex items-center justify-center gap-3 rounded-full border-[6px] border-gray-100 bg-white p-2.5">
                    <span className="flex aspect-square w-12 items-center justify-center rounded-full bg-gradient-to-b from-green-500 to-green-600 shadow-lg">
                      <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                      </svg>
                    </span>
                    <span>
                      <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </span>
                    <span className="flex aspect-square w-12 items-center justify-center rounded-full bg-gradient-to-b from-green-400 to-green-500 shadow-lg">
                      <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </span>
                  </div>
                </div>
                <p className="mb-7.5 text-base text-gray-600">Amplify your message across Facebook, TikTok, Instagram, X and LinkedIn</p>
              </div>
              <a className="flex h-12 w-full items-center justify-center gap-1.5 rounded-lg bg-green-50 text-sm font-medium text-green-600 duration-200 group-hover:bg-green-600 group-hover:text-white hover:!bg-green-700" href="#">
                Explore Now
                <svg className="h-5 w-5" viewBox="0 0 21 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M7.79167 15.8335L13 10.6252L7.79167 5.41683" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            </div>
          </div>

          {/* SMS Channel Card */}
          <div className="@container group relative rounded-3xl border border-gray-200 bg-white duration-200 hover:border-blue-200">
            <div className="py-8 px-5 @xs:px-8 mx-auto flex h-full w-full max-w-[280px] flex-col justify-between text-center">
              <div className="flex-1">
                <h3 className="mb-7.5 text-xl font-semibold text-gray-900">SMS Messaging</h3>
                <div className="inline-flex cursor-pointer items-center justify-center rounded-full border-[14px] border-gray-50 bg-gray-50">
                  <div className="inline-flex items-center justify-center gap-3 rounded-full border-[6px] border-gray-100 bg-white p-2.5">
                    <span className="flex aspect-square w-12 items-center justify-center rounded-full bg-gradient-to-b from-purple-500 to-purple-600 shadow-lg">
                      <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </span>
                    <span>
                      <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </span>
                    <span className="flex aspect-square w-12 items-center justify-center rounded-full bg-gradient-to-b from-purple-400 to-purple-500 shadow-lg">
                      <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </span>
                  </div>
                </div>
                <p className="mb-7.5 text-base text-gray-600">Send instant peer to peer text messages and alerts to keep supporters engaged</p>
              </div>
              <a className="flex h-12 w-full items-center justify-center gap-1.5 rounded-lg bg-purple-50 text-sm font-medium text-purple-600 duration-200 group-hover:bg-purple-600 group-hover:text-white hover:!bg-purple-700" href="#">
                Explore Now
                <svg className="h-5 w-5" viewBox="0 0 21 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M7.79167 15.8335L13 10.6252L7.79167 5.41683" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Web/Website Channel Card */}
          <div className="@container group relative rounded-3xl border border-gray-200 bg-white duration-200 hover:border-blue-200">
            <div className="py-8 px-5 @xs:px-8 mx-auto flex h-full w-full max-w-[280px] flex-col justify-between text-center">
              <div className="flex-1">
                <h3 className="mb-7.5 text-xl font-semibold text-gray-900">Phone Calls</h3>
                <div className="inline-flex cursor-pointer items-center justify-center rounded-full border-[14px] border-gray-50 bg-gray-50">
                  <div className="inline-flex items-center justify-center gap-3 rounded-full border-[6px] border-gray-100 bg-white p-2.5">
                    <span className="flex aspect-square w-12 items-center justify-center rounded-full bg-gradient-to-b from-orange-500 to-orange-600 shadow-lg">
                      <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </span>
                    <span>
                      <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </span>
                    <span className="flex aspect-square w-12 items-center justify-center rounded-full bg-gradient-to-b from-orange-400 to-orange-500 shadow-lg">
                      <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </span>
                  </div>
                </div>
                <p className="mb-7.5 text-base text-gray-600">Make personal peer to peer phone calls and voice messages to connect directly with supporters</p>
              </div>
              <a className="flex h-12 w-full items-center justify-center gap-1.5 rounded-lg bg-orange-50 text-sm font-medium text-orange-600 duration-200 group-hover:bg-orange-600 group-hover:text-white hover:!bg-orange-700" href="#">
                Explore Now
                <svg className="h-5 w-5" viewBox="0 0 21 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M7.79167 15.8335L13 10.6252L7.79167 5.41683" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Traditional Mail Channel Card */}
          <div className="@container group relative rounded-3xl border border-gray-200 bg-white duration-200 hover:border-blue-200">
            <div className="py-8 px-5 @xs:px-8 mx-auto flex h-full w-full max-w-[280px] flex-col justify-between text-center">
              <div className="flex-1">
                <h3 className="mb-7.5 text-xl font-semibold text-gray-900">Traditional Mail</h3>
                <div className="inline-flex cursor-pointer items-center justify-center rounded-full border-[14px] border-gray-50 bg-gray-50">
                  <div className="inline-flex items-center justify-center gap-3 rounded-full border-[6px] border-gray-100 bg-white p-2.5">
                    <span className="flex aspect-square w-12 items-center justify-center rounded-full bg-gradient-to-b from-red-500 to-red-600 shadow-lg">
                      <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </span>
                    <span>
                      <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </span>
                    <span className="flex aspect-square w-12 items-center justify-center rounded-full bg-gradient-to-b from-red-400 to-red-500 shadow-lg">
                      <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </span>
                  </div>
                </div>
                <p className="mb-7.5 text-base text-gray-600">Send physical mail, postcards, and printed materials to reach supporters offline</p>
              </div>
              <a className="flex h-12 w-full items-center justify-center gap-1.5 rounded-lg bg-red-50 text-sm font-medium text-red-600 duration-200 group-hover:bg-red-600 group-hover:text-white hover:!bg-red-700" href="#">
                Explore Now
                <svg className="h-5 w-5" viewBox="0 0 21 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M7.79167 15.8335L13 10.6252L7.79167 5.41683" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
