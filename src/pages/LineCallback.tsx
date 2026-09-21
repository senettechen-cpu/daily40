
import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

export const LineCallback: React.FC = () => {
    const { loginWithCustomToken } = useAuth();
    const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        const handleCallback = async () => {
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');

            if (!code) {
                setStatus('error');
                setErrorMsg('No authorization code found');
                return;
            }

            try {
                // Exchange code for custom token via backend
                const rawUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
                const baseUrl = rawUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');

                const response = await fetch(`${baseUrl}/api/auth/line`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ code })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to exchange token');
                }

                // Login with Custom Token
                await loginWithCustomToken(data.token);
                setStatus('success');

                // Redirect to home
                window.location.href = '/';

            } catch (err: any) {
                console.error('LINE Login Error:', err);
                setStatus('error');
                setErrorMsg(err.message || 'Unknown error occurred');
            }
        };

        handleCallback();
    }, [loginWithCustomToken]);

    return (
        <div className="h-screen bg-black flex flex-col items-center justify-center text-imperial-gold font-mono">
            <div className="text-xl tracking-widest mb-4">
                LINE PROTOCOL LINK
            </div>

            {status === 'processing' && (
                <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 border-4 border-imperial-gold border-t-transparent rounded-full animate-spin" />
                    <span className="animate-pulse">ESTABLISHING VOX-LINK...</span>
                </div>
            )}

            {status === 'success' && (
                <div className="text-green-500 animate-pulse">
                    ACCESS GRANTED. REDIRECTING...
                </div>
            )}

            {status === 'error' && (
                <div className="text-red-500 text-center max-w-md">
                    <div className="text-4xl mb-2">⚠ ERROR ⚠</div>
                    <div>CONNECTION SEVERED</div>
                    <div className="text-sm mt-4 text-zinc-500">{errorMsg}</div>
                    <a href="/" className="mt-8 inline-block border border-red-500 px-4 py-2 hover:bg-red-500 hover:text-black transition-colors">
                        RETURN TO LOGIN
                    </a>
                </div>
            )}
        </div>
    );
};
