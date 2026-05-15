import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch() {}

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" }}>
          <h1 style={{ margin: 0, fontSize: 18 }}>UI crashed</h1>
          <pre style={{ marginTop: 12, whiteSpace: "pre-wrap", color: "#b91c1c" }}>
            {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

