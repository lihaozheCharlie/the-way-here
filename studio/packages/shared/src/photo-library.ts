/** Device Photos access is separate from importing evidence into a knowledge base. */
export type PhotoLibraryAuthorization = "notDetermined" | "authorized" | "denied" | "restricted";
export interface PhotoLibrarySearchInput {
  query: string;
  dateBasis?: "taken" | "added";
  place?: string;
  radiusKm?: number;
  albumId?: string;
  favoritesOnly?: boolean;
  photoType?: "all" | "live" | "screenshot" | "panorama" | "portrait" | "raw" | "burst";
  from?: string;
  through?: string;
  cursor?: string;
}
export interface PhotoLibraryFilters {
  albums: { id: string; title: string }[];
  supportsAddedDate: boolean;
}
export interface LibraryPhoto {
  id: string;
  name: string;
  createdAt?: string;
  hasLocation: boolean;
  width: number;
  height: number;
}
export interface PhotoLibrarySearchResult {
  photos: LibraryPhoto[];
  nextCursor?: string;
  summary: string;
  place?: { name: string; latitude: number; longitude: number; radiusKm: number };
}
export interface PhotoLibraryImage { dataUrl?: string; cloudOnly: boolean }
