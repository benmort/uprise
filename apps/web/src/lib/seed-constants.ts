// Web-safe mirror of the canonical example literals owned by the API shared seed
// (apps/api/src/shared-seed/seed-data.ts). The web bundle can't import apps/api,
// so these are kept in sync by hand — the tour and the demo seeder therefore
// create the SAME named example entities.

export const DEFAULT_TOUR_TEMPLATE =
  "Hi {{first_name}}! We're building our volunteer team in {{city}} and would love your help at an upcoming community action. Reply YES to join or STOP to opt out.";

export const EXAMPLE_AUDIENCE_NAME = "Tour Example Audience";
export const EXAMPLE_BLAST_TITLE = "Tour Example Blast";
