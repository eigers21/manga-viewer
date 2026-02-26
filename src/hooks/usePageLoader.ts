import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { fileLoader } from '../services/archive/FileLoader';
import { cacheService } from '../services/cache/CacheService';

const BASE_PREFETCH_RANGE = 2; // 先読み/後読みページ数
const BASE_CLEANUP_DISTANCE = 5; // メモリに保持する距離

export const usePageLoader = () => {
    const { file, currentPageIndex, pageUrls, setPageUrl, cleanupOldPages, currentFileId, viewMode } = useStore();

    useEffect(() => {
        if (!file) return;

        const loadPage = async (index: number) => {
            if (index < 0 || index >= file.totalPages) return;
            if (pageUrls[index]) return; // 読み込み済み

            try {
                // まずキャッシュを確認
                if (currentFileId) {
                    const cached = await cacheService.getPage(currentFileId, index);
                    if (cached) {
                        const url = URL.createObjectURL(cached);
                        setPageUrl(index, url);
                        return;
                    }
                }

                // キャッシュになければFileLoaderから展開
                const url = await fileLoader.getPage(index);
                setPageUrl(index, url);

                // キャッシュに保存（バックグラウンド）
                if (currentFileId) {
                    // BlobURLからBlobを取得してキャッシュ
                    try {
                        const res = await fetch(url);
                        const blob = await res.blob();
                        await cacheService.savePage(currentFileId, index, blob);
                    } catch {
                        // キャッシュ保存失敗は無視（表示には影響しない）
                    }
                }
            } catch (error) {
                console.error(`ページ ${index} の読み込み失敗`, error);
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
