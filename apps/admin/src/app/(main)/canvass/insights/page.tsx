// Campaign-less "All campaigns" insights. Same component as the scoped route — with no
// [campaignId] param, useParams() yields undefined and it fetches the tenant-wide aggregate
// (Results + Data quality; Goals is per-campaign and hidden here).
export { default } from "../[campaignId]/insights/page";
