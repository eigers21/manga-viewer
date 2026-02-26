import { get, set, del, keys } from 'idb-keyval';

// キャッシュ上限（バイト）
const CACHE_LIMIT_BYTES = 500 * 1024 * 1024; // 500MB

// メタデータのキー
const META_KEY = '__cache_meta__';

/** キャッシュされたファイルのメタデータ */
interface CachedFileMeta {
    fileId: string;
    fileName: string;
    totalSize: number; // 全体バイト数
    lastAccessed: number; // タイムスタンプ
}

/** キャッシュ全体のメタデータ */
interface CacheMeta {
    files: CachedFileMeta[];
}

/**
 * IndexedDBを使ったファイル単位のキャッシュサービス。
 * キー: "file:{fileId}" → 値: Blob
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

    /** ファイル全体のキーを生成 */
    private fileKey(fileId: string): string {
        return `file:${fileId}`;
    }

    /** キャッシュ済みかチェック */
    async hasFile(fileId: string): Promise<boolean> {
        const meta = await this.getMeta();
        return meta.files.some(f => f.fileId === fileId);
    }

    /** キャッシュからファイル全体を取得 */
    async getFile(fileId: string): Promise<Blob | null> {
        const blob = await get<Blob>(this.fileKey(fileId));
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

    /** ファイル全体をキャッシュに保存 */
    async saveFile(fileId: string, fileName: string, blob: Blob): Promise<boolean> {
        const estimatedSize = blob.size;

        // ファイル単体が上限を超える場合はキャッシュしない
        if (estimatedSize > CACHE_LIMIT_BYTES) {
            console.log(`ファイル "${fileName}" (${(estimatedSize / 1024 / 1024).toFixed(1)}MB) はキャッシュ上限を超えるためスキップ`);
            return false;
        }

        const meta = await this.getMeta();

        // 既にキャッシュ済みの場合は内容と時間を更新
        const existing = meta.files.find(f => f.fileId === fileId);
        if (existing) {
            existing.lastAccessed = Date.now();
            existing.totalSize = estimatedSize;
        } else {
            // 空き容量を確保（古いファイルから削除）
            await this.evictIfNeeded(meta, estimatedSize);

            // メタデータに追加
            meta.files.push({
                fileId,
                fileName,
                totalSize: estimatedSize,
                lastAccessed: Date.now(),
            });
        }

        await this.saveMeta(meta);
        await set(this.fileKey(fileId), blob);
        return true;
    }

    /**
     * ファイルのメタデータを登録 (旧API互換、もう使わないが削除用ロジックのために残すか不要なら消す)。
     * 代わりに旧ページキャッシュがあった場合のクリーンアップ処理を入れる
     */
    async cleanupLegacyPageCache(): Promise<void> {
        const allKeys = await keys();
        for (const key of allKeys) {
            if (typeof key === 'string' && key.startsWith('page:')) {
                await del(key);
            }
        }
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

            // ファイルデータを削除
            await del(this.fileKey(file.fileId));
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
            if (typeof key === 'string' && (key.startsWith('file:') || key.startsWith('page:') || key === META_KEY)) {
                await del(key);
            }
        }
    }
}

export const cacheService = new CacheService();
