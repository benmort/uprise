// Re-export shim: the contact API client now lives in @uprise/field (shared by
// apps/field + apps/admin so the canvass surface isn't duplicated). Organiser pages
// keep importing from "@/lib/api/contacts".
export * from "@uprise/field/api/contacts";
