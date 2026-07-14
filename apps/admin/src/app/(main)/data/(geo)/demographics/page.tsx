// Inert route marker: the whole Demographics surface (choropleth map + panel) is rendered by the
// persistent (geo) layout via <GeoSurface>, keyed off the pathname. This segment exists only to
// stay bookmarkable + prefetchable and to satisfy kindFromPathname.
export default function DemographicsPage() {
  return null;
}
