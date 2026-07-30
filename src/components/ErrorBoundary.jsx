import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error) { console.error('Application boundary:', error); }
  render() {
    if (this.state.hasError) {
      return <div className="page"><div className="empty-state"><span className="empty-icon">!</span><h3>Đã xảy ra lỗi</h3><p>Hệ thống chưa thể hiển thị nội dung. Vui lòng tải lại trang.</p><button className="button button-primary" onClick={() => window.location.reload()}>Thử lại</button></div></div>;
    }
    return this.props.children;
  }
}
