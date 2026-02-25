import type { CloudService } from './CloudService';
import type { LibraryItem } from '../../types';
import { generateVerifier, generateChallenge } from '../../utils/pkce';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const REDIRECT_URI = window.location.origin + (import.meta.env.BASE_URL || '/') + 'oauth/callback/google';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export class GoogleDriveService implements CloudService {
    providerName = 'google-drive' as const;
    private accessToken: string | null = localStorage.getItem('google_access_token');

    async login(): Promise<void> {
        const verifier = generateVerifier();
        const challenge = await generateChallenge(verifier);

        // Save verifier for callback
        localStorage.setItem('google_code_verifier', verifier);

        const params = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            response_type: 'code',
            scope: 'https://www.googleapis.com/auth/drive.readonly',
            code_challenge: challenge,
            code_challenge_method: 'S256',
            access_type: 'offline', // optional, for refresh token
        });

        window.location.href = `${AUTH_ENDPOINT}?${params.toString()}`;
    }

    async handleCallback(code: string): Promise<void> {
        const verifier = localStorage.getItem('google_code_verifier');
        if (!verifier) throw new Error('No code verifier found');

        const params = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code',
            code,
            code_verifier: verifier,
        });

        const response = await fetch(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params,
        });

        if (!response.ok) {
            throw new Error('Failed to exchange code for token');
        }

        const data = await response.json();
        this.accessToken = data.access_token;
        localStorage.setItem('google_access_token', data.access_token);
        localStorage.removeItem('google_code_verifier');
    }

    async listFiles(folderId: string = 'root'): Promise<LibraryItem[]> {
        if (!this.accessToken) throw new Error('Not authenticated');

        const q = `'${folderId}' in parents and (mimeType = 'application/zip' or mimeType = 'application/x-cbz' or name contains '.zip' or name contains '.cbz') and trashed = false`;
        const params = new URLSearchParams({
            q,
            fields: 'files(id, name, mimeType, modifiedTime, thumbnailLink)',
            pageSize: '100',
        });

        const response = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
            headers: { Authorization: `Bearer ${this.accessToken}` },
        });

        if (!response.ok) {
            if (response.status === 401) {
                this.logout();
                throw new Error('Session expired');
            }
            throw new Error('Failed to list files');
        }

        const data = await response.json();

        return data.files.map((f: any) => ({
            id: f.id,
            name: f.name,
            source: 'google-drive',
            thumbnailUrl: f.thumbnailLink,
            addedAt: new Date(f.modifiedTime).getTime(),
        }));
    }

    async downloadFile(fileId: string): Promise<Blob> {
        if (!this.accessToken) throw new Error('Not authenticated');

        const response = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${this.accessToken}` },
        });

        if (!response.ok) throw new Error('Failed to download file');

        return await response.blob();
    }

    isAuthenticated(): boolean {
        return !!this.accessToken;
    }

    async logout(): Promise<void> {
        this.accessToken = null;
        localStorage.removeItem('google_access_token');
    }
}

export const googleDriveService = new GoogleDriveService();
