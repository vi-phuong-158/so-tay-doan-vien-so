import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, PageHeader, Toast } from '../components/common';
import Skeleton from '../components/Skeleton';
import { supabase } from '../services/supabaseClient';
import {
  GENDER_VALUES,
  MEMBER_STATUS_VALUES,
  POLITICAL_THEORY_LEVEL_VALUES,
  YOUTH_BOARD_POSITION_VALUES,
  YOUTH_POSITION_VALUES,
  createMemberService,
} from '../services/memberService';
import {
  MEMBER_STATUS_LABELS,
  POLITICAL_THEORY_LEVEL_LABELS,
  YOUTH_BOARD_POSITION_LABELS,
  YOUTH_POSITION_LABELS,
  describeAuditEntry,
  memberErrorMessage,
  memberStatusTone,
} from '../lib/memberDisplay.mjs';

const AUDIT_PAGE_SIZE = 20;

const memberService = createMemberService(supabase, { baseUrl: import.meta.env.VITE_MEMBER_API_URL });
const LIST_PATH = '/quan-ly-doan-vien';

function toForm(member) {
  return {
    fullName: member.fullName ?? '',
    dateOfBirth: member.dateOfBirth ?? '',
    gender: member.gender ?? '',
    jobTitle: member.jobTitle ?? '',
    memberStatus: member.memberStatus ?? 'ACTIVE',
    politicalTheoryLevel: member.politicalTheoryLevel ?? '',
    youthPosition: member.youthPosition ?? '',
    youthBoardPosition: member.youthBoardPosition ?? '',
    externalRefNote: member.externalRefNote ?? '',
  };
}

