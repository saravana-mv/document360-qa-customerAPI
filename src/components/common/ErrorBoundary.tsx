import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props { children: ReactNode; }
interface State { error: Error | null; componentStack: string | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: unknown): State {
    // Guard against non-Error throws (e.g. plain objects, strings)
    if (error instanceof Error) return { error, componentStack: null };
    return { error: new Error(String(error)), componentStack: null };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Log full details to console for debugging
    console.error("[ErrorBoundary] caught:", error);
    if (info.componentStack) {
      console.error("[ErrorBoundary] component stack:", info.componentStack);
      this.setState({ componentStack: info.componentStack });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-[#f6f8fa]">
          <div className="bg-white rounded-lg shadow p-8 max-w-lg w-full border border-[#d1d9e0]">
            <h2 className="text-lg font-semibold text-[#d1242f] mb-2">Something went wrong</h2>
            <pre className="text-sm text-[#656d76] whitespace-pre-wrap mb-2">{this.state.error.message}</pre>
            {this.state.error.stack && (
              <details className="mb-3">
                <summary className="text-xs text-[#656d76] cursor-pointer hover:text-[#1f2328]">Stack trace</summary>
                <pre className="text-xs text-[#656d76] whitespace-pre-wrap mt-1 p-2 bg-[#f6f8fa] rounded border border-[#d1d9e0] max-h-48 overflow-auto">{this.state.error.stack}</pre>
              </details>
            )}
            {this.state.componentStack && (
              <details className="mb-3">
                <summary className="text-xs text-[#656d76] cursor-pointer hover:text-[#1f2328]">Component stack</summary>
                <pre className="text-xs text-[#656d76] whitespace-pre-wrap mt-1 p-2 bg-[#f6f8fa] rounded border border-[#d1d9e0] max-h-48 overflow-auto">{this.state.componentStack}</pre>
              </details>
            )}
            <button
              className="mt-2 px-4 py-2 bg-[#0969da] text-white rounded-md text-sm hover:bg-[#0860ca]"
              onClick={() => this.setState({ error: null, componentStack: null })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
