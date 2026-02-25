import type { LibraryItem } from '../../types';

export interface CloudService {
    providerName: 'google-drive' | 'box';

    login(): Promise<void>;
    handleCallback(code: string): Promise<void>;
    listFiles(folderId?: string): Promise<LibraryItem[]>;
    downloadFile(fileId: string): Promise<Blob>;
    isAuthenticated(): boolean;
    logout(): Promise<void>;
}
