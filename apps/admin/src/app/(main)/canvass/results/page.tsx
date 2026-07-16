// Campaign-less "All campaigns" results. Same component as the scoped route — with no
// [campaignId] param, useParams() yields undefined and it fetches the tenant-wide aggregate.
export { default } from "../[campaignId]/results/page";
