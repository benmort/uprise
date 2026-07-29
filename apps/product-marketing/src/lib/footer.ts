/**
 * Site footer content.
 *
 * This lives in `lib/` rather than in `components/homepage3/` because the footer is
 * now the SITE-WIDE footer (rendered by MarketingChrome on every route) as well as
 * homepage3's. The homepage3 folder is a candidate that gets deleted once a winner is
 * picked, so the global footer must not depend on anything inside it.
 */
export const FOOTER = {
  blurb:
    "Built for progressive organisations, nonprofits and changemakers who want to make a real impact.",
  /**
   * NOT an accreditation claim. The AEC is a data source for this platform (divisions,
   * polling places, referendum results), not an accreditor of campaigning software —
   * there is no scheme to be "approved" under, so this badge states independence.
   */
  notice: { title: "Independent", body: "Uprise is a non-partisan platform." },
  /**
   * `cols` is how many sub-columns the link list flows into. Resources carries 7 links
   * against 3 and 5 in its neighbours, so as a single list it runs about twice as long
   * as everything beside it and leaves the footer ragged.
   */
  columns: [
    {
      heading: "Resources",
      cols: 2,
      links: [
        { label: "Handbook", href: "/docs" },
        { label: "About us", href: "/about-us" },
        { label: "Blog", href: "/blog" },
        { label: "Plans", href: "/plans" },
        { label: "Campaigners", href: "/campaigners" },
        { label: "Integrations", href: "/integrations" },
        { label: "Developers", href: "/developers" },
      ],
    },
    {
      heading: "Community",
      cols: 1,
      links: [
        { label: "Support Centre", href: "/support-centre" },
        { label: "Contact us", href: "/contact-us" },
        { label: "Request a demo", href: "/request-demo" },
      ],
    },
    {
      heading: "Policies",
      cols: 1,
      links: [
        { label: "Terms of Service", href: "/terms-of-service" },
        { label: "Privacy Policy", href: "/privacy-policy" },
        { label: "Security", href: "/security" },
        { label: "Donations Policy", href: "/donations-policy" },
        { label: "Compliance", href: "/compliance" },
      ],
    },
  ],
  acknowledgement:
    "We pay respect to our elders and acknowledge the Traditional Owners who've cared for country since time immemorial. Sovereignty was never ceded — it always was, and always will be, Aboriginal land.",
} as const;
