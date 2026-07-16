// Campaign-less "All campaigns" shifts. Same component as the scoped route — with no
// [campaignId] param, useParams() yields undefined and it lists shifts across every campaign.
export { default } from "../[campaignId]/shifts/page";
