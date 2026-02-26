import React, { useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { usePageLoader } from '../../hooks/usePageLoader';
import { useDrag } from '@use-gesture/react';
import { useNavigate } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import './Viewer.css';

// 縦読み用のページコンポーネント
const VerticalPage: React.FC<{ index: number; url?: string; setPage: (idx: number) => void }> = ({ index, url, setPage }) => {
    const { ref, inView } = useInView({
        threshold: 0.1, // 10%表示されたら検知
        rootMargin: '50% 0px',
    });

    // 各ページの「本来の高さ」を保持する
    const [pageHeight, setPageHeight] = React.useState<number | undefined>(undefined);

    useEffect(() => {
        if (inView) {
            setPage(index);
        }
    }, [inView, index, setPage]);

    const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        // 画像がロードされたらその実寸サイズ（描画サイズ）をもとに高さを固定する
        const height = e.currentTarget.getBoundingClientRect().height;
        if (height > 0) {
            setPageHeight(height);
        }
    };

    return (
        <div
            ref={ref}
            className="vertical-page-container"
            style={{
                height: pageHeight ? `${pageHeight}px` : 'auto',
                minHeight: pageHeight ? undefined : '50vh'
            }}
        >
            {url ? (
                <img
                    src={url}
                    alt={`Page ${index + 1}`}
                    className="vertical-page-image"
                    loading="lazy"
                    onLoad={handleImageLoad}
                />
            ) : (
                <div className="vertical-page-placeholder">
                    <span>Loading Page {index + 1}...</span>
                </div>
            )}
        </div>
    );
};

export const Viewer: React.FC = () => {
    const navigate = useNavigate();
    const { file, currentPageIndex, pageUrls, nextPage, prevPage, closeFile, viewMode, setViewMode, setPage } = useStore();

    // Activate pre-fetching
    usePageLoader();

    // Redirect if no file loaded
    useEffect(() => {
        if (!file) {
            navigate('/');
        }
    }, [file, navigate]);

    // Gestures (横読みモードのみ)
    const bind = useDrag(({ swipe: [swipeX] }) => {
        if (viewMode === 'vertical') return;
        // Swipe detection
        if (swipeX === -1) { // Swipe Left -> Next
            nextPage();
        } else if (swipeX === 1) { // Swipe Right -> Prev
            prevPage();
        }
    }, {
        filterTaps: true,
        axis: 'x',
    });

    const handleZoneClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (viewMode === 'vertical') return;

        const width = e.currentTarget.clientWidth;
        const x = e.clientX;

        // Left 30% -> Next
        if (x < width * 0.3) {
            nextPage();
        }
        // Right 30% -> Prev
        else if (x > width * 0.7) {
            prevPage();
        }
    };

    const toggleViewMode = (e: React.MouseEvent) => {
        e.stopPropagation();
        setViewMode(viewMode === 'vertical' ? 'horizontal' : 'vertical');
    };

    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        closeFile();
    };

    // 初回マウント時やモード変更時に、現在のページへスクロールさせる処理
    useEffect(() => {
        if (!file) return;
        if (viewMode === 'vertical') {
            const el = document.getElementById(`vertical-page-${currentPageIndex}`);
            if (el) {
                el.scrollIntoView({ behavior: 'auto', block: 'start' });
            }
        }
    }, [viewMode, file]); // 最初の切り替え時だけ

    if (!file) return null;

    const currentUrl = pageUrls[currentPageIndex];

    return (
        <div className={`viewer-container ${viewMode === 'vertical' ? 'vertical-mode' : ''}`} {...(viewMode === 'horizontal' ? bind() : {})} onClick={handleZoneClick}>
            <div className="viewer-controls">
                <button className="mode-toggle-button" onClick={toggleViewMode} title="表示モード切替">
                    {viewMode === 'vertical' ? '横スクロール' : '縦スクロール'}
                </button>
                <button className="close-button" onClick={handleClose}>×</button>
            </div>

            <div className="page-info">
                {file.fileName} - {currentPageIndex + 1} / {file.totalPages}
            </div>

            {viewMode === 'horizontal' ? (
                <div className="image-container">
                    {currentUrl ? (
                        <img
                            src={currentUrl}
                            alt={`Page ${currentPageIndex + 1}`}
                            className="manga-page"
                            draggable={false}
                        />
                    ) : (
                        <div className="loading-spinner">Loading...</div>
                    )}
                </div>
            ) : (
                <div className="vertical-scroll-wrapper">
                    {Array.from({ length: file.totalPages }).map((_, i) => (
                        <div key={i} id={`vertical-page-${i}`}>
                            <VerticalPage
                                index={i}
                                url={pageUrls[i]}
                                setPage={setPage}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
