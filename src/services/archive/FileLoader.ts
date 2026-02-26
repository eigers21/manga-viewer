import type { MangaFile } from '../../types';
import { zipLoader } from './ZipLoader';
import { pdfLoader } from './PdfLoader';

class FileLoader {
    private currentLoader: 'zip' | 'pdf' | null = null;

    /**
     * Loads a file (ZIP/CBZ or PDF) and delegates to the appropriate loader.
     * @param file The file object (Blob/File)
     */
    async loadFile(file: Blob, fileName?: string): Promise<MangaFile> {
        const name = (file as File).name || fileName || '';
        const isPdf = name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

        if (isPdf) {
            this.currentLoader = 'pdf';
            return await pdfLoader.loadFile(file);
        } else {
            // Default to ZIP
            this.currentLoader = 'zip';
            return await zipLoader.loadFile(file);
        }
    }

    /**
     * Extracts a specific page as a Blob URL from the currently active loader.
     * @param index Page index (0-based)
     */
    async getPage(index: number): Promise<string> {
        if (this.currentLoader === 'pdf') {
            return await pdfLoader.getPage(index);
        } else if (this.currentLoader === 'zip') {
            return await zipLoader.getPage(index);
        }
        throw new Error('No file is currently loaded.');
    }

    /**
     * Clean up resources in the active loader.
     */
    unload() {
        if (this.currentLoader === 'pdf') {
            pdfLoader.unload();
        } else if (this.currentLoader === 'zip') {
            zipLoader.unload();
        }
        this.currentLoader = null;
    }
}

export const fileLoader = new FileLoader();
