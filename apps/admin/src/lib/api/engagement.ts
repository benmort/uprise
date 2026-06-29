// Re-export shim: the engagement API client now lives in @uprise/field (shared by
// apps/field + apps/admin so the canvass surface isn't duplicated). Organiser pages
// keep importing from "@/lib/api/engagement".
export * from "@uprise/field/api/engagement";
