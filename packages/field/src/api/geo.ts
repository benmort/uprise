// Field-facing geo API — the sliver the shared door popover needs. Mirrors the
// admin geo API shape (apps/admin/src/lib/api/geo.ts); duplicated deliberately
// because the field package can't import from an app. Cookie-auth `request` from
// @uprise/api-client, same as the rest of the field API layer.
import { request } from "@uprise/api-client";

/** A containing region — one link in the address's containment tree (SA1–SA4, CED,
 *  SED lower/upper, LGA, ward, First Nations). `name` is resolved server-side. */
export type RegionKind =
  | "state"
  | "ced"
  | "sed"
  | "sed_lower"
  | "sed_upper"
  | "lga"
  | "ward"
  | "ireg"
  | "iare"
  | "iloc"
  | "sa4"
  | "sa3"
  | "sa2"
  | "sa1"
  | "mb";
export type RegionRef = { kind: RegionKind; code: string; name: string; addressCount?: number };

/** The nearest polling booth to an address. */
export type NearestPolling = {
  id: string;
  name: string | null;
  premises: string | null;
  address: string | null;
  divisionName: string | null;
  distanceM: number;
};

/** Everything about one G-NAF address: full detail, named containing regions, the
 *  linked contact id, and the nearest polling place. GET /geo/addresses/:gnafPid. */
export type AddressDetail = {
  gnafPid: string;
  address: string;
  lat: number | null;
  lng: number | null;
  state: string | null;
  street: string | null;
  locality: string | null;
  postcode: string | null;
  sa1Code: string | null;
  sa2Code: string | null;
  contactId: string | null;
  regions: RegionRef[];
  nearestPolling: NearestPolling | null;
};

/** Fetch one address's full detail — backs the door popover's regions + the detail page. */
export async function getAddressDetail(gnafPid: string) {
  return request<AddressDetail>(`/geo/addresses/${encodeURIComponent(gnafPid)}`);
}
