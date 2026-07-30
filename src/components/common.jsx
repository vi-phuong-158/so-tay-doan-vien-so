import { useEffect } from 'react';
import { Icon } from './Icon';
import { getReportStatus } from '../lib/status.mjs';

export function Brand({ compact = false }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}>
    <img src="/brand/app-icon.svg" alt="" />
    <div><strong>Sổ tay Đoàn viên số</strong>{!compact && <span>Tuổi trẻ Công an tỉnh Phú Thọ</span>}</div>
  </div>;
}

export function Button({ children, icon, variant = 'primary', onClick, type = 'button', className = '', disabled = false }) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`button button-${variant} ${className}`}>{icon && <Icon name={icon} size={19} />}{children}</button>;
}

export function StatusBadge({ status, label, tone }) {
  const meta = status ? getReportStatus(status) : { label, tone };
  return <span className={`status status-${tone || meta.tone}`}>{label || meta.label}</span>;
}

export function Progress({ value }) {
  return <div className="progress" aria-label={`Tiến độ ${value}%`}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export function PageHeader({ title, subtitle, action, back, navigate }) {
  return <header className="page-header">
    <div className="page-title-wrap">{back && <button className="icon-button back-button" onClick={() => navigate(back)} aria-label="Quay lại"><Icon name="chevron" /></button>}<div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div></div>
    {action}
  </header>;
}

export function SectionHeader({ title, action, onAction }) {
  return <div className="section-header"><h2>{title}</h2>{action && <button onClick={onAction}>{action}<Icon name="arrow" size={16} /></button>}</div>;
}

export function EmptyState({ icon = 'file', title, description, action, onAction }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={30} /></span><h3>{title}</h3><p>{description}</p>{action && <Button variant="secondary" onClick={onAction}>{action}</Button>}</div>;
}

export function Toast({ message, onClose }) {
  useEffect(() => { const id = setTimeout(onClose, 3800); return () => clearTimeout(id); }, [onClose]);
  return <div className="toast"><span><Icon name="check" size={18} /></span>{message}</div>;
}
