export interface MangaPage {
  index: number;
  name: string;
  blobUrl?: string; // Loaded image URL
}

export interface MangaFile {
  fileName: string;
  totalPages: number;
  pages: string[]; // List of entry names in ZIP
}

export interface LibraryItem {
  id: string;
  name: string;
  source: 'local' | 'google-drive' | 'box';
  type?: 'file' | 'folder';
  thumbnailUrl?: string;
  addedAt: number;
}
