import { get, set, del, keys } from 'idb-keyval';

// キャッシュ上限（バイト）
const CACHE_LIMIT_BYTES = 500 * 1024 * 1024; // 500MB

// メタデータのキー
const META_KEY = '__cache_meta__';

/** キャッシュされたファイルのメタデータ */
interface CachedFileMeta {
    fileId: string;
    fileName: string;
    totalPages: number;
    totalSize: number; // 全ページの合計バイト数
    lastAccessed: number; // タイムスタンプ
}

/** キャッシュ全体のメタデータ */
interface CacheMeta {
    files: CachedFileMeta[];
}

/**
 * IndexedDBを使ったページキャッシュサービス。
 * キー: "page:{fileId}:{pageIndex}" → 値: Blob
 * メタデータ: "__cache_meta__" → CacheMeta
 */
export class CacheService {
    /** メタデータを取得 */
    private async getMeta(): Promise<CacheMeta> {
        const meta = await get<CacheMeta>(META_KEY);
        return meta || { files: [] };
    }

    /** メタデータを保存 */
    private async saveMeta(meta: CacheMeta): Promise<void> {
        await set(META_KEY, meta);
    }

    /** ページキーを生成 */
    private pageKey(fileId: string, pageIndex: number): string {
        return `page:${fileId}:${pageIndex}`;
    }

    /** キャッシュ済みかチェック */
    async hasFile(fileId: string): Promise<boolean> {
        const meta = await this.getMeta();
        return meta.files.some(f => f.fileId === fileId);
    }

    /** キャッシュからページを取得 */
    async getPage(fileId: string, pageIndex: number): Promise<Blob | null> {
        const blob = await get<Blob>(this.pageKey(fileId, pageIndex));
        if (blob) {
            // 最終アクセス日を更新
            const meta = await this.getMeta();
            const fileMeta = meta.files.find(f => f.fileId === fileId);
            if (fileMeta) {
                fileMeta.lastAccessed = Date.now();
                await this.saveMeta(meta);
            }
        }
        return blob || null;
    }

    /** ページをキャッシュに保存 */
    async savePage(fileId: string, pageIndex: number, blob: Blob): Promise<void> {
        await set(this.pageKey(fileId, pageIndex), blob);
    }

    /**
     * ファイルのメタデータを登録。
     * 上限を超える場合は古いファイルから削除して空きを作る。
     * ファイル単体が上限を超える場合はキャッシュしない（falseを返す）。
     */
    async registerFile(fileId: string, fileName: string, totalPages: number, estimatedSize: number): Promise<boolean> {
        // ファイル単体が上限を超える場合はキャッシュしない
        if (estimatedSize > CACHE_LIMIT_BYTES) {
            console.log(`ファイル "${fileName}" (${(estimatedSize / 1024 / 1024).toFixed(1)}MB) はキャッシュ上限を超えるためスキップ`);
            return false;
        }

        const meta = await this.getMeta();

        // 既にキャッシュ済みの場合は最終アクセスを更新
        const existing = meta.files.find(f => f.fileId === fileId);
        if (existing) {
            existing.lastAccessed = Date.now();
            await this.saveMeta(meta);
            return true;
        }

        // 空き容量を確保（古いファイルから削除）
        await this.evictIfNeeded(meta, estimatedSize);

        // メタデータに追加
        meta.files.push({
            fileId,
            fileName,
            totalPages,
            totalSize: estimatedSize,
            lastAccessed: Date.now(),
        });
        await this.saveMeta(meta);
        return true;
    }

    /** 容量超過時に古いファイルから削除 */
    private async evictIfNeeded(meta: CacheMeta, newFileSize: number): Promise<void> {
        const currentTotal = meta.files.reduce((sum, f) => sum + f.totalSize, 0);

        if (currentTotal + newFileSize <= CACHE_LIMIT_BYTES) return;

        // 古い順にソート
        const sorted = [...meta.files].sort((a, b) => a.lastAccessed - b.lastAccessed);

        let freed = 0;
        const needed = currentTotal + newFileSize - CACHE_LIMIT_BYTES;

        for (const file of sorted) {
            if (freed >= needed) break;

            // ページデータを削除
            for (let i = 0; i < file.totalPages; i++) {
                await del(this.pageKey(file.fileId, i));
            }
            freed += file.totalSize;

            // メタデータから削除
            const idx = meta.files.findIndex(f => f.fileId === file.fileId);
            if (idx >= 0) meta.files.splice(idx, 1);

            console.log(`キャッシュ削除: "${file.fileName}" (${(file.totalSize / 1024 / 1024).toFixed(1)}MB)`);
        }
    }

    /** キャッシュ使用量を取得（MB） */
    async getUsageMB(): Promise<number> {
        const meta = await this.getMeta();
        const total = meta.files.reduce((sum, f) => sum + f.totalSize, 0);
        return total / 1024 / 1024;
    }

    /** キャッシュされたファイル一覧を取得 */
    async getCachedFiles(): Promise<CachedFileMeta[]> {
        const meta = await this.getMeta();
        return meta.files;
    }

    /** キャッシュを全てクリア */
    async clearAll(): Promise<void> {
        const allKeys = await keys();
        for (const key of allKeys) {
            if (typeof key === 'string' && (key.startsWith('page:') || key === META_KEY)) {
                await del(key);
            }
        }
    }
}

export const cacheService = new CacheService();
