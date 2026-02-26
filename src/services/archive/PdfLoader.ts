import * as pdfjsLib from 'pdfjs-dist';
import type { MangaFile } from '../../types';

// PDF.js worker config using CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.mjs`;

export class PdfLoader {
    private pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
    private fileName: string = '';

    constructor() { }

    /**
     * Loads a PDF file and prepares it for reading.
     * @param file The file object (Blob/File)
     * @returns Metadata about the loaded document
     */
    async loadFile(file: Blob): Promise<MangaFile> {
        try {
            this.fileName = (file as File).name || 'unknown.pdf';
            const arrayBuffer = await file.arrayBuffer();

            this.pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

            const totalPages = this.pdfDoc.numPages;
            if (totalPages === 0) {
                throw new Error('No pages found in the PDF.');
            }

            // Dummy page names for compatibility
            const pages = Array.from({ length: totalPages }).map((_, i) => `Page_${i + 1}`);

            return {
                fileName: this.fileName,
                totalPages,
                pages,
            };
        } catch (error) {
            console.error('Failed to load PDF file:', error);
            throw error;
        }
    }

    /**
     * Extracts a specific page as a Blob URL by rendering it to a Canvas.
     * @param index Page index (0-based)
     * @returns Promise resolving to the Blob URL
     */
    async getPage(index: number): Promise<string> {
        if (!this.pdfDoc) {
            throw new Error(`PDF not loaded.`);
        }

        const pageNum = index + 1; // pdf.js uses 1-based index
        if (pageNum < 1 || pageNum > this.pdfDoc.numPages) {
            throw new Error(`Page ${index} not found.`);
        }

        const page = await this.pdfDoc.getPage(pageNum);

        // Use a reasonable scale for mobile & desktop (e.g., 2.0 for higher DPI)
        const scale = 2.0;
        const viewport = page.getViewport({ scale });

        // Create canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Failed to create canvas context.');
        }

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Render PDF page into canvas context
        const renderContext: any = {
            canvasContext: context,
            viewport: viewport,
        };

        await page.render(renderContext).promise;

        // Convert canvas to blob
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(URL.createObjectURL(blob));
                } else {
                    reject(new Error('Canvas to Blob failed'));
                }
            }, 'image/jpeg', 0.9);
        });
    }

    /**
     * Clean up resources
     */
    unload() {
        if (this.pdfDoc) {
            this.pdfDoc.destroy();
            this.pdfDoc = null;
        }
    }
}

export const pdfLoader = new PdfLoader();
