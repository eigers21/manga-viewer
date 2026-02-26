import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { fileLoader } from '../services/archive/FileLoader';

const BASE_PREFETCH_RANGE = 2; // 先読み/後読みページ数
const BASE_CLEANUP_DISTANCE = 5; // メモリに保持する距離

export const usePageLoader = () => {
    const { file, currentPageIndex, pageUrls, setPageUrl, cleanupOldPages, currentFileId, viewMode } = useStore();
    const fetchingPages = useRef<Set<number>>(new Set());

    useEffect(() => {
        if (!file) {
            fetchingPages.current.clear();
            return;
        }

        const loadPage = async (index: number) => {
            if (index < 0 || index >= file.totalPages) return;
            // すでに読み込み済み、または現在取得中の場合は重複してフェッチしない
            if (pageUrls[index] || fetchingPages.current.has(index)) return;

            fetchingPages.current.add(index);
            try {
                const url = await fileLoader.getPage(index);
                setPageUrl(index, url);
            } catch (error) {
                console.error(`ページ ${index} の読み込み失敗`, error);
            } finally {
                fetchingPages.current.delete(index);
            }
        };

        // モードごとに先読みとクリーンアップの距離を調整（縦読み時は一度に見える要素が増えるため余裕を持たす）
        const prefetchRange = viewMode === 'vertical' ? BASE_PREFETCH_RANGE * 2 : BASE_PREFETCH_RANGE;
        const cleanupDistance = viewMode === 'vertical' ? BASE_CLEANUP_DISTANCE * 2 : BASE_CLEANUP_DISTANCE;

        // 1. 現在のページを読み込み
        loadPage(currentPageIndex);

        // 2. 周辺ページを先読み
        for (let i = 1; i <= prefetchRange; i++) {
            loadPage(currentPageIndex + i);
            loadPage(currentPageIndex - i);
        }

        // 3. 遠いページをメモリから解放
        cleanupOldPages(currentPageIndex, cleanupDistance);

    }, [currentPageIndex, file, pageUrls, setPageUrl, cleanupOldPages, currentFileId, viewMode]);
};
