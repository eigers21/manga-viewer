import React, { useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { usePageLoader } from '../../hooks/usePageLoader';
import { useDrag } from '@use-gesture/react';
import { useNavigate } from 'react-router-dom';
import './Viewer.css';

export const Viewer: React.FC = () => {
    const navigate = useNavigate();
    const { file, currentPageIndex, pageUrls, nextPage, prevPage, closeFile } = useStore();

    // Activate pre-fetching
    usePageLoader();

    // Redirect if no file loaded
    useEffect(() => {
        if (!file) {
            navigate('/');
        }
    }, [file, navigate]);

    // Gestures
    const bind = useDrag(({ swipe: [swipeX] }) => {
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

    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        closeFile();
    };

    if (!file) return null;

    const currentUrl = pageUrls[currentPageIndex];

    return (
        <div className="viewer-container" {...bind()} onClick={handleZoneClick}>
            <button className="close-button" onClick={handleClose}>×</button>

            <div className="page-info">
                {file.fileName} - {currentPageIndex + 1} / {file.totalPages}
            </div>

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
        </div>
    );
};
