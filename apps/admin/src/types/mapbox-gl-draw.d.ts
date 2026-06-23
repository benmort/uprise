// Minimal typings for @mapbox/mapbox-gl-draw — the package ships no types and we
// only use the constructor + the draw control's getAll/deleteAll surface.
declare module "@mapbox/mapbox-gl-draw" {
  interface MapboxDrawOptions {
    displayControlsDefault?: boolean;
    controls?: Partial<{
      point: boolean;
      line_string: boolean;
      polygon: boolean;
      trash: boolean;
      combine_features: boolean;
      uncombine_features: boolean;
    }>;
    defaultMode?: string;
  }

  export default class MapboxDraw {
    constructor(options?: MapboxDrawOptions);
    add(geojson: unknown): string[];
    getAll(): GeoJSON.FeatureCollection;
    deleteAll(): this;
    delete(ids: string | string[]): this;
    onAdd(map: unknown): HTMLElement;
    onRemove(map: unknown): void;
  }
}
