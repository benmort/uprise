// Shared content types for the Uprise Labs organisation site.
// Source of truth: the design prototype in docs/design_handoff_uprise_labs/.

export type ProjectTag = "Platform" | "Campaigns" | "Fundraising" | "Organising" | "Advocacy";

export interface Project {
  slug: string;
  name: string;
  blurb: string;
  tag: ProjectTag;
  year: string;
}

export interface CaseDetail {
  meta: string;
  title: string;
  heroCaption: string;
  client: string;
  services: string;
  timeline: string;
  team: string;
  lede: string;
  body: string[];
  results: Array<{ value: string; label: string }>;
  gallery: string[];
  /** Real screenshot for the hero slot (public path); falls back to the placeholder. */
  heroImage?: string;
  /** Real screenshots aligned index-for-index with `gallery` (null → keep placeholder). */
  galleryImages?: Array<string | null>;
  stack: string[];
  quote: { text: string; attribution: string };
}

export interface Service {
  no: string;
  slug: string;
  title: string;
  desc: string;
  long: string;
  tags: string[];
  /** Kept in the catalogue but hidden from every listing/nav (and its detail
   *  page 404s). Flip off to restore — nothing about the service is deleted. */
  hidden?: boolean;
}

export interface ServiceDetail {
  lede: string;
  heroCaption: string;
  deliverables: string[];
  body: string[];
  steps: Array<{ no: string; title: string; desc: string }>;
  cta: { heading: string; button: string };
}

export type PostBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "quote"; text: string };

export interface Post {
  slug: string;
  tag: string;
  date: string;
  readMins: number;
  title: string;
  excerpt: string;
  author: { name: string; role: string };
  body: PostBlock[];
}

export interface Faq {
  q: string;
  a: string;
}

export interface TeamMember {
  name: string;
  role: string;
}

export interface Testimonial {
  quote: string;
  name: string;
  org: string;
}

export interface DocsGroup {
  label: string;
  items: string[];
}

export interface Stat {
  value: string;
  label: string;
}

export interface ValueItem {
  no: string;
  title: string;
  desc: string;
}

export interface ProcessStep {
  no: string;
  title: string;
  desc: string;
}
