import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-[#f6f8fa]">
          <div className="bg-white rounded-lg shadow p-8 max-w-md w-full border border-[#d1d9e0]">
            <h2 className="text-lg font-semibold text-[#d1242f] mb-2">Something went wrong</h2>
            <pre className="text-sm text-[#656d76] whitespace-pre-wrap">{this.state.error.message}</pre>
            <button
              className="mt-4 px-4 py-2 bg-[#0969da] text-white rounded-md text-sm hover:bg-[#0860ca]"
              onClick={() => this.setState({ error: null })}
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
