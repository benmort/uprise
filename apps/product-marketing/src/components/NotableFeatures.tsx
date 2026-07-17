import React from "react";
import {
  MessageSquare,
  Phone,
  Map,
  Smartphone,
  GitBranch,
  Gauge,
  Users,
  MapPinned,
  UserPlus,
  Palette,
  ClipboardList,
  BarChart3,
} from "lucide-react";
import SectionHeading from "@/components/marketing/SectionHeading";
import NotableFeatureRow from "@/components/marketing/NotableFeatureRow";

/**
 * TailAdmin "Build … Effortlessly" alternating rows — the whole uprise toolkit
 * across five connected systems. Every claim maps to a shipped ability; media is
 * a real screenshot where one fits, else an honest abstract PreviewPanel.
 */
export default function NotableFeatures() {
  return (
    <section className="py-16 md:py-24 lg:py-30">
      <div className="container">
        <SectionHeading
          eyebrow="The whole toolkit"
          title="Everything your campaign runs on"
          subtitle="From the first text to the last door knocked – five connected systems, one platform."
        />

        <div className="mt-14 space-y-20 md:mt-16 lg:space-y-28">
          <NotableFeatureRow
            eyebrow="MULTICHANNEL OUTREACH"
            title="Reach every voter, on every channel you run"
            subFeatures={[
              {
                icon: MessageSquare,
                title: "P2P text messaging",
                description:
                  "A peer-to-peer SMS console with personalisation tags, a dual-channel live preview, proof sends and schedule-or-send – opt-outs checked automatically.",
              },
              {
                icon: Phone,
                title: "Browser calls + unified inbox",
                description:
                  "A WebRTC softphone that dials from your campaign's own number, plus a shared SMS and WhatsApp inbox the whole team claims from, live over SSE.",
              },
            ]}
            image={{
              src: "/images/marketing/dashboard-screenshot.png",
              alt: "The uprise outreach dashboard",
              width: 1491,
              height: 682,
            }}
          />

          <NotableFeatureRow
            eyebrow="FIELD CANVASSING"
            title="Run your whole field program from one place"
            reverse
            subFeatures={[
              {
                icon: Map,
                title: "Turf & optimised walk lists",
                description:
                  "Cut turf on a Mapbox map or from geographic areas with live address counts, then build optimised walk lists with real walking metrics – grouped, assigned, re-optimised on demand.",
              },
              {
                icon: Smartphone,
                title: "Offline canvasser app + live action room",
                description:
                  "An installable PWA that queues door knocks offline and flushes on reconnect, with on-device route optimisation and a live action room that broadcasts to every volunteer's phone.",
              },
            ]}
            image={{
              src: "/images/marketing/mobile-screenshot.png",
              alt: "The uprise offline canvasser app",
              width: 410,
              height: 554,
            }}
          />

          <NotableFeatureRow
            eyebrow="ENGAGEMENT CONTENT"
            title="Turn conversations into data you can act on"
            subFeatures={[
              {
                icon: GitBranch,
                title: "Branching surveys & scripts",
                description:
                  "Build surveys with per-option skip logic and terminal branches that work on the doors and over SMS, backed by step-based scripts for every channel.",
              },
              {
                icon: Gauge,
                title: "Dispositions, 5-point scoring & canned replies",
                description:
                  "Map custom outcome codes to a 5-point support scale, and fire canned replies automatically on the first inbound reply from an org-wide or personal library.",
              },
            ]}
            preview={{
              tone: "violet",
              icon: ClipboardList,
              label: "Branching survey builder",
              chips: ["Skip logic", "Door + SMS", "Auto canned-reply", "Disposition mapping"],
            }}
          />

          <NotableFeatureRow
            eyebrow="AUDIENCE, DATA & INSIGHTS"
            title="Know your electorate"
            reverse
            subFeatures={[
              {
                icon: Users,
                title: "Audiences, imports & Action Network sync",
                description:
                  "Build audiences and segments, upload CSVs with live import progress, target by channel, and connect Action Network for two-way list sync.",
              },
              {
                icon: MapPinned,
                title: "Australian data & electorate polling",
                description:
                  "G-NAF addresses, ASGS geography, federal, state and local divisions, politicians and policies built in – plus electorate polling with crosstabs and choropleth maps.",
              },
            ]}
            preview={{
              tone: "green",
              icon: BarChart3,
              label: "Electorate insights",
              chips: ["G-NAF addresses", "Electoral divisions", "Choropleth polling", "Crosstabs"],
            }}
          />

          <NotableFeatureRow
            eyebrow="TEAMS & WHITE-LABEL"
            title="Built for teams – and for many brands"
            subFeatures={[
              {
                icon: UserPlus,
                title: "Roles, invitations & approvals",
                description:
                  "Role-based team access with invitations and join-request approvals, per-plan feature flags and a getting-started checklist for every new organiser.",
              },
              {
                icon: Palette,
                title: "White-label multi-brand portals",
                description:
                  "Run many campaigns and brands from one account, each an isolated white-label portal at your own slug with its own logo, colours and CSS.",
              },
            ]}
            preview={{
              tone: "amber",
              icon: Palette,
              label: "White-label workspace",
              chips: [
                "yourname.uprise.org.au",
                "Your logo & colours",
                "Isolated data",
                "Per-plan features",
              ],
            }}
          />
        </div>
      </div>
    </section>
  );
}
