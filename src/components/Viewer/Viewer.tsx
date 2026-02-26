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
                    draggable={false}
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
    const { file, currentPageIndex, pageUrls, nextPage, prevPage, closeFile, viewMode, setViewMode, setPage, isLoading } = useStore();

    // UI Overlay state
    const [showUI, setShowUI] = React.useState(false);
    
    // We want to force the loading spinner to show immediately and not redirect back
    // if the store is still processing the loadFile async call.
    const [isOpening, setIsOpening] = React.useState(true);

    // Fade out UI initially after loaded, but do NOT auto-hide it. Wait for user tap.
    useEffect(() => {
        if (file) {
            setIsOpening(false);
            setShowUI(true); // 初期表示のみ
        }
    }, [file]);

    const toggleUI = React.useCallback(() => {
        setShowUI(prev => !prev);
    }, []);

    // Activate pre-fetching
    usePageLoader();

    // Redirect if no file loaded and we're definitely not opening or loading
    useEffect(() => {
        if (!file && !isLoading) {
            const t = setTimeout(() => {
                navigate('/');
            }, 100);
            return () => clearTimeout(t);
        }
    }, [file, isLoading, navigate]);

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

    // ==== Auto-Scroll Feature States & Refs ====
    const scrollWrapperRef = React.useRef<HTMLDivElement>(null);
    const [isAutoScrolling, setIsAutoScrolling] = React.useState(false);
    const [dragOffset, setDragOffset] = React.useState(0);
    
    const autoScrollRef = React.useRef({
        startY: 0,
        currentY: 0,
        isScrolling: false,
        animationFrame: null as number | null,
    });

    const scrollLoop = React.useCallback(() => {
        const state = autoScrollRef.current;
        if (!state.isScrolling) return;

        // アンカー（押し始めY）と現在の指の距離
        const dy = state.currentY - state.startY;
        
        // UIに反映するためのオフセット
        setDragOffset(dy);
        
        // 遊び(デッドゾーン)を少し設ける（半径15px以内はスクロールしない）
        if (Math.abs(dy) > 15) {
            // 距離に応じて速度(px/frame)を決定。
            const speed = (dy - (dy > 0 ? 15 : -15)) * 0.15;
            
            const container = scrollWrapperRef.current;
            if (container) {
                container.scrollBy({ top: speed, behavior: 'auto' });
            }
        }

        state.animationFrame = requestAnimationFrame(scrollLoop);
    }, []);

    const stopAutoScroll = React.useCallback(() => {
        const state = autoScrollRef.current;
        if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
        state.isScrolling = false;
        setIsAutoScrolling(false);
        setDragOffset(0);
    }, []);

    const handleJoystickDown = (e: React.PointerEvent) => {
        // Only react to primary touch/mouse button
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        
        // This is the magic that takes 100% control of the pointer
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

        const state = autoScrollRef.current;
        if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
        
        state.isScrolling = true;
        state.startY = e.clientY;
        state.currentY = e.clientY;
        
        setIsAutoScrolling(true);
        setDragOffset(0);
        
        state.animationFrame = requestAnimationFrame(scrollLoop);
    };

    const handleJoystickMove = (e: React.PointerEvent) => {
        const state = autoScrollRef.current;
        if (state.isScrolling) {
            state.currentY = e.clientY;
        }
    };

    const handleJoystickUp = (e: React.PointerEvent) => {
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
            // ignore error
        }
        stopAutoScroll();
    };

    // ==== Handle Clicks ====
    const handleZoneClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const state = autoScrollRef.current;

        // もしジョイスティック操作直後のイベント伝播なら防止
        if (state.isScrolling) return;

        if (viewMode === 'vertical') {
            // UI上のボタン（mode-toggleやclose）をクリックした場合は反応させない
            if ((e.target as HTMLElement).closest('.viewer-controls')) return;
            // ジョイスティッククリックも無視
            if ((e.target as HTMLElement).closest('.joystick-pad')) return;
            
            toggleUI();
            return;
        }

        const width = e.currentTarget.clientWidth;
        const x = e.clientX;

        // Middle 40% -> Toggle UI
        if (x >= width * 0.3 && x <= width * 0.7) {
            toggleUI();
        } 
        // Left 30% -> Next
        else if (x < width * 0.3) {
            nextPage();
        }
        // Right 30% -> Prev
        else {
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

    if (!file || isOpening) {
        return (
            <div className="viewer-container" style={{justifyContent: 'center', alignItems: 'center'}}>
                <div className="loading-spinner" style={{ border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#0061d5', borderRadius: '50%', width: 40, height: 40, animation: 'spin 1s linear infinite' }}></div>
                <p style={{ color: '#fff', marginTop: 20, fontSize: '1rem' }}>Extracting and Opening File...</p>
            </div>
        );
    }

    const currentUrl = pageUrls[currentPageIndex];

    return (
        <div 
            className={`viewer-container ${viewMode === 'vertical' ? 'vertical-mode' : ''} ${isAutoScrolling ? 'auto-scrolling' : ''}`} 
            {...(viewMode === 'horizontal' ? bind() : {})} 
            onClick={handleZoneClick}
        >
            
            <div className={`viewer-ui-overlay ${showUI ? 'visible' : ''}`}>
                <div className="viewer-controls">
                    <button className="mode-toggle-button" onClick={toggleViewMode} title="表示モード切替">
                        {viewMode === 'vertical' ? '横スクロール' : '縦スクロール'}
                    </button>
                    <button className="close-button" onClick={handleClose}>×</button>
                </div>

                <div className="page-info">
                    {file.fileName} - {currentPageIndex + 1} / {file.totalPages}
                </div>
            </div>

            {/* Dedicated Auto-Scroll Joystick (Vertical mode only) */}
            {viewMode === 'vertical' && (!showUI ? null : (
                <div 
                    className={`joystick-pad ${isAutoScrolling ? 'active' : ''}`}
                    onPointerDown={handleJoystickDown}
                    onPointerMove={handleJoystickMove}
                    onPointerUp={handleJoystickUp}
                    onPointerCancel={handleJoystickUp}
                    onContextMenu={(e) => e.preventDefault()}
                    onDragStart={(e) => e.preventDefault()}
                >
                    <div className="joystick-thumb" style={{ transform: `translate(-50%, calc(-50% + ${Math.min(Math.max(dragOffset, -40), 40)}px))` }} />
                    <div className="joystick-label">SCROLL</div>
                </div>
            ))}

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
                <div 
                    ref={scrollWrapperRef}
                    className="vertical-scroll-wrapper"
                >
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
