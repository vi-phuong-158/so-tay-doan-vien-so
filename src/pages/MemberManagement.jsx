import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, EmptyState, PageHeader, Toast } from '../components/common';
import Skeleton from '../components/Skeleton';
import { supabase } from '../services/supabaseClient';
import {
  GENDER_VALUES,
  MEMBER_LIST_PAGE_SIZE,
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
  memberErrorMessage,
  memberStatusTone,
} from '../lib/memberDisplay.mjs';

const memberService = createMemberService(supabase, { baseUrl: import.meta.env.VITE_MEMBER_API_URL });

const EMPTY_FORM = {
  fullName: '',
  workUnitCode: '',
  dateOfBirth: '',
  gender: '',
  jobTitle: '',
  memberStatus: 'ACTIVE',
  politicalTheoryLevel: '',
  youthPosition: '',
  youthBoardPosition: '',
  externalRefNote: '',
};

export function MemberManagement() {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [workUnitFilter, setWorkUnitFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [youthPositionFilter, setYouthPositionFilter] = useState('');
  const [sort, setSort] = useState('full_name_asc');

  const [organizations, setOrganizations] = useState([]);
  const [scope, setScope] = useState(null);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([memberService.getOrganizationDirectory(), memberService.getScope()])
      .then(([orgs, scopeResult]) => {
        if (!mounted) return;
        setOrganizations(orgs);
        setScope(scopeResult);
      })
      .catch(() => {
        // Non-fatal: the org picker/scope hint is a UX convenience only. The list/create requests
        // below still work (or fail closed server-side) without it.
      });
    return () => {
      mounted = false;
    };
  }, []);

  const loadPage = useCallback(
    (targetPage) => {
      let mounted = true;
      if (targetPage === 0) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      memberService
        .listMembers({
          page: targetPage,
          pageSize: MEMBER_LIST_PAGE_SIZE,
          search,
          workUnitCode: workUnitFilter,
          memberStatus: statusFilter,
          youthPosition: youthPositionFilter,
          sort,
        })
        .then((result) => {
          if (!mounted) return;
          setMembers((previous) => (targetPage === 0 ? result.items : [...previous, ...result.items]));
          setTotal(result.total);
          setHasMore(result.hasMore);
          setPage(targetPage);
        })
        .catch((requestError) => {
          if (mounted) setError(requestError);
        })
        .finally(() => {
          if (!mounted) return;
          setLoading(false);
          setLoadingMore(false);
        });

      return () => {
        mounted = false;
      };
    },
    [search, workUnitFilter, statusFilter, youthPositionFilter, sort]
  );

  useEffect(() => {
    let cleanup;
    const timer = setTimeout(() => {
      cleanup = loadPage(0);
    }, 0);
    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [loadPage]);

  const submitSearch = (event) => {
    event.preventDefault();
    setSearch(searchInput.trim());
  };

  const openCreate = () => {
    setCreating(true);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const closeCreate = () => {
    setCreating(false);
    setFormError(null);
  };

  const submitCreate = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!form.fullName.trim() || !form.workUnitCode.trim()) {
      setFormError({ message: 'Vui lòng nhập họ tên và chọn đơn vị công tác.' });
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await memberService.createMember(form);
      setToast('Đã thêm đoàn viên.');
      closeCreate();
      loadPage(0);
    } catch (requestError) {
      setFormError(requestError);
    } finally {
      setSaving(false);
    }
  };

  const scopedOrganizations = scope?.roles?.some((r) => r.is_global)
    ? organizations
    : organizations.filter((org) => scope?.roles?.some((r) => r.org_codes?.includes(org.code)) ?? true);

  return (
    <div className="page admin-reports-page">
      <PageHeader
        title="Quản lý đoàn viên"
        subtitle={total ? `${total} đoàn viên trong phạm vi quản lý` : undefined}
        action={
          <div className="campaign-form-actions">
            {scope?.roles?.some((r) => r.role_code === 'YOUTH_ADMIN') && (
              <Button icon="upload" variant="secondary" onClick={() => navigate('/admin/quan-ly-doan-vien/import')}>
                Import Excel
              </Button>
            )}
            <Button icon="user" onClick={openCreate}>Thêm đoàn viên</Button>
          </div>
        }
      />

      <div className="document-controls">
        <form className="dashboard-search" onSubmit={submitSearch} role="search">
          <label htmlFor="member-search">Tìm kiếm</label>
          <input
            id="member-search"
            type="search"
            placeholder="Tìm theo họ tên"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Button type="submit" icon="search" variant="secondary">Tìm</Button>
        </form>

        <div className="dashboard-filters">
          <label htmlFor="member-work-unit">
            Đơn vị
            <select id="member-work-unit" value={workUnitFilter} onChange={(e) => setWorkUnitFilter(e.target.value)}>
              <option value="">Tất cả đơn vị</option>
              {scopedOrganizations.map((org) => (
                <option key={org.code} value={org.code}>{org.name}</option>
              ))}
            </select>
          </label>
          <label htmlFor="member-status">
            Trạng thái
            <select id="member-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Tất cả trạng thái</option>
              {MEMBER_STATUS_VALUES.map((value) => (
                <option key={value} value={value}>{MEMBER_STATUS_LABELS[value] ?? value}</option>
              ))}
            </select>
          </label>
          <label htmlFor="member-youth-position">
            Chức danh Đoàn
            <select id="member-youth-position" value={youthPositionFilter} onChange={(e) => setYouthPositionFilter(e.target.value)}>
              <option value="">Tất cả</option>
              {YOUTH_POSITION_VALUES.map((value) => (
                <option key={value} value={value}>{YOUTH_POSITION_LABELS[value] ?? value}</option>
              ))}
            </select>
          </label>
          <label htmlFor="member-sort">
            Sắp xếp
            <select id="member-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="full_name_asc">Tên A-Z</option>
              <option value="updated_at_desc">Cập nhật gần nhất</option>
            </select>
          </label>
        </div>
      </div>

      {creating && (
        <form className="campaign-form" onSubmit={submitCreate} noValidate>
          <fieldset>
            <legend>Thêm đoàn viên mới</legend>

            <label htmlFor="member-full-name">
              Họ và tên *
              <input
                id="member-full-name"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </label>

            <div className="campaign-form-grid">
              <label htmlFor="member-form-work-unit">
                Đơn vị công tác *
                <select
                  id="member-form-work-unit"
                  value={form.workUnitCode}
                  onChange={(e) => setForm({ ...form, workUnitCode: e.target.value })}
                >
                  <option value="">— Chọn đơn vị —</option>
                  {scopedOrganizations.map((org) => (
                    <option key={org.code} value={org.code}>{org.name}</option>
                  ))}
                </select>
              </label>
              <label htmlFor="member-form-dob">
                Ngày sinh
                <input
                  id="member-form-dob"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                />
              </label>
              <label htmlFor="member-form-gender">
                Giới tính
                <select id="member-form-gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                  <option value="">— Không rõ —</option>
                  {GENDER_VALUES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            </div>

            <div className="campaign-form-grid">
              <label htmlFor="member-form-job-title">
                Chức vụ
                <input id="member-form-job-title" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
              </label>
              <label htmlFor="member-form-youth-position">
                Chức danh Đoàn
                <select id="member-form-youth-position" value={form.youthPosition} onChange={(e) => setForm({ ...form, youthPosition: e.target.value })}>
                  <option value="">— Không có —</option>
                  {YOUTH_POSITION_VALUES.map((value) => (
                    <option key={value} value={value}>{YOUTH_POSITION_LABELS[value] ?? value}</option>
                  ))}
                </select>
              </label>
              <label htmlFor="member-form-youth-board-position">
                Chức danh Ban Thanh niên
                <select id="member-form-youth-board-position" value={form.youthBoardPosition} onChange={(e) => setForm({ ...form, youthBoardPosition: e.target.value })}>
                  <option value="">— Không có —</option>
                  {YOUTH_BOARD_POSITION_VALUES.map((value) => (
                    <option key={value} value={value}>{YOUTH_BOARD_POSITION_LABELS[value] ?? value}</option>
                  ))}
                </select>
              </label>
            </div>

            <label htmlFor="member-form-theory-level">
              Trình độ lý luận chính trị
              <select id="member-form-theory-level" value={form.politicalTheoryLevel} onChange={(e) => setForm({ ...form, politicalTheoryLevel: e.target.value })}>
                <option value="">— Chưa có thông tin —</option>
                {POLITICAL_THEORY_LEVEL_VALUES.map((value) => (
                  <option key={value} value={value}>{POLITICAL_THEORY_LEVEL_LABELS[value] ?? value}</option>
                ))}
              </select>
            </label>

            <label htmlFor="member-form-note">
              Ghi chú
              <textarea id="member-form-note" value={form.externalRefNote} onChange={(e) => setForm({ ...form, externalRefNote: e.target.value })} />
            </label>

            {formError && <p className="form-error" role="alert">{formError.code ? memberErrorMessage(formError) : formError.message}</p>}

            <div className="campaign-form-actions">
              <Button type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Thêm đoàn viên'}</Button>
              <Button variant="secondary" onClick={closeCreate} disabled={saving}>Hủy</Button>
            </div>
          </fieldset>
        </form>
      )}

      {loading && <Skeleton lines={6} />}

      {!loading && error && (
        <div className="form-error" role="alert">
          <p>{memberErrorMessage(error)}</p>
          <Button variant="secondary" onClick={() => loadPage(0)}>Thử lại</Button>
        </div>
      )}

      {!loading && !error && members.length === 0 && (
        <EmptyState
          icon="user"
          title="Chưa có đoàn viên"
          description="Chưa có đoàn viên nào trong phạm vi quản lý của bạn."
          action="Thêm đoàn viên"
          onAction={openCreate}
        />
      )}

      {!loading && !error && members.length > 0 && (
        <div className="campaign-list">
          {members.map((member) => (
            <Link key={member.id} to={`/quan-ly-doan-vien/${member.id}`} className="campaign-list-item">
              <div>
                <div className="doc-tags">
                  <span className={`status status-${memberStatusTone(member.memberStatus)}`}>
                    {MEMBER_STATUS_LABELS[member.memberStatus] ?? member.memberStatus}
                  </span>
                  {member.youthPosition && <span className="status status-neutral">{YOUTH_POSITION_LABELS[member.youthPosition]}</span>}
                  {member.youthBoardPosition && <span className="status status-neutral">{YOUTH_BOARD_POSITION_LABELS[member.youthBoardPosition]}</span>}
                </div>
                <h2>{member.fullName}</h2>
                <p>
                  {organizations.find((org) => org.code === member.workUnitCode)?.name ?? member.workUnitCode}
                  {member.jobTitle ? ` • ${member.jobTitle}` : ''}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && !error && hasMore && (
        <Button variant="secondary" className="document-load-more" disabled={loadingMore} onClick={() => loadPage(page + 1)}>
          {loadingMore ? 'Đang tải…' : 'Tải thêm'}
        </Button>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
