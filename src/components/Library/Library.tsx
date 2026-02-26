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

export const Library: React.FC = () => {
    const navigate = useNavigate();
    const { loadFile, isLoading, error, downloadProgress, setDownloadProgress, setCurrentFileId } = useStore();
    const [cacheUsageMB, setCacheUsageMB] = useState(0);

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
        // レガシーキャッシュの消去とキャッシュ使用量を取得
        cacheService.cleanupLegacyPageCache().then(() => {
            cacheService.getUsageMB().then(mb => setCacheUsageMB(mb));
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
            // キャッシュ確認
            let blob = await cacheService.getFile(fileId);

            if (!blob) {
                // キャッシュが無ければダウンロード
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
                // キャッシュ確認
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
        // パンくずリストをクリックした位置まで切り詰める
        setBoxBreadcrumbs(prev => prev.slice(0, index + 1));
        await fetchBoxFiles(target.id);
    };

    /** ファイル種別に応じたアイコンを返す */
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

    return (
        <div className="library-container">
            <div className="library-header">
                <h1>Manga Reader</h1>
                <p>Simple, fast, and private manga viewer.</p>
                {cacheUsageMB > 0 && (
                    <div className="cache-info">
                        <span>📦 キャッシュ: {cacheUsageMB.toFixed(1)}MB / 500MB</span>
                        <button className="cache-clear-btn" onClick={handleClearCache}>クリア</button>
                    </div>
                )}
            </div>

            {/* ダウンロード進捗バー */}
            {downloadProgress >= 0 && (
                <div className="download-progress-container">
                    <div className="download-progress-bar">
                        <div className="download-progress-fill" style={{ width: `${downloadProgress}%` }} />
                    </div>
                    <span className="download-progress-text">
                        {downloadProgress < 100 ? `ダウンロード中... ${downloadProgress}%` : '展開中...'}
                    </span>
                </div>
            )}

            {error && (
                <div style={{ color: '#ff6b6b', background: 'rgba(255, 0, 0, 0.1)', padding: '10px 20px', borderRadius: '8px' }}>
                    Error: {error}
                </div>
            )}

            <div className="library-grid">
                {/* BOX カード */}
                {!isBoxAuth ? (
                    <div className="library-card" onClick={handleBoxLogin}>
                        <div className="icon-placeholder box-icon">
                            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
                                <path d="M2.5 5.5L7.5 8.5v6l-5-3v-6zm19 0l-5 3v6l5-3v-6zM12 15l-5-3v6l5 3 5-3v-6l-5 3zM7.5 8.5l5-3 5 3-5 3-5-3z" />
                            </svg>
                        </div>
                        <h3>BOX</h3>
                        <p>Connect to view files</p>
                        <button className="action-button">Connect</button>
                    </div>
                ) : (
                    <div className="library-card active box-active">
                        <div className="box-header">
                            <div className="box-title">
                                <span className="box-logo">BOX</span>
                                <button className="box-logout-btn" onClick={handleBoxLogout} title="ログアウト">
                                    ✕
                                </button>
                            </div>
                            {/* パンくずリスト */}
                            <div className="breadcrumbs">
                                {boxBreadcrumbs.map((crumb, index) => (
                                    <React.Fragment key={crumb.id}>
                                        {index > 0 && <span className="breadcrumb-sep">›</span>}
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
                        </div>

                        {loadingBox ? (
                            <div className="loading-indicator">
                                <div className="spinner"></div>
                                <p>読み込み中...</p>
                            </div>
                        ) : (
                            <div className="cloud-file-list">
                                {boxFiles.length === 0 ? (
                                    <p className="empty-message">対象ファイルが見つかりません</p>
                                ) : (
                                    <ul>
                                        {boxFiles.map(item => (
                                            <li
                                                key={item.id}
                                                onClick={() => handleBoxItemClick(item)}
                                                className={item.type === 'folder' ? 'folder-item' : 'file-item'}
                                            >
                                                <span className="file-icon">{getFileIcon(item.name, item.type)}</span>
                                                <span className="file-name">{item.name}</span>
                                                {item.type === 'folder' && <span className="folder-arrow">›</span>}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Google Drive カード */}
                {!isDriveAuth ? (
                    <div className="library-card" onClick={handleGoogleLogin}>
                        <div className="icon-placeholder">☁️</div>
                        <h3>Google Drive</h3>
                        <p>Connect to view files</p>
                        <button className="action-button">Connect</button>
                    </div>
                ) : (
                    <div className="library-card active">
                        <div className="icon-placeholder">Google Drive</div>
                        {loadingCloud ? <p>Loading files...</p> : (
                            <div className="cloud-file-list">
                                {cloudFiles.length === 0 ? <p>No ZIP/CBZ files found.</p> : (
                                    <ul>
                                        {cloudFiles.map(file => (
                                            <li key={file.id} onClick={() => handleCloudFileClick(file.id, file.name)}>
                                                {file.name}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ローカルファイルカード */}
                <div className="library-card">
                    <div className="file-input-wrapper">
                        <div className="icon-placeholder">📂</div>
                        <h3>Open Local File</h3>
                        <p>Select .zip, .cbz, or .pdf file from device</p>
                        <button className="action-button">
                            {isLoading ? 'Loading...' : 'Choose File'}
                        </button>
                        <input
                            type="file"
                            accept=".zip,.cbz,.pdf"
                            onChange={handleFileChange}
                            className="hidden-input"
                            disabled={isLoading || loadingCloud || loadingBox}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
