import type { ReactNode } from "react";
import { Skeleton } from "@/components/prog/ui/skeleton";
import type { PageTab } from "./sections";

/**
 * Per-tab loading skeletons for General settings. Each mirrors its tab's real shape
 * (card count, field grid, save bar) so the layout doesn't jump when the orgProfile /
 * tenant fetch resolves. Only the tabs that wait on that fetch have a skeleton here –
 * the self-contained tabs (Security, Compliance, Integrations, Alerts) render straight
 * away and show their own loading states, so they're intentionally absent.
 */

// Mirror FormField: a label above an h-11 input.
function Field({ className, labelWidth = "w-28" }: { className?: string; labelWidth?: string }) {
  return (
    <div className={className}>
      <Skeleton className={`mb-1.5 h-4 ${labelWidth}`} />
      <Skeleton className="h-11 w-full rounded-lg" />
    </div>
  );
}

// Mirror FormSectionCard: a header (title + optional description) over a padded body.
function Card({ desc = true, children }: { desc?: boolean; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 px-4 py-5 dark:border-gray-800 sm:px-6">
        <Skeleton className="h-6 w-44" />
        {desc ? <Skeleton className="mt-2 h-4 w-64" /> : null}
      </div>
      <div className="space-y-6 border-t border-gray-100 p-5 sm:p-6 dark:border-gray-800">{children}</div>
    </div>
  );
}

function TwoCol({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function SaveBar() {
  return (
    <div className="flex justify-end">
      <Skeleton className="h-10 w-24 rounded-lg" />
    </div>
  );
}

// Vary the label widths a little so a stack of fields doesn't read as one grey block.
const LABEL_WIDTHS = ["w-24", "w-32", "w-28", "w-36", "w-20", "w-28"];
function fields(n: number, offset = 0) {
  return Array.from({ length: n }, (_, i) => (
    <Field key={i} labelWidth={LABEL_WIDTHS[(i + offset) % LABEL_WIDTHS.length]} />
  ));
}

// Tenant: NetworkForm (3 fields) + tenant-identity card (2 fields) + save + Delete card.
function TenantSkeleton() {
  return (
    <>
      <Card>{fields(3)}</Card>
      <Card>{fields(2, 3)}</Card>
      <SaveBar />
      <Card desc={false}>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-10 w-40 rounded-lg" />
      </Card>
    </>
  );
}

// Organisation: name + bio card, then a 5-field social grid.
function OrganisationSkeleton() {
  return (
    <>
      <Card>
        <Field labelWidth="w-40" />
        <div>
          <Skeleton className="mb-1.5 h-4 w-16" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      </Card>
      <Card>
        <TwoCol>{fields(5)}</TwoCol>
      </Card>
      <SaveBar />
    </>
  );
}

// Branding: four image dropzones, two colour rows, one CSS textarea.
function BrandingSkeleton() {
  return (
    <>
      <Card>
        <div className="grid gap-6 sm:grid-cols-2">
          {["h-40", "h-24", "h-28", "h-40"].map((h, i) => (
            <div key={i}>
              <Skeleton className="mb-1.5 h-4 w-28" />
              <Skeleton className={`w-full rounded-lg ${h}`} />
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <TwoCol>
          {[0, 1].map((i) => (
            <div key={i} className="flex items-end gap-3">
              <Skeleton className="h-10 w-14 rounded" />
              <Field className="flex-1" />
            </div>
          ))}
        </TwoCol>
      </Card>
      <Card>
        <div>
          <Skeleton className="mb-1.5 h-4 w-24" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </Card>
      <SaveBar />
    </>
  );
}

// Business & Legal: legal name, an identifier grid, then registration fields.
function BusinessSkeleton() {
  return (
    <>
      <Card>
        <Field labelWidth="w-40" />
        <TwoCol>{fields(4)}</TwoCol>
        <Field labelWidth="w-48" />
      </Card>
      <SaveBar />
    </>
  );
}

// Contacts: an outer card wrapping a single contact card (name/email/phone/role).
function ContactsSkeleton() {
  return (
    <>
      <Card>
        <div className="space-y-5 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
          <TwoCol>{fields(2)}</TwoCol>
          <Field labelWidth="w-20" />
          <TwoCol>{fields(2, 2)}</TwoCol>
          <TwoCol>{fields(2, 4)}</TwoCol>
        </div>
      </Card>
      <SaveBar />
    </>
  );
}

// Addresses: registered + billing, each with the same address block.
function AddressesSkeleton() {
  const block = (
    <>
      <Field labelWidth="w-32" />
      <Field labelWidth="w-32" />
      <TwoCol>{fields(2)}</TwoCol>
      <TwoCol>{fields(2, 2)}</TwoCol>
    </>
  );
  return (
    <>
      <Card>{block}</Card>
      <Card>{block}</Card>
      <SaveBar />
    </>
  );
}

// Access: the access-control card (role, expiry, limits).
function AccessSkeleton() {
  return (
    <>
      <Card>
        <TwoCol>{fields(2)}</TwoCol>
        {fields(2, 2)}
      </Card>
      <SaveBar />
    </>
  );
}

// Feature Flags / Queue & Redis: a Card with a title, subtitle and a few rows.
function LockedSkeleton() {
  return (
    <div className="rounded-xl border border-border p-5">
      <Skeleton className="h-5 w-56" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-5 space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function body(tab: PageTab): ReactNode {
  switch (tab) {
    case "tenant":
      return <TenantSkeleton />;
    case "organisation":
      return <OrganisationSkeleton />;
    case "branding":
      return <BrandingSkeleton />;
    case "business":
      return <BusinessSkeleton />;
    case "contacts":
      return <ContactsSkeleton />;
    case "addresses":
      return <AddressesSkeleton />;
    case "access":
      return <AccessSkeleton />;
    case "flags":
    case "queue":
      return <LockedSkeleton />;
    default:
      // Self-contained tabs render their own loading; this is a safe generic fallback.
      return <Card>{fields(3)}</Card>;
  }
}

export function SettingsTabSkeleton({ tab }: { tab: PageTab }) {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Loading settings">
      {body(tab)}
    </div>
  );
}
