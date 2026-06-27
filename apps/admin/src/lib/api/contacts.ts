import { request } from "@/lib/api";

export type SupportLevel =
  | "STRONG_SUPPORT"
  | "LEAN_SUPPORT"
  | "UNDECIDED"
  | "LEAN_OPPOSE"
  | "STRONG_OPPOSE";

export type TimelineEntry =
  | {
      id: string;
      kind: "text_in" | "text_out";
      at: string;
      body: string;
      from: string;
      to: string;
      blastId: string | null;
    }
  | {
      id: string;
      kind: "knock";
      at: string;
      dispositionCode: string | null;
      lat: number | null;
      lng: number | null;
      notes: string | null;
      safetyFlag: boolean | null;
      volunteer: { id: string; name: string } | null;
    };

export type ContactProfile = {
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string | null;
    phoneE164: string | null;
    email: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    turf: { id: string; name: string } | null;
    supportLevel: SupportLevel | null;
  };
  timeline: TimelineEntry[];
  dispositions: Array<{
    id: string;
    code: string;
    layer: string;
    channel: string;
    supportLevel: SupportLevel | null;
    at: string;
  }>;
  surveyResponses: Array<{
    id: string;
    questionId: string;
    prompt: string | null;
    optionLabel: string | null;
    supportLevel: SupportLevel | null;
    at: string;
  }>;
  audiences: Array<{ id: string; name: string }>;
  nextAction: { type: string; label: string } | null;
};

export type ContactSearchResult = {
  id: string;
  fullName: string | null;
  phoneE164: string | null;
  address: string | null;
};

export async function getContactProfile(id: string) {
  return request<ContactProfile>(`/contacts/${encodeURIComponent(id)}`);
}

export async function searchContacts(query: string) {
  const q = new URLSearchParams({ query });
  return request<ContactSearchResult[]>(`/contacts?${q}`);
}
