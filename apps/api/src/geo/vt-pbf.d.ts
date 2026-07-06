// vt-pbf ships no type declarations. Minimal shim for the bits we use: encoding a
// geojson-vt tile object into Mapbox Vector Tile protobuf bytes.
declare module "vt-pbf" {
  export function fromGeojsonVt(
    layers: Record<string, { features: unknown[] } | null>,
    options?: { version?: number },
  ): Uint8Array;
  export function fromVectorTileJs(tile: unknown): Uint8Array;
  export const GeoJSONWrapper: unknown;
}
