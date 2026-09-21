import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 bg-red-950 text-white min-h-screen flex flex-col items-center justify-center font-mono">
                    <h1 className="text-2xl font-bold mb-4">CRITICAL SYSTEM FAILURE</h1>
                    <div className="bg-black p-4 rounded border border-red-500 max-w-2xl overflow-auto">
                        <p className="text-red-400 font-bold mb-2">{this.state.error?.toString()}</p>
                        <p className="text-zinc-500 text-xs">Please report this error code to the Tech-Priest.</p>
                    </div>
                    <button
                        className="mt-8 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded mr-4"
                        onClick={() => window.location.reload()}
                    >
                        REBOOT SYSTEM
                    </button>
                    <button
                        className="mt-8 px-4 py-2 bg-red-900/50 border border-red-500 hover:bg-red-900 text-red-200 rounded"
                        onClick={() => {
                            localStorage.clear();
                            window.location.reload();
                        }}
                    >
                        FACTORY RESET (CLEAR DATA)
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
