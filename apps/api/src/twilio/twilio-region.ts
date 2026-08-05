/**
 * Twilio home region → its default edge, mirroring the Node SDK's own
 * `BaseTwilio.regionToEdgeMap`.
 *
 * The SDK owns this mapping for the calls it makes, but it is not exported from the package
 * root and deep-importing an internal module would break on an SDK bump. uprise needs the
 * same rule in two places the SDK cannot help with: the ONE request that bypasses the SDK
 * entirely (the multipart supporting-document upload, which builds its own URL) and the
 * client options themselves, where passing a lone region makes the SDK re-derive and mutate
 * its own edge on every request, logging a deprecation warning each time.
 */
export const REGION_DEFAULT_EDGE: Readonly<Record<string, string>> = {
  au1: "sydney",
  br1: "sao-paulo",
  de1: "frankfurt",
  ie1: "dublin",
  jp1: "tokyo",
  jp2: "osaka",
  sg1: "singapore",
  us1: "ashburn",
  us2: "umatilla",
};

export type TwilioRegionOptions = { region: string; edge?: string };

/**
 * The Twilio client options for an account's region/edge – or `undefined` when the account
 * is not regional, in which case the SDK must be constructed with exactly the two arguments
 * it always took.
 *
 * The REGION is authoritative and an edge on its own is ignored: routing is
 * `<product>.<edge>.<region>.twilio.com`, so an edge with no region names no host uprise can
 * reason about, and the SDK would half-apply it. The edge is filled from the region's
 * default when absent so the pair is always complete – that is what the SDK would otherwise
 * do itself, noisily and repeatedly.
 */
export function twilioRegionOptions(
  region?: string | null,
  edge?: string | null,
): TwilioRegionOptions | undefined {
  const trimmedRegion = region?.trim();
  if (!trimmedRegion) return undefined;
  const trimmedEdge = edge?.trim() || REGION_DEFAULT_EDGE[trimmedRegion];
  return trimmedEdge ? { region: trimmedRegion, edge: trimmedEdge } : { region: trimmedRegion };
}
