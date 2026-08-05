"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  platformStatus,
  type PublicDay,
  type PublicIncident,
  type PublicStatus,
  type PublicServiceStatus,
} from "@uprise/api-client";

/**
 * Public status page.
 *
 * The customer-facing twin of the admin's `/status`, and deliberately a different payload rather
 * than the same one filtered in the browser: `GET /platform-status/public` is assembled on the
 * server from the same health snapshot, then stripped to named services, one word each, uptime
 * and past incidents. No commit sha, no project name, no origin, no provider state — none of it is
 * on the wire, so none of it is in a network tab.
 *
 * The history comes from checks a cron records every five minutes, so a day with no bar means
 * nobody was measuring, not that nothing happened. That distinction is the whole reason the
 * bar has a fourth state.
 */

const TONE: Record<PublicServiceStatus, { dot: string; text: string }> = {
  Operational: { dot: "bg-success-500", text: "text-gray-600" },
  Degraded: { dot: "bg-amber-500", text: "text-amber-700" },
  Outage: { dot: "bg-error-500", text: "text-error-500" },
  Unknown: { dot: "bg-gray-300", text: "text-gray-500" },
};

const DAY_TONE: Record<PublicDay["state"], string> = {
  up: "bg-success-500",
  partial: "bg-amber-500",
  down: "bg-error-500",
  none: "bg-gray-200",
};

function checkedAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(mins) || mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

/** "2h 15m" reads better than "135 minutes" for anything over an hour. */
function duration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function incidentDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function UptimeBar({ days }: { days: PublicDay[] }) {
  const measured = days.filter((d) => d.state !== "none").length;
  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-title-color">Last 90 days</span>
        <span className="text-xs text-text-color-secondary">
          {measured === 0 ? "No history recorded yet" : `${measured} days measured`}
        </span>
      </div>
      {/* One column per day, so the row scales down rather than wrapping into a second line. */}
      <div className="flex h-8 items-stretch gap-px" aria-hidden>
        {days.map((day) => (
          <div
            key={day.date}
            className={`flex-1 rounded-sm ${DAY_TONE[day.state]}`}
            title={`${day.date}: ${day.state === "none" ? "no data" : day.state}`}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-text-color-secondary">
        <span>90 days ago</span>
        <span>Today</span>
      </div>
    </div>
  );
}

function Incidents({ incidents }: { incidents: PublicIncident[] }) {
  return (
    <div className="mt-6">
      <h2 className="mb-3 text-lg font-semibold text-title-color">Recent incidents</h2>
      {incidents.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-text-color-secondary">
            No incidents recorded in the last 90 days.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
          {incidents.map((incident) => (
            <li key={incident.id} className="px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-base font-medium text-title-color">
                  {incident.serviceName} — {incident.status.toLowerCase()}
                </span>
                <span className="text-sm text-text-color-secondary">
                  {incidentDate(incident.startedAt)}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-text-color-secondary">
                {incident.resolvedAt
                  ? `Resolved after ${duration(incident.minutes)}.`
                  : `Ongoing — ${duration(incident.minutes)} so far.`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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
            <h1 className="mb-10 text-3xl font-bold !leading-[1.2] text-title-color md:text-[40px]">
              Uprise status
            </h1>

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
                        <span className="flex items-center gap-4">
                          {/* Uptime only appears once there is history to back it — an empty
                              window says "no data", never a flattering 100%. */}
                          <span className="text-sm tabular-nums text-text-color-secondary">
                            {service.uptime90d === null ? "—" : `${service.uptime90d}%`}
                          </span>
                          <span className={`flex items-center gap-2 text-sm ${tone.text}`}>
                            <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden />
                            {service.status}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <UptimeBar days={data.days} />
                <Incidents incidents={data.incidents} />

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