function MetaRow({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function MemberDetail() {
  const { memberId } = useParams();
  const navigate = useNavigate();

  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [confirmArchive, setConfirmArchive] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const [auditLogs, setAuditLogs] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState(null);

  const loadMember = useCallback(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    memberService
      .getMember(memberId)
      .then((result) => {
        if (mounted) setMember(result);
      })
      .catch((requestError) => {
        if (mounted) setError(requestError);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [memberId]);

  // Deferred so the effect body performs no synchronous setState (project lint rule).
  useEffect(() => {
    let cleanup;
    const timer = setTimeout(() => {
      cleanup = loadMember();
    }, 0);
    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [loadMember]);

  // Independent load path (own loading/error state) so an audit-history failure never blanks the
  // Member's own info — the two panels degrade separately (P5.5-07R requirement).
  const loadAudit = useCallback((offset = 0) => {
    let mounted = true;
    setAuditLoading(true);
    setAuditError(null);
    memberService
      .getMemberAuditHistory(memberId, { limit: AUDIT_PAGE_SIZE, offset })
      .then((result) => {
        if (!mounted) return;
        setAuditLogs((current) => (offset === 0 ? result.logs : [...current, ...result.logs]));
        setAuditTotal(result.total);
        setAuditOffset(result.offset);
      })
      .catch((requestError) => {
        if (mounted) setAuditError(requestError);
      })
      .finally(() => {
        if (mounted) setAuditLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [memberId]);

  useEffect(() => {
    let cleanup;
    const timer = setTimeout(() => {
      cleanup = loadAudit(0);
    }, 0);
    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [loadAudit]);

  const openEdit = () => {
    setForm(toForm(member));
    setFormError(null);
    setEditing(true);
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    if (saving || !form.fullName.trim()) {
      if (!form?.fullName?.trim()) setFormError({ message: 'Họ và tên là bắt buộc.' });
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const updated = await memberService.updateMember(memberId, form);
      setMember(updated);
      setEditing(false);
      setToast('Đã cập nhật thông tin đoàn viên.');
    } catch (requestError) {
      setFormError(requestError);
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async () => {
    if (statusBusy) return;
    setStatusBusy(true);
    setError(null);
    try {
      const nextStatus = member.memberStatus === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED';
      const updated = await memberService.setMemberStatus(memberId, nextStatus);
      setMember(updated);
      setToast(nextStatus === 'ARCHIVED' ? 'Đã lưu trữ đoàn viên.' : 'Đã khôi phục đoàn viên về trạng thái sinh hoạt.');
      setConfirmArchive(false);
    } catch (requestError) {
      setError(requestError);
      setConfirmArchive(false);
    } finally {
      setStatusBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Chi tiết đoàn viên" back={LIST_PATH} navigate={navigate} />

      {loading && <Skeleton lines={8} />}

      {!loading && error && (
        <div className="form-error" role="alert">
          <p>{memberErrorMessage(error)}</p>
          <Button variant="secondary" onClick={loadMember}>Thử lại</Button>
        </div>
      )}

      {!loading && !error && !member && (
        <EmptyState icon="user" title="Không tìm thấy đoàn viên" description="Đoàn viên này không tồn tại hoặc ngoài phạm vi quản lý của bạn." />
      )}

      {!loading && !error && member && !editing && (
        <>
          <div className="doc-tags" style={{ marginBottom: 12 }}>
            <span className={`status status-${memberStatusTone(member.memberStatus)}`}>
              {MEMBER_STATUS_LABELS[member.memberStatus] ?? member.memberStatus}
            </span>
          </div>
          <h1 style={{ marginBottom: 16 }}>{member.fullName}</h1>

          <div className="content-card">
            <div className="info-grid">
              <MetaRow label="Đơn vị công tác" value={member.workUnitCode} />
              <MetaRow label="Chức vụ" value={member.jobTitle} />
              <MetaRow label="Ngày sinh" value={member.dateOfBirth} />
              <MetaRow label="Giới tính" value={member.gender} />
              <MetaRow label="Chức danh Đoàn" value={member.youthPosition ? YOUTH_POSITION_LABELS[member.youthPosition] : null} />
              <MetaRow label="Chức danh Ban Thanh niên" value={member.youthBoardPosition ? YOUTH_BOARD_POSITION_LABELS[member.youthBoardPosition] : null} />
              <MetaRow label="Trình độ lý luận chính trị" value={member.politicalTheoryLevel ? POLITICAL_THEORY_LEVEL_LABELS[member.politicalTheoryLevel] : null} />
              <MetaRow label="Ghi chú" value={member.externalRefNote} />
            </div>
          </div>

          <div className="campaign-form-actions" style={{ marginTop: 20 }}>
            <Button onClick={openEdit}>Sửa thông tin</Button>
            {member.memberStatus === 'ARCHIVED' ? (
              <Button variant="secondary" disabled={statusBusy} onClick={toggleArchive}>
                {statusBusy ? 'Đang xử lý…' : 'Khôi phục sinh hoạt'}
              </Button>
            ) : (
              <Button variant="secondary" disabled={statusBusy} onClick={() => setConfirmArchive(true)}>
                Lưu trữ
              </Button>
            )}
          </div>

          <div className="content-card" style={{ marginTop: 16 }}>
            <h2>Lịch sử thay đổi</h2>

            {auditLoading && auditLogs.length === 0 && <Skeleton lines={3} />}

            {!auditLoading && auditError && (
              <div className="form-error" role="alert">
                <p>{memberErrorMessage(auditError)}</p>
                <Button variant="secondary" onClick={() => loadAudit(0)}>Thử lại</Button>
              </div>
            )}

            {!auditError && !auditLoading && auditLogs.length === 0 && (
              <p>Chưa có thay đổi nào được ghi nhận.</p>
            )}

            {!auditError && auditLogs.length > 0 && (
              <ul className="campaign-list">
                {auditLogs.map((entry) => {
                  const described = describeAuditEntry(entry);
                  return (
                    <li key={entry.id} className="campaign-list-item">
                      <div className="doc-tags">
                        <span>{new Date(entry.createdAt).toLocaleString('vi-VN')}</span>
                        <span className={`status status-${entry.action === 'CREATE' ? 'success' : 'info'}`}>
                          {described.actionLabel}
                        </span>
                        {entry.importJobId && <span>Tạo qua import</span>}
                      </div>
                      {described.changes.length === 0 && <p>Không có trường nào được ghi nhận thay đổi.</p>}
                      {described.changes.map((change) => (
                        <p key={change.field}>
                          <strong>{change.label}:</strong>{' '}
                          {entry.action === 'CREATE' ? change.after : `${change.before} → ${change.after}`}
                        </p>
                      ))}
                    </li>
                  );
                })}
              </ul>
            )}

            {!auditError && auditLoading && auditLogs.length > 0 && <p>Đang tải…</p>}

            {!auditError && !auditLoading && auditOffset + auditLogs.length < auditTotal && (
              <Button variant="secondary" className="document-load-more" onClick={() => loadAudit(auditOffset + auditLogs.length)}>
                Tải thêm
              </Button>
            )}
          </div>
        </>
      )}

      {!loading && !error && member && editing && (
        <form className="campaign-form" onSubmit={submitEdit} noValidate>
          <fieldset>
            <legend>Sửa thông tin đoàn viên</legend>

            <label htmlFor="edit-full-name">
              Họ và tên *
              <input id="edit-full-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </label>

            <div className="campaign-form-grid">
              <label htmlFor="edit-dob">
                Ngày sinh
                <input id="edit-dob" type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
              </label>
              <label htmlFor="edit-gender">
                Giới tính
                <select id="edit-gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                  <option value="">— Không rõ —</option>
                  {GENDER_VALUES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label htmlFor="edit-job-title">
                Chức vụ
                <input id="edit-job-title" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
              </label>
            </div>

            <div className="campaign-form-grid">
              <label htmlFor="edit-status">
                Trạng thái
                <select id="edit-status" value={form.memberStatus} onChange={(e) => setForm({ ...form, memberStatus: e.target.value })}>
                  {MEMBER_STATUS_VALUES.map((value) => (
                    <option key={value} value={value}>{MEMBER_STATUS_LABELS[value] ?? value}</option>
                  ))}
                </select>
              </label>
              <label htmlFor="edit-youth-position">
                Chức danh Đoàn
                <select id="edit-youth-position" value={form.youthPosition} onChange={(e) => setForm({ ...form, youthPosition: e.target.value })}>
                  <option value="">— Không có —</option>
                  {YOUTH_POSITION_VALUES.map((value) => (
                    <option key={value} value={value}>{YOUTH_POSITION_LABELS[value] ?? value}</option>
                  ))}
                </select>
              </label>
              <label htmlFor="edit-youth-board-position">
                Chức danh Ban Thanh niên
                <select id="edit-youth-board-position" value={form.youthBoardPosition} onChange={(e) => setForm({ ...form, youthBoardPosition: e.target.value })}>
                  <option value="">— Không có —</option>
                  {YOUTH_BOARD_POSITION_VALUES.map((value) => (
                    <option key={value} value={value}>{YOUTH_BOARD_POSITION_LABELS[value] ?? value}</option>
                  ))}
                </select>
              </label>
            </div>

            <label htmlFor="edit-theory-level">
              Trình độ lý luận chính trị
              <select id="edit-theory-level" value={form.politicalTheoryLevel} onChange={(e) => setForm({ ...form, politicalTheoryLevel: e.target.value })}>
                <option value="">— Chưa có thông tin —</option>
                {POLITICAL_THEORY_LEVEL_VALUES.map((value) => (
                  <option key={value} value={value}>{POLITICAL_THEORY_LEVEL_LABELS[value] ?? value}</option>
                ))}
              </select>
            </label>

            <label htmlFor="edit-note">
              Ghi chú
              <textarea id="edit-note" value={form.externalRefNote} onChange={(e) => setForm({ ...form, externalRefNote: e.target.value })} />
            </label>

            {formError && <p className="form-error" role="alert">{formError.code ? memberErrorMessage(formError) : formError.message}</p>}

            <div className="campaign-form-actions">
              <Button type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</Button>
              <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>Hủy</Button>
            </div>
          </fieldset>
        </form>
      )}

      {confirmArchive && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label="Lưu trữ đoàn viên">
          <div className="confirm-dialog">
            <h2>Lưu trữ đoàn viên</h2>
            <p>Lưu trữ “{member?.fullName}”? Đoàn viên sẽ không còn xuất hiện trong danh sách sinh hoạt, nhưng dữ liệu vẫn được giữ lại để tra cứu.</p>
            <div className="campaign-form-actions">
              <Button onClick={toggleArchive} disabled={statusBusy}>{statusBusy ? 'Đang xử lý…' : 'Lưu trữ'}</Button>
              <Button variant="secondary" onClick={() => setConfirmArchive(false)} disabled={statusBusy}>Hủy</Button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
