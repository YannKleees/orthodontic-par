import { Component, type ReactNode } from "react";

/** Shows the error instead of a blank page when a component crashes. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-6 text-sm">
        <p className="font-semibold text-red-700">This view failed to load.</p>
        <pre className="mt-2 whitespace-pre-wrap text-gray-700">{this.state.error.message}</pre>
        <button className="mt-3 underline" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
