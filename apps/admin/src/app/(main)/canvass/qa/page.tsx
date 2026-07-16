// Campaign-less "All campaigns" QA review (read-only). Same component as the scoped route —
// with no [campaignId] param, useParams() yields undefined and it fetches the tenant-wide set.
export { default } from "../[campaignId]/qa/page";
