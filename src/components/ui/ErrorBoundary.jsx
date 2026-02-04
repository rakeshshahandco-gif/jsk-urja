import React from 'react';
import { Button } from '@/components/ui';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '40px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    minHeight: '400px',
                    textAlign: 'center',
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    borderRadius: '8px',
                    margin: '20px'
                }}>
                    <AlertTriangle size={48} color="#EF4444" style={{ marginBottom: '16px' }} />
                    <h2 style={{ color: '#991B1B', marginBottom: '8px' }}>Something went wrong</h2>
                    <p style={{ color: '#B91C1C', marginBottom: '24px', maxWidth: '500px' }}>
                        {this.state.error?.message || 'An unexpected error occurred while loading this page.'}
                    </p>
                    <Button onClick={this.handleReload} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <RefreshCw size={16} />
                        Reload Page
                    </Button>
                    {this.state.errorInfo && (
                        <details style={{ marginTop: '20px', textAlign: 'left', maxWidth: '800px', overflow: 'auto' }}>
                            <summary style={{ cursor: 'pointer', color: '#6B7280' }}>Technical Details</summary>
                            <pre style={{ fontSize: '12px', marginTop: '8px', padding: '10px', background: '#F3F4F6', borderRadius: '4px' }}>
                                {this.state.error && this.state.error.toString()}
                                <br />
                                {this.state.errorInfo.componentStack}
                            </pre>
                        </details>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}
