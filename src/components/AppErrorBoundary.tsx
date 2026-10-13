import { Component, type ReactNode } from "react";

/** Render failures must leave a recovery action instead of an empty page. */
export class AppErrorBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="app"><section className="panel" role="alert">
      <h1>页面暂时无法显示</h1>
      <p>请重新加载以读取已保存的书库；未保存的修改可能丢失。</p>
      <button className="btn btn-primary" onClick={() => window.location.reload()}>重新加载页面</button>
    </section></main>;
  }
}
