import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { googleDriveService } from '../../services/cloud/GoogleDriveService';
import { boxService } from '../../services/cloud/BoxService';
import { cacheService } from '../../services/cache/CacheService';
import type { LibraryItem } from '../../types';
import './Library.css';

/** パンくずリスト用のフォルダ情報 */
interface BreadcrumbItem {
    id: string;
    name: string;
}

/** キャッシュされた履歴メタデータ (簡易取得用) */
interface CachedFileMeta {
    fileId: string;
    fileName: string;
    totalSize: number;
    lastAccessed: number;
}

export const Library: React.FC = () => {
    const navigate = useNavigate();
    const { loadFile, isLoading, error, downloadProgress, setDownloadProgress, setCurrentFileId } = useStore();
    const [cacheUsageMB, setCacheUsageMB] = useState(0);

    // 履歴 (Recently Read)
    const [recentFiles, setRecentFiles] = useState<CachedFileMeta[]>([]);

    // Google Drive 状態
    const [cloudFiles, setCloudFiles] = useState<LibraryItem[]>([]);
    const [isDriveAuth, setIsDriveAuth] = useState(false);
    const [loadingCloud, setLoadingCloud] = useState(false);

    // BOX 状態
    const [boxFiles, setBoxFiles] = useState<LibraryItem[]>([]);
    const [isBoxAuth, setIsBoxAuth] = useState(false);
    const [loadingBox, setLoadingBox] = useState(false);
    const [boxBreadcrumbs, setBoxBreadcrumbs] = useState<BreadcrumbItem[]>([
        { id: '0', name: 'All Files' },
    ]);

    useEffect(() => {
        // Google Drive の認証チェック
        if (googleDriveService.isAuthenticated()) {
            setIsDriveAuth(true);
            fetchCloudFiles();
        }
        // BOX の認証チェック
        if (boxService.isAuthenticated()) {
            setIsBoxAuth(true);
            fetchBoxFiles('0');
        }
        // レガシーキャッシュの消去とキャッシュ使用量取得＆履歴取得
        cacheService.cleanupLegacyPageCache().then(() => {
            cacheService.getUsageMB().then(mb => setCacheUsageMB(mb));
            cacheService.getCachedFiles().then(files => {
                // 新しい順にソート (lastAccessed 降順) して最大10件取得
                const sorted = [...files].sort((a, b) => b.lastAccessed - a.lastAccessed).slice(0, 10);
                setRecentFiles(sorted);
            });
        });
    }, []);

    // --- Google Drive ---
    const fetchCloudFiles = async () => {
        setLoadingCloud(true);
        try {
            const files = await googleDriveService.listFiles();
            setCloudFiles(files);
        } catch (e) {
            console.error('Google Driveファイル取得失敗:', e);
            if ((e as Error).message === 'Session expired') {
                setIsDriveAuth(false);
            }
        } finally {
            setLoadingCloud(false);
        }
    };

    const handleGoogleLogin = async () => {
        await googleDriveService.login();
    };

    const handleCloudFileClick = async (fileId: string, fileName: string) => {
        setLoadingCloud(true);
        try {
            let blob = await cacheService.getFile(fileId);
            if (!blob) {
                blob = await googleDriveService.downloadFile(fileId);
                await cacheService.saveFile(fileId, fileName, blob);
            }
            setCurrentFileId(fileId);
            await loadFile(blob, fileName);
            navigate('/viewer');
        } catch (e) {
            console.error('ダウンロード失敗:', e);
            alert('ファイルのダウンロードに失敗しました');
        } finally {
            setLoadingCloud(false);
        }
    };

    // --- BOX ---
    const fetchBoxFiles = useCallback(async (folderId: string) => {
        setLoadingBox(true);
        try {
            const files = await boxService.listFiles(folderId);
            setBoxFiles(files);
        } catch (e) {
            console.error('BOXファイル取得失敗:', e);
            if ((e as Error).message === 'Session expired') {
                setIsBoxAuth(false);
                setBoxBreadcrumbs([{ id: '0', name: 'All Files' }]);
            }
        } finally {
            setLoadingBox(false);
        }
    }, []);

    const handleBoxLogin = async () => {
        await boxService.login();
    };

    const handleBoxLogout = async () => {
        await boxService.logout();
        setIsBoxAuth(false);
        setBoxFiles([]);
        setBoxBreadcrumbs([{ id: '0', name: 'All Files' }]);
    };

    const handleBoxItemClick = async (item: LibraryItem) => {
        if (item.type === 'folder') {
            setBoxBreadcrumbs(prev => [...prev, { id: item.id, name: item.name }]);
            await fetchBoxFiles(item.id);
        } else {
            setLoadingBox(true);
            setDownloadProgress(0);
            try {
                let blob = await cacheService.getFile(item.id);
                if (!blob) {
                    blob = await boxService.downloadFile(item.id, (loaded, total) => {
                        const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
                        setDownloadProgress(pct);
                    });
                    await cacheService.saveFile(item.id, item.name, blob);
                }
                setDownloadProgress(100);
                setCurrentFileId(item.id);
                await loadFile(blob, item.name);
                navigate('/viewer');
            } catch (e) {
                console.error('BOXダウンロード失敗:', e);
                const msg = (e instanceof Error) ? e.message : String(e);
                alert(`ダウンロードエラー:\n${msg}`);
            } finally {
                setLoadingBox(false);
                setDownloadProgress(-1);
            }
        }
    };

    const handleBreadcrumbClick = async (index: number) => {
        const target = boxBreadcrumbs[index];
        setBoxBreadcrumbs(prev => prev.slice(0, index + 1));
        await fetchBoxFiles(target.id);
    };

    const getFileIcon = (name: string, type?: string): string => {
        if (type === 'folder') return '📁';
        const ext = name.toLowerCase();
        if (ext.endsWith('.pdf')) return '📄';
        if (ext.endsWith('.cbz')) return '📚';
        if (ext.endsWith('.zip')) return '📦';
        return '📎';
    };

    const handleClearCache = async () => {
        await cacheService.clearAll();
        setCacheUsageMB(0);
        setRecentFiles([]);
        alert('キャッシュをクリアしました');
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setCurrentFileId(file.name);
            await loadFile(file, file.name);
            navigate('/viewer');
        }
    };

    const handleRecentFileClick = async (fileId: string, fileName: string) => {
        try {
            // This currently only supports loading directly from cache.
            // If the file was evicted from cache, it won't be able to open easily here unless we
            // know which service to fetch from. Since it's in the cache list, it should be available.
            const blob = await cacheService.getFile(fileId);
            if (blob) {
                setCurrentFileId(fileId);
                await loadFile(blob, fileName);
                navigate('/viewer');
            } else {
                alert('ファイルデータがキャッシュから削除されているため開けません。元の場所から開き直してください。');

                // Fetch list and update immediately to remove broken links from UI
                cacheService.getCachedFiles().then(files => {
                    const sorted = [...files].sort((a, b) => b.lastAccessed - a.lastAccessed).slice(0, 10);
                    setRecentFiles(sorted);
                });
            }
        } catch (e) {
            console.error('Failed to load recent file from cache', e);
        }
    };

    // Icon SVGs
    const SettingsIcon = () => (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
        </svg>
    );

    const BoxIcon = () => (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M2.5 5.5L7.5 8.5v6l-5-3v-6zm19 0l-5 3v6l5-3v-6zM12 15l-5-3v6l5 3 5-3v-6l-5 3zM7.5 8.5l5-3 5 3-5 3-5-3z" />
        </svg>
    );

    const DriveIcon = () => (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M19.34,10.05l-3.33-5.77H9.35l3.33,5.77H19.34z M3.33,10.05l3.34-5.77L5.01,2.55L0,11.2h2.67C2.9,11.2,3.13,10.98,3.33,10.05z M10.49,12h6.66l-1.66,2.88H5.5L10.49,12z" />
        </svg>
    );

    const FolderIcon = () => (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
        </svg>
    );

    const ImportIcon = () => (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm-1 11v4h-2v-4H8l4-4 4 4h-3z" />
        </svg>
    );

    return (
        <div className="library-page-container">
            <div className="library-container">
                <div className="library-header-bar">
                    <h1>Sources</h1>
                    <button className="settings-btn" onClick={handleClearCache} title="Clear Cache">
                        <SettingsIcon />
                    </button>
                </div>

                {cacheUsageMB > 0 && (
                    <div className="cache-info">
                        <span>📦 {cacheUsageMB.toFixed(1)}MB Cache</span>
                    </div>
                )}

                {downloadProgress >= 0 && (
                    <div className="download-progress-container">
                        <div className="download-progress-bar">
                            <div className="download-progress-fill" style={{ width: `${downloadProgress}%` }} />
                        </div>
                        <div style={{ textAlign: 'center', color: '#aaa', fontSize: '0.8rem' }}>
                            {downloadProgress < 100 ? `Downloading... ${downloadProgress}%` : 'Opening...'}
                        </div>
                    </div>
                )}

                {error && (
                    <div style={{ color: '#ff6b6b', background: 'rgba(255, 0, 0, 0.1)', padding: '10px 20px', borderRadius: '8px' }}>
                        Error: {error}
                    </div>
                )}

                <div className="sources-grid">
                    {/* BOX Card */}
                    <div className="source-card">
                        <div className="source-card-header">
                            <div className="source-icon-box box"><BoxIcon /></div>
                            <div className="source-badge">Cloud</div>
                        </div>
                        <div className="source-info">
                            <h3>BOX</h3>
                            <p>Secure cloud storage for your extensive manga collection. Sync and read across devices.</p>
                        </div>
                        {!isBoxAuth ? (
                            <div className="source-footer">
                                <span className="status-label" style={{ opacity: 0.5 }}>STATUS: DISCONNECTED</span>
                                <button className="action-link" onClick={handleBoxLogin}>Connect →</button>
                            </div>
                        ) : (
                            <>
                                <div className="source-footer">
                                    <span className="status-label">STATUS: ACTIVE</span>
                                    <button className="action-link" onClick={handleBoxLogout}>Log out</button>
                                </div>
                                <div className="cloud-file-wrapper">
                                    <div className="breadcrumbs">
                                        {boxBreadcrumbs.map((crumb, index) => (
                                            <React.Fragment key={crumb.id}>
                                                {index > 0 && <span className="breadcrumb-sep">/</span>}
                                                <button
                                                    className={`breadcrumb-item ${index === boxBreadcrumbs.length - 1 ? 'active' : ''}`}
                                                    onClick={() => handleBreadcrumbClick(index)}
                                                    disabled={index === boxBreadcrumbs.length - 1}
                                                >
                                                    {crumb.name}
                                                </button>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                    {loadingBox ? (
                                        <div className="loading-indicator">Loading...</div>
                                    ) : (
                                        <div className="cloud-file-list">
                                            <ul>
                                                {boxFiles.map(item => (
                                                    <li key={item.id} onClick={() => handleBoxItemClick(item)} className={item.type === 'folder' ? 'folder-item' : 'file-item'}>
                                                        <span className="file-icon">{getFileIcon(item.name, item.type)}</span>
                                                        <span className="file-name">{item.name}</span>
                                                        {item.type === 'folder' && <span className="folder-arrow">›</span>}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Google Drive Card */}
                    <div className="source-card">
                        <div className="source-card-header">
                            <div className="source-icon-box drive"><DriveIcon /></div>
                            <div className="source-badge">Drive</div>
                        </div>
                        <div className="source-info">
                            <h3>Google</h3>
                            <p>Access your personal library directly from your Google Drive folders.</p>
                        </div>
                        {!isDriveAuth ? (
                            <div className="source-footer">
                                <span className="status-label" style={{ opacity: 0.5 }}>STATUS: DISCONNECTED</span>
                                <button className="action-link" onClick={handleGoogleLogin}>Connect →</button>
                            </div>
                        ) : (
                            <>
                                <div className="source-footer">
                                    <span className="status-label">STATUS: LINKED</span>
                                    <button className="action-link" onClick={() => setIsDriveAuth(false)}>Unlink</button>
                                </div>
                                <div className="cloud-file-wrapper">
                                    {loadingCloud ? (
                                        <div className="loading-indicator">Loading files...</div>
                                    ) : (
                                        <div className="cloud-file-list">
                                            <ul>
                                                {cloudFiles.map(file => (
                                                    <li key={file.id} onClick={() => handleCloudFileClick(file.id, file.name)}>
                                                        <span className="file-icon">{getFileIcon(file.name, 'file')}</span>
                                                        <span className="file-name">{file.name}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Local Files Card */}
                    <div className="source-card local-card">
                        <div className="source-card-header">
                            <div className="source-icon-box local"><FolderIcon /></div>
                            <div className="source-badge">Device</div>
                        </div>
                        <div className="source-info">
                            <h3>Local</h3>
                            <p>Read files stored directly on this device. Supports .cbz, .zip, and .pdf formats.</p>
                        </div>
                        <div className="source-footer">
                            <label className="import-btn">
                                <ImportIcon />
                                <span>Import Files</span>
                                <input
                                    type="file"
                                    accept=".zip,.cbz,.pdf"
                                    onChange={handleFileChange}
                                    className="hidden-file-input"
                                    disabled={isLoading || loadingCloud || loadingBox}
                                />
                            </label>
                        </div>
                    </div>
                </div>

                {/* Recently Read Section */}
                {recentFiles.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                        <div className="section-title">RECENTLY READ</div>
                        <div className="recent-scroll">
                            {recentFiles.map(file => (
                                <div key={file.fileId} className="recent-card" onClick={() => handleRecentFileClick(file.fileId, file.fileName)}>
                                    <div className="recent-cover">
                                        {/* Display only the first 2 chars of the filename in the center to look nice as placeholder */}
                                        <div style={{ position: 'absolute', top: 10, left: 10, right: 10, fontSize: '0.7rem', color: '#fff', textAlign: 'center', wordBreak: 'break-all' }}>
                                            {file.fileName.replace(/\.(zip|cbz|pdf)$/i, '')}
                                        </div>
                                    </div>
                                    <div className="recent-title">{file.fileName.replace(/\.(zip|cbz|pdf)$/i, '')}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            </div>

            {/* Bottom Navigation Navbar */}
            <div className="bottom-nav">
                <button className="nav-item active">
                    <svg viewBox="0 0 24 24">
                        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                    </svg>
                    Home
                </button>
                <button className="nav-item">
                    <svg viewBox="0 0 24 24">
                        <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-3 9h-2v4h-2v-4H9V9h2V5h2v4h2v2z" />
                    </svg>
                    Library
                </button>
                <button className="nav-item">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                    Favorites
                </button>
                <button className="nav-item">
                    <svg viewBox="0 0 24 24">
                        <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
                    </svg>
                    History
                </button>
            </div>
        </div>
    );
};
