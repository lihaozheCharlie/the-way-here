/** Device Photos access is separate from importing evidence into a knowledge base. */
export type PhotoLibraryAuthorization = "notDetermined" | "authorized" | "denied" | "restricted";
export interface PhotoLibrarySearchInput {
  query: string;
  kind: "text" | "place";
  from?: string;
  through?: string;
  cursor?: string;
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
