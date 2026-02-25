import { create } from 'zustand';
import type { MangaFile } from '../types';
import { zipLoader } from '../services/archive/ZipLoader';

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

    // Actions
    loadFile: (file: Blob) => Promise<void>;
    closeFile: () => void;
    setPage: (index: number) => void;
    nextPage: () => void;
    prevPage: () => void;
    setPageUrl: (index: number, url: string) => void;
    cleanupOldPages: (currentIndex: number, distance: number) => void;
    setDownloadProgress: (progress: number) => void;
    setCurrentFileId: (id: string | null) => void;
}

export const useStore = create<ViewerState>((set, get) => ({
    file: null,
    currentPageIndex: 0,
    isLoading: false,
    error: null,
    pageUrls: {},
    downloadProgress: -1,
    currentFileId: null,

    loadFile: async (file: Blob) => {
        // 古いURLを解放
        const { pageUrls } = get();
        Object.values(pageUrls).forEach(url => URL.revokeObjectURL(url));

        set({ isLoading: true, error: null, pageUrls: {} });
        try {
            const mangaFile = await zipLoader.loadFile(file);
            set({
                file: mangaFile,
                currentPageIndex: 0,
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

        zipLoader.unload();
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
        const { file } = get();
        if (!file) return;
        const newIndex = Math.max(0, Math.min(index, file.totalPages - 1));
        set({ currentPageIndex: newIndex });
    },

    nextPage: () => {
        const { currentPageIndex, file } = get();
        if (file && currentPageIndex < file.totalPages - 1) {
            set({ currentPageIndex: currentPageIndex + 1 });
        }
    },

    prevPage: () => {
        const { currentPageIndex } = get();
        if (currentPageIndex > 0) {
            set({ currentPageIndex: currentPageIndex - 1 });
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
}));
