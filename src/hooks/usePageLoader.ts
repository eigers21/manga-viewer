import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { zipLoader } from '../services/archive/ZipLoader';

const PREFETCH_RANGE = 2; // Number of pages to look ahead/behind
const CLEANUP_DISTANCE = 5; // Distance to keep pages in memory

export const usePageLoader = () => {
    const { file, currentPageIndex, pageUrls, setPageUrl, cleanupOldPages } = useStore();

    useEffect(() => {
        if (!file) return;

        const loadPage = async (index: number) => {
            if (index < 0 || index >= file.totalPages) return;
            if (pageUrls[index]) return; // Already loaded

            try {
                // Mark as loading? We don't have per-page loading state, but we check existence.
                // To avoid double loading, we could check a "loadingPages" set, 
                // but for now simple check is fine.
                const url = await zipLoader.getPage(index);

                // Check if we still need it (user might have navigated away far)
                // But since we are saving to store, it's fine.
                setPageUrl(index, url);
            } catch (error) {
                console.error(`Failed to load page ${index}`, error);
            }
        };

        // 1. Load current page
        loadPage(currentPageIndex);

        // 2. Pre-fetch neighbors
        for (let i = 1; i <= PREFETCH_RANGE; i++) {
            loadPage(currentPageIndex + i);
            loadPage(currentPageIndex - i);
        }

        // 3. Cleanup old pages
        cleanupOldPages(currentPageIndex, CLEANUP_DISTANCE);

    }, [currentPageIndex, file, pageUrls, setPageUrl, cleanupOldPages]);
};
