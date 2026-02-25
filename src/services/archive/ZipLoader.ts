import JSZip from 'jszip';
import type { MangaFile } from '../../types';

export class ZipLoader {
    private zip: JSZip | null = null;
    private imageEntries: JSZip.JSZipObject[] = [];

    constructor() { }

    /**
     * Loads a ZIP/CBZ file and prepares it for reading.
     * @param file The file object (Blob/File)
     * @returns Metadata about the loaded manga
     */
    async loadFile(file: Blob): Promise<MangaFile> {
        try {
            this.zip = await JSZip.loadAsync(file);

            // Filter for image files
            const entries = Object.values(this.zip.files).filter(entry => {
                return !entry.dir && /\.(jpg|jpeg|png|gif|webp)$/i.test(entry.name);
            });

            // Sort naturally (e.g., 1.jpg, 2.jpg, 10.jpg)
            this.imageEntries = entries.sort((a, b) => {
                return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            });

            if (this.imageEntries.length === 0) {
                throw new Error('No images found in the archive.');
            }

            return {
                fileName: (file as File).name || 'unknown.zip',
                totalPages: this.imageEntries.length,
                pages: this.imageEntries.map(e => e.name),
            };
        } catch (error) {
            console.error('Failed to load ZIP file:', error);
            throw error;
        }
    }

    /**
     * Extracts a specific page as a Blob URL.
     * @param index Page index (0-based)
     * @returns Promise resolving to the Blob URL
     */
    async getPage(index: number): Promise<string> {
        if (!this.zip || !this.imageEntries[index]) {
            throw new Error(`Page ${index} not found or ZIP not loaded.`);
        }

        const entry = this.imageEntries[index];
        const blob = await entry.async('blob');
        return URL.createObjectURL(blob);
    }

    /**
     * Clean up resources if necessary.
     * Note: Revoking object URLs is handled by the consumer (React component/store).
     */
    unload() {
        this.zip = null;
        this.imageEntries = [];
    }
}

export const zipLoader = new ZipLoader();
