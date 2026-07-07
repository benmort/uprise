// Inert route marker: the whole Addresses surface (map + panel) is rendered by the
// persistent (geo) layout via <GeoSurface>, keyed off the pathname. This segment
// exists only to stay bookmarkable + prefetchable and to satisfy kindFromPathname.
export default function AddressesPage() {
  return null;
}
