import React, { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { googleDriveService } from '../../services/cloud/GoogleDriveService';
import { boxService } from '../../services/cloud/BoxService';

export const OAuthCallback: React.FC = () => {
    const navigate = useNavigate();
    const { provider } = useParams<{ provider: string }>();
    const processed = useRef(false);

    useEffect(() => {
        if (processed.current) return;
        processed.current = true;

        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const error = params.get('error');

        if (error) {
            alert(`認証エラー: ${error}`);
            navigate('/');
            return;
        }

        if (!code) {
            navigate('/');
            return;
        }

        // プロバイダーに応じてコールバック処理を実行
        const handleAuth = async () => {
            try {
                if (provider === 'google') {
                    await googleDriveService.handleCallback(code);
                } else if (provider === 'box') {
                    await boxService.handleCallback(code);
                } else {
                    navigate('/');
                    return;
                }
                navigate('/');
            } catch (err) {
                console.error('認証処理に失敗:', err);
                alert('認証に失敗しました');
                navigate('/');
            }
        };

        handleAuth();
    }, [provider, navigate]);

    return (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '50px' }}>
            <h2>認証中...</h2>
        </div>
    );
};
