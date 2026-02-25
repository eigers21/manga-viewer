import type { CloudService } from './CloudService';
import type { LibraryItem } from '../../types';

// Box OAuth2 設定
const BOX_CLIENT_ID = import.meta.env.VITE_BOX_CLIENT_ID || '';
const BOX_CLIENT_SECRET = import.meta.env.VITE_BOX_CLIENT_SECRET || '';
const BASE_PATH = import.meta.env.BASE_URL || '/';
const REDIRECT_URI = window.location.origin + BASE_PATH + 'oauth/callback/box';
const AUTH_ENDPOINT = 'https://account.box.com/api/oauth2/authorize';
// 開発時はViteプロキシ経由、本番はBox APIに直接リクエスト
const IS_DEV = import.meta.env.DEV;
const TOKEN_ENDPOINT = IS_DEV ? '/api/box/token' : 'https://api.box.com/oauth2/token';
const BOX_API = 'https://api.box.com/2.0';

// トークン有効期限（Box は約60分）
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

interface BoxTokenData {
    access_token: string;
    refresh_token: string;
    expires_at: number;
}

export class BoxService implements CloudService {
    providerName = 'box' as const;
    private tokenData: BoxTokenData | null = null;

    constructor() {
        // ローカルストレージからトークン復元
        const stored = localStorage.getItem('box_token_data');
        if (stored) {
            try {
                this.tokenData = JSON.parse(stored);
            } catch {
                this.tokenData = null;
            }
        }
    }

    /** Box OAuth2 認証ページにリダイレクト */
    async login(): Promise<void> {
        const params = new URLSearchParams({
            client_id: BOX_CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            response_type: 'code',
        });
        window.location.href = `${AUTH_ENDPOINT}?${params.toString()}`;
    }

