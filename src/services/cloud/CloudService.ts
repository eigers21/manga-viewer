import type { LibraryItem } from '../../types';

/** ダウンロード進捗コールバック */
export type ProgressCallback = (loaded: number, total: number) => void;

export interface CloudService {
    providerName: 'google-drive' | 'box';

    login(): Promise<void>;
    handleCallback(code: string): Promise<void>;
    listFiles(folderId?: string): Promise<LibraryItem[]>;
    downloadFile(fileId: string, onProgress?: ProgressCallback): Promise<Blob>;
    isAuthenticated(): boolean;
    logout(): Promise<void>;
}
