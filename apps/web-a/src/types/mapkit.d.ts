// Shared MapKit type definitions

export interface MapKitCoordinate {
  latitude: number;
  longitude: number;
}

export interface MapKitCoordinateRegion {
  center: MapKitCoordinate;
  span: MapKitCoordinateSpan;
}

export interface MapKitCoordinateSpan {
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface MapKitGeocoderResult {
  coordinate: MapKitCoordinate;
  formattedAddress?: string;
}

export interface MapKitGeocoderResponse {
  results: MapKitGeocoderResult[];
}

export interface MapKitMap {
  region: MapKitCoordinateRegion;
  colorScheme: string;
  showItems: (items: MapKitAnnotation[], options?: { animate?: boolean; padding?: { top: number; right: number; bottom: number; left: number } }) => void;
  addAnnotation: (annotation: MapKitAnnotation) => void;
  removeAnnotations: (annotations: MapKitAnnotation[]) => void;
  annotations: MapKitAnnotation[];
  destroy: () => void;
  addEventListener: (event: string, callback: () => void) => void;
}

export interface MapKitAnnotation {
  coordinate: MapKitCoordinate;
  color?: string;
  glyphColor?: string;
  title?: string;
  subtitle?: string;
  data?: { eventId: number };
  addEventListener: (event: string, callback: () => void) => void;
}

export interface MapKitGeocoder {
  lookup: (
    query: string,
    callback: (error: Error | null, data: MapKitGeocoderResponse | null) => void
  ) => void;
}

export interface MapKitInitOptions {
  authorizationCallback: (done: (token: string) => void) => void;
}

export interface MapKitMapOptions {
  colorScheme?: string;
  showsCompass?: string;
  showsScale?: string;
  showsZoomControl?: boolean;
  showsMapTypeControl?: boolean;
}

export interface MapKitStatic {
  init: (options: MapKitInitOptions) => void;
  Map: {
    new (container: HTMLElement, options?: MapKitMapOptions): MapKitMap;
    ColorSchemes: {
      Light: string;
      Dark: string;
    };
  };
  Coordinate: {
    new (latitude: number, longitude: number): MapKitCoordinate;
  };
  CoordinateRegion: {
    new (center: MapKitCoordinate, span: MapKitCoordinateSpan): MapKitCoordinateRegion;
  };
  CoordinateSpan: {
    new (latitudeDelta: number, longitudeDelta: number): MapKitCoordinateSpan;
  };
  MarkerAnnotation: {
    new (coordinate: MapKitCoordinate, options?: { color?: string; glyphColor?: string; title?: string; subtitle?: string }): MapKitAnnotation;
  };
  Geocoder: {
    new (): MapKitGeocoder;
  };
  FeatureVisibility: {
    Hidden: string;
    Visible: string;
  };
}

declare global {
  interface Window {
    mapkit?: MapKitStatic;
  }
}
