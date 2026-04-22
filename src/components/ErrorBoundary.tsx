import React from 'react';

interface Props {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface State {
    hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error) {
        // Silent in production — avoid leaking internals
        if (import.meta.env.DEV) {
            console.error('ErrorBoundary caught:', error);
        }
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback || (
                <div className="p-4 text-center text-sm text-gray-500">
                    <p>Cos poszlo nie tak.</p>
                    <button
                        type="button"
                        onClick={() => this.setState({ hasError: false })}
                        className="mt-2 text-gray-900 underline hover:text-gray-700"
                    >
                        Sprobuj ponownie
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
