"use client";

import React, { useCallback, useEffect, useState } from "react";
import { platformStatus, type PublicStatus, type PublicServiceStatus } from "@uprise/api-client";

/**
 * Public status page.
 *
 * The customer-facing twin of the admin's `/status`, and deliberately a different payload rather
 * than the same one filtered in the browser: `GET /platform-status/public` is assembled on the
 * server from the same health snapshot, then stripped to named services, one word each and a
 * version string. No commit sha, no project name, no origin, no provider state — none of it is on
 * the wire, so none of it is in a network tab.
 *
 * The version is a MOCK (see PLATFORM_VERSION in the API). The product does not version its
 * releases; this page shows one because a status page without a version reads unfinished, and the
 * honest alternative — the deploy sha — is exactly what this endpoint exists to withhold.
 */

const TONE: Record<PublicServiceStatus, { dot: string; text: string }> = {
  Operational: { dot: "bg-success-500", text: "text-gray-600" },
  Degraded: { dot: "bg-amber-500", text: "text-amber-700" },
  Outage: { dot: "bg-error-500", text: "text-error-500" },
};

function checkedAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(mins) || mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export default function StatusPage() {
  const [data, setData] = useState<PublicStatus | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const res = await platformStatus.publicStatus();
    if (res.ok) {
      setData(res.data);
      setFailed(false);
    } else {
      // If the status endpoint itself cannot be reached, say so plainly. A status page that
      // renders green because its own fetch failed is worse than one that admits it is blind.
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    // Re-check while the page sits open — a status page is something people leave on a screen.
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <main>
      <section className="pb-20 pt-17.5">
        <div className="container">
          <div className="mx-auto w-full max-w-[720px] pt-17.5">
            <div className="mb-10 flex items-baseline justify-between gap-4">
              <h1 className="text-3xl font-bold !leading-[1.2] text-title-color md:text-[40px]">
                Uprise status
              </h1>
              {data ? (
                <span className="font-mono text-sm text-text-color-secondary">{data.version}</span>
              ) : null}
            </div>

            {failed && !data ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <p className="text-base text-text-color">
                  We can&apos;t reach the status service right now, so we can&apos;t tell you
                  whether everything is running. That is itself worth knowing.
                </p>
              </div>
            ) : !data ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <p className="text-base text-text-color-secondary">Checking…</p>
              </div>
            ) : (
              <>
                <div
                  className={`mb-6 rounded-2xl border p-5 ${
                    data.ok ? "border-success-500/30 bg-success-50" : "border-amber-500/30 bg-amber-50"
                  }`}
                >
                  <p className="flex items-center gap-2.5 text-lg font-semibold text-title-color">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${data.ok ? "bg-success-500" : "bg-amber-500"}`}
                      aria-hidden
                    />
                    {data.summary}
                  </p>
                </div>

                <ul className="divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
                  {data.services.map((service) => {
                    const tone = TONE[service.status];
                    return (
                      <li
                        key={service.key}
                        className="flex items-center justify-between gap-4 px-5 py-4"
                      >
                        <span className="text-base font-medium text-title-color">{service.name}</span>
                        <span className={`flex items-center gap-2 text-sm ${tone.text}`}>
                          <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden />
                          {service.status}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <p className="mt-4 text-sm text-text-color-secondary">
                  Checked {checkedAgo(data.at)}. This page refreshes itself every minute.
                </p>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
