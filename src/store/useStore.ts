import { create } from 'zustand';
import type { MangaFile } from '../types';
import { fileLoader } from '../services/archive/FileLoader';

interface ViewerState {
    file: MangaFile | null;
    currentPageIndex: number;
    isLoading: boolean;
    error: string | null;
    pageUrls: Record<number, string>;
    /** ダウンロード進捗（0〜100、-1は非表示） */
    downloadProgress: number;
    /** 現在開いているファイルのID（キャッシュ用） */
    currentFileId: string | null;
    /** 閲覧モード（縦・横） */
    viewMode: 'horizontal' | 'vertical';

    // Actions
    loadFile: (file: Blob, fileName?: string) => Promise<void>;
    closeFile: () => void;
    setPage: (index: number) => void;
    nextPage: () => void;
    prevPage: () => void;
    setPageUrl: (index: number, url: string) => void;
    cleanupOldPages: (currentIndex: number, distance: number) => void;
    setDownloadProgress: (progress: number) => void;
    setCurrentFileId: (id: string | null) => void;
    setViewMode: (mode: 'horizontal' | 'vertical') => void;
}

export const useStore = create<ViewerState>((set, get) => ({
    file: null,
    currentPageIndex: 0,
    isLoading: false,
    error: null,
    pageUrls: {},
    downloadProgress: -1,
    currentFileId: null,
    viewMode: (localStorage.getItem('viewer_viewMode') as 'horizontal' | 'vertical') || 'horizontal',

    loadFile: async (file: Blob, fileName?: string) => {
        // 古いURLを解放
        const { pageUrls, currentFileId } = get();
        Object.values(pageUrls).forEach(url => URL.revokeObjectURL(url));

        set({ isLoading: true, error: null, pageUrls: {} });
        try {
            const actualFileName = fileName || (file as File).name || currentFileId || undefined;
            const mangaFile = await fileLoader.loadFile(file, actualFileName);

            // 栞（しおり）機能：保存されたページインデックスを復元
            const fileKey = currentFileId || mangaFile.fileName;
            let savedIndex = 0;
            if (fileKey) {
                const stored = localStorage.getItem(`bookmark_${fileKey}`);
                if (stored) {
                    const parsed = parseInt(stored, 10);
                    if (!isNaN(parsed) && parsed >= 0 && parsed < mangaFile.totalPages) {
                        savedIndex = parsed;
                    }
                }
            }

            set({
                file: mangaFile,
                currentPageIndex: savedIndex,
                isLoading: false
            });
        } catch (err) {
            set({
                isLoading: false,
                error: (err as Error).message || 'Failed to load file'
            });
        }
    },

    closeFile: () => {
        const { pageUrls } = get();
        Object.values(pageUrls).forEach(url => URL.revokeObjectURL(url));

        fileLoader.unload();
        set({
            file: null,
            currentPageIndex: 0,
            error: null,
            pageUrls: {},
            downloadProgress: -1,
            currentFileId: null,
        });
    },

    setPage: (index: number) => {
        const { file, currentFileId } = get();
        if (!file) return;
        const newIndex = Math.max(0, Math.min(index, file.totalPages - 1));
        set({ currentPageIndex: newIndex });

        // 栞の保存
        const fileKey = currentFileId || file.fileName;
        if (fileKey) {
            localStorage.setItem(`bookmark_${fileKey}`, newIndex.toString());
        }
    },

    nextPage: () => {
        const { currentPageIndex, file, currentFileId } = get();
        if (file && currentPageIndex < file.totalPages - 1) {
            const newIndex = currentPageIndex + 1;
            set({ currentPageIndex: newIndex });

            // 栞の保存
            const fileKey = currentFileId || file.fileName;
            if (fileKey) {
                localStorage.setItem(`bookmark_${fileKey}`, newIndex.toString());
            }
        }
    },

    prevPage: () => {
        const { currentPageIndex, file, currentFileId } = get();
        if (currentPageIndex > 0) {
            const newIndex = currentPageIndex - 1;
            set({ currentPageIndex: newIndex });

            // 栞の保存
            const fileKey = currentFileId || file?.fileName;
            if (fileKey) {
                localStorage.setItem(`bookmark_${fileKey}`, newIndex.toString());
            }
        }
    },

    setPageUrl: (index: number, url: string) => {
        set(state => ({
            pageUrls: { ...state.pageUrls, [index]: url }
        }));
    },

    cleanupOldPages: (currentIndex: number, distance: number) => {
        set(state => {
            const newUrls = { ...state.pageUrls };
            let changed = false;
            Object.keys(newUrls).forEach(key => {
                const pageIdx = parseInt(key, 10);
                if (Math.abs(pageIdx - currentIndex) > distance) {
                    URL.revokeObjectURL(newUrls[pageIdx]);
                    delete newUrls[pageIdx];
                    changed = true;
                }
            });
            return changed ? { pageUrls: newUrls } : {};
        });
    },

    setDownloadProgress: (progress: number) => {
        set({ downloadProgress: progress });
    },

    setCurrentFileId: (id: string | null) => {
        set({ currentFileId: id });
    },

    setViewMode: (mode: 'horizontal' | 'vertical') => {
        set({ viewMode: mode });
        localStorage.setItem('viewer_viewMode', mode);
    },
}));