    /** 認証コールバック処理。認証コードをアクセストークンに交換 */
    async handleCallback(code: string): Promise<void> {
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: BOX_CLIENT_ID,
            client_secret: BOX_CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
        });

        const response = await fetch(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Box token exchange failed:', errorText);
            throw new Error('Failed to exchange code for token');
        }

        const data = await response.json();
        this.saveTokenData(data);
    }

    /** フォルダ内のファイル一覧を取得 */
    async listFiles(folderId: string = '0'): Promise<LibraryItem[]> {
        await this.ensureValidToken();
        if (!this.tokenData) throw new Error('Not authenticated');

        const params = new URLSearchParams({
            fields: 'id,name,type,modified_at,size',
            limit: '1000',
        });

        const response = await fetch(
            `${BOX_API}/folders/${folderId}/items?${params.toString()}`,
            { headers: { Authorization: `Bearer ${this.tokenData.access_token}` } }
        );

        if (!response.ok) {
            if (response.status === 401) {
                await this.logout();
                throw new Error('Session expired');
            }
            throw new Error('Failed to list files');
        }

        const data = await response.json();
        const items: LibraryItem[] = [];

        for (const entry of data.entries) {
            if (entry.type === 'folder') {
                items.push({
                    id: entry.id,
                    name: entry.name,
                    source: 'box',
                    type: 'folder',
                    addedAt: new Date(entry.modified_at).getTime(),
                });
            } else if (entry.type === 'file') {
                const ext = entry.name.toLowerCase();
                if (ext.endsWith('.zip') || ext.endsWith('.cbz') || ext.endsWith('.pdf')) {
                    items.push({
                        id: entry.id,
                        name: entry.name,
                        source: 'box',
                        type: 'file',
                        addedAt: new Date(entry.modified_at).getTime(),
                    });
                }
            }
        }

        // フォルダを先、ファイルを後に並び替え
        items.sort((a, b) => {
            if (a.type === 'folder' && b.type !== 'folder') return -1;
            if (a.type !== 'folder' && b.type === 'folder') return 1;
            return a.name.localeCompare(b.name, 'ja');
        });

        return items;
    }

    /**
     * ファイルをダウンロードしてBlobとして返す。
     * Box APIのdownloadエンドポイントは302リダイレクトを返すため、
     * CORS問題を回避するために複数の手段を試行する。
     */
    async downloadFile(fileId: string): Promise<Blob> {
        await this.ensureValidToken();
        if (!this.tokenData) throw new Error('Not authenticated');

        // 開発時はViteプロキシ経由でダウンロード
        if (IS_DEV) {
            const response = await fetch(`/api/box/download/${fileId}`, {
                headers: { Authorization: `Bearer ${this.tokenData.access_token}` },
            });
            if (!response.ok) {
                throw new Error(`Download failed: ${response.status} ${response.statusText}`);
            }
            return await response.blob();
        }

        // 本番環境: Box APIに直接リクエスト
        try {
            const response = await fetch(`${BOX_API}/files/${fileId}/content`, {
                headers: { Authorization: `Bearer ${this.tokenData.access_token}` },
            });

            if (response.ok) {
                return await response.blob();
            }

            if (response.status === 401) {
                await this.logout();
                throw new Error('Session expired');
            }

            const errorBody = await response.text().catch(() => 'Unknown error');
            console.error(`Box download error: ${response.status}`, errorBody);
            throw new Error(`Download failed (${response.status}): ${errorBody}`);
        } catch (error) {
            // CORSエラーの場合はTypeErrorになる — XMLHttpRequestで再試行
            if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
                console.warn('CORS error detected, trying XMLHttpRequest...');
                return await this.downloadWithXHR(fileId);
            }
            throw error;
        }
    }

    /** XMLHttpRequestでファイルをダウンロード（CORSフォールバック） */
    private downloadWithXHR(fileId: string): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `${BOX_API}/files/${fileId}/content`, true);
            xhr.responseType = 'blob';
            xhr.setRequestHeader('Authorization', `Bearer ${this.tokenData!.access_token}`);

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(xhr.response);
                } else if (xhr.status === 401) {
                    this.logout();
                    reject(new Error('Session expired'));
                } else {
                    reject(new Error(`Download failed: ${xhr.status}`));
                }
            };

            xhr.onerror = () => {
                console.error('XHR download failed. Box Developer ConsoleでCORSドメインを確認してください。');
                reject(new Error(
                    'ダウンロードに失敗しました。\n' +
                    'Box Developer Console → 構成 → CORSドメイン に\n' +
                    'https://eigers21.github.io を追加してください。'
                ));
            };

            xhr.send();
        });
    }

    isAuthenticated(): boolean {
        return !!this.tokenData?.access_token;
    }

    async logout(): Promise<void> {
        this.tokenData = null;
        localStorage.removeItem('box_token_data');
    }

    /** トークンが期限切れの場合、リフレッシュトークンで更新 */
    private async ensureValidToken(): Promise<void> {
        if (!this.tokenData) return;
        if (Date.now() >= this.tokenData.expires_at - TOKEN_EXPIRY_BUFFER_MS) {
            await this.refreshToken();
        }
    }

    /** リフレッシュトークンでアクセストークンを更新 */
    private async refreshToken(): Promise<void> {
        if (!this.tokenData?.refresh_token) {
            await this.logout();
            throw new Error('Session expired');
        }

        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: this.tokenData.refresh_token,
            client_id: BOX_CLIENT_ID,
            client_secret: BOX_CLIENT_SECRET,
        });

        const response = await fetch(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
        });

        if (!response.ok) {
            await this.logout();
            throw new Error('Session expired');
        }

        const data = await response.json();
        this.saveTokenData(data);
    }

    /** トークンデータを保存 */
    private saveTokenData(data: { access_token: string; refresh_token: string; expires_in: number }): void {
        this.tokenData = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: Date.now() + data.expires_in * 1000,
        };
        localStorage.setItem('box_token_data', JSON.stringify(this.tokenData));
    }
}

export const boxService = new BoxService();
