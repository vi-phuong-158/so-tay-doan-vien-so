import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, EmptyState, PageHeader, Progress } from '../components/common';
import { Icon } from '../components/Icon';
import Skeleton from '../components/Skeleton';
import { supabase } from '../services/supabaseClient';
import { createNqCompetitionService, competitionCsv, filterCompetitionUnits, formatCompetitionNumber, PUBLIC_STATISTICS_MESSAGE, NQ_COMPETITION_PATH } from '../services/nqCompetitionService';

const service = createNqCompetitionService(supabase);
const number = formatCompetitionNumber;
const percent = (value) => value == null ? '—' : `${number(value)}%`;
const date = (value) => value ? new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh'
}).format(new Date(value)) : 'Chưa có hoạt động';
const status = (unit) => unit.ranking_status === 'INCOMPLETE_ROSTER' ? 'Chưa đủ dữ liệu quân số'
  : unit.ranking_status === 'ROSTER_EXCEEDED' ? 'Cần kiểm tra lại quân số' : 'Đủ dữ liệu mô phỏng nội bộ';

function UnitMetrics({ unit, admin }) {
  return <dl className="nq-unit-metrics">
    <div><dt>Người tham gia</dt><dd>{number(unit.participants)}{admin && ` / ${number(unit.eligible_members)}`}</dd></div>
    <div><dt>Lượt thi</dt><dd>{number(unit.attempts)}</dd></div>
    <div><dt>Tỷ lệ đạt</dt><dd>{percent(unit.pass_rate)}</dd></div>
    {admin && <>
      <div><dt>Điểm trung bình</dt><dd>{number(unit.average_best_score)}</dd></div>
      <div><dt>Tỷ lệ tham gia</dt><dd>{percent(unit.completion_rate)}</dd></div>
      <div><dt>Điểm mô phỏng nội bộ</dt><dd>{number(unit.competition_score)}</dd></div>
    </>}
  </dl>;
}

function AdminUnit({ unit, onUpdated }) {
  const [eligible, setEligible] = useState(unit.eligible_members == null ? '' : String(unit.eligible_members));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [detail, setDetail] = useState(null);
  const [offset, setOffset] = useState(0);
  async function save(event) {
    event.preventDefault();
    const count = eligible.trim() === '' ? null : Number(eligible);
    if (count != null && (!Number.isSafeInteger(count) || count < 0 || count > 2147483647)) {
      setError('Số người thuộc diện phải là số nguyên không âm.'); return;
    }
    setBusy(true); setError(''); setSaved(false);
    try { await service.updateEligibleMembers(unit.unit_code, count); await onUpdated(); setSaved(true); }
    catch { setError('Chưa lưu được quân số. Kiểm tra quyền quản trị toàn tỉnh và thử lại.'); }
    finally { setBusy(false); }
  }
  async function loadParticipants(nextOffset) {
    setBusy(true); setError('');
    try { setDetail(await service.adminParticipants(unit.unit_code, nextOffset)); setOffset(nextOffset); }
    catch { setError('Không thể xem danh sách. Chỉ quản trị toàn tỉnh được phép truy cập.'); }
    finally { setBusy(false); }
  }
  return <section className="content-card nq-competition-panel">
    <h2>Quản trị đơn vị</h2>
    <form onSubmit={save} className="nq-roster-form">
      <label htmlFor="nq-eligible">Số đoàn viên/đối tượng cần tham gia</label>
      <input id="nq-eligible" className="form-input" type="number" min="0" step="1" value={eligible}
        placeholder="Chưa cập nhật" onChange={(event) => setEligible(event.target.value)} />
      <Button type="submit" disabled={busy}>Lưu quân số</Button>
    </form>
    {saved && <p role="status">Đã lưu quân số và cập nhật thống kê.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <Button variant="secondary" onClick={() => loadParticipants(0)} disabled={busy}>Xem người tham gia</Button>
    {detail && <>
      <p>Bản ghi lịch sử chưa gắn xã/phường toàn tỉnh: {number(detail.historical_unmapped)}.</p>
      <p>Người tham gia: {number(detail.total)}. Trang {Math.floor(offset / 50) + 1}.</p>
      <div className="nq-admin-participants">{detail.participants.map((person, i) => <article key={`${offset}-${i}`}>
        <h3>{person.full_name}</h3>
        <p>{number(person.attempts)} lượt · Cao nhất {number(person.best_score)} · {number(person.certificate_count)} chứng nhận</p>
        <p>{date(person.latest_activity_at)}</p>
      </article>)}</div>
      {detail.participants.length === 0 && <p>Chưa có dữ liệu tham gia.</p>}
      <div className="nq-competition-actions">
        <Button variant="secondary" disabled={busy || offset === 0} onClick={() => loadParticipants(offset - 50)}>Trang trước</Button>
        <Button variant="secondary" disabled={busy || offset + 50 >= detail.total} onClick={() => loadParticipants(offset + 50)}>Trang sau</Button>
      </div>
    </>}
  </section>;
}

export function NqCompetition({ admin = false }) {
  const { unitCode } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [participation, setParticipation] = useState('');
  const base = admin ? '/admin/nq13-thanh-tich' : NQ_COMPETITION_PATH;
  const load = useCallback(async () => {
    setError('');
    try { setData(await (admin ? service.adminDashboard() : service.dashboard())); }
    catch { setError('Không thể tải bảng tổng hợp. Vui lòng thử lại.'); }
    finally { setLoading(false); }
  }, [admin]);
  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);
  const units = useMemo(() => filterCompetitionUnits(data?.units || [], search, type, participation), [data, search, type, participation]);
  const unit = data?.units.find((row) => row.unit_code === unitCode);
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([competitionCsv(units)], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'NQ13-thanh-tich-don-vi.csv'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const summary = data?.summary;
  const metrics = summary ? [
    ['Đơn vị', number(summary.unit_count)], ['Đơn vị đã triển khai', number(summary.participating_units)],
    ['Đơn vị chưa tham gia', number(summary.missing_units)], ['Người tham gia', number(summary.participants)],
    ['Lượt thi', number(summary.attempts)], ['Tỷ lệ đạt', percent(summary.pass_rate)],
    ...(admin ? [['Người đạt', number(summary.pass_count)], ['Điểm trung bình', number(summary.average_best_score)],
      ['Chứng nhận đã cấp', number(summary.certificate_count)]] : [])
  ] : [];
  return <div className="page page--appbar nq-competition-screen">
    <PageHeader title={unitCode ? unit?.unit_name || 'Thống kê đơn vị' : 'KẾT QUẢ HỌC TẬP NGHỊ QUYẾT XIII'}
      subtitle={admin ? 'Ban Thanh niên · Theo dõi triển khai' : 'Tổng hợp các Chi đoàn tham gia theo xã, phường tỉnh Phú Thọ'} />
    <div className="nq-competition-actions">
      {unitCode && <Link className="button button-secondary" to={base}>Toàn tỉnh</Link>}
      <Button variant="secondary" onClick={load} disabled={loading}><Icon name="refresh" size={18} />Cập nhật</Button>
      {admin && data && <Button variant="secondary" onClick={exportCsv}><Icon name="download" size={18} />Xuất CSV tổng hợp</Button>}
    </div>
    {loading && <Skeleton lines={6} />}
    {error && <div className="form-error" role="alert">{error}</div>}
    {data && <>
      {unitCode ? unit ? <>
        <section className="content-card nq-competition-panel">
          <h2>{unit.unit_name}</h2>
          {admin && <p>Thứ tự mô phỏng nội bộ {unit.rank ?? '—'} · {status(unit)}{!unit.active && ' · Đơn vị ngừng hoạt động (lịch sử)'}</p>}
          {!admin && unit.statistics_suppressed && <p>{PUBLIC_STATISTICS_MESSAGE}</p>}
          <UnitMetrics unit={unit} admin={admin} />
          {admin && <>
            <p>Số đạt: {number(unit.pass_count)} · Chứng nhận: {number(unit.certificate_count)} · Điểm cao nhất: {number(unit.highest_score)}</p>
            <p>Hoạt động gần nhất: {date(unit.latest_activity_at)}</p>
            {unit.eligible_members == null && <p>Chưa cập nhật số người thuộc diện.</p>}
          </>}
          {unit.participants === 0 && <p>Chưa có dữ liệu tham gia.</p>}
        </section>
        {admin && <AdminUnit key={unit.unit_code} unit={unit} onUpdated={load} />}
      </> : <EmptyState title="Không tìm thấy xã/phường phù hợp." /> : <>
        <section className="nq-competition-summary" aria-label="Thống kê toàn tỉnh">
          {metrics.map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}
        </section>
        <section className="content-card nq-competition-panel">
          <h2>Tiến độ triển khai</h2><p>{number(summary.participating_units)} / {number(summary.unit_count)} đơn vị có người tham gia</p>
          <Progress value={summary.unit_count ? summary.participating_units / summary.unit_count * 100 : 0} />
        </section>
        <section aria-labelledby="nq-leaderboard-title">
          <h2 id="nq-leaderboard-title">BẢNG TỔNG HỢP HỌC TẬP NGHỊ QUYẾT XIII</h2>
          <div className="nq-competition-filters">
            <div><label htmlFor="nq-unit-search">Tìm xã/phường</label><input id="nq-unit-search" className="form-input"
              placeholder="Tên xã/phường…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
            <div><label htmlFor="nq-unit-type">Loại đơn vị</label><select id="nq-unit-type" className="form-input" value={type}
              onChange={(event) => setType(event.target.value)}><option value="">Tất cả</option><option value="xa">Xã</option><option value="phuong">Phường</option></select></div>
            <div><label htmlFor="nq-participation">Triển khai</label><select id="nq-participation" className="form-input" value={participation}
              onChange={(event) => setParticipation(event.target.value)}><option value="">Tất cả</option><option value="joined">Đã tham gia</option>
              <option value="missing">Chưa tham gia</option><option value="ready">{admin ? 'Đủ dữ liệu mô phỏng' : 'Đủ ngưỡng công khai'}</option>
              <option value="incomplete">{admin ? 'Chưa đủ dữ liệu mô phỏng' : 'Chưa đủ ngưỡng công khai'}</option></select></div>
          </div>
          <p role="status">{units.length} đơn vị phù hợp</p>
          <div className="nq-competition-table"><table><thead><tr>
            {admin && <th scope="col">Thứ tự nội bộ</th>}<th scope="col">Xã/phường</th><th scope="col">Người tham gia</th><th scope="col">Lượt thi</th>
            <th scope="col">Tỷ lệ đạt</th>{admin && <><th scope="col">Điểm TB</th><th scope="col">Điểm mô phỏng</th></>}
          </tr></thead><tbody>{units.map((u) => <tr key={u.unit_code}>
            {admin && <td data-label="Thứ tự nội bộ">{u.rank ?? '—'}</td>}<th scope="row"><Link to={`${base}/${u.unit_code}`}>{u.unit_name}</Link>
              <small>{admin ? status(u) : u.statistics_suppressed ? PUBLIC_STATISTICS_MESSAGE : 'Đủ ngưỡng công khai'}</small></th>
            <td data-label="Người tham gia">{number(u.participants)}{admin && <> / {number(u.eligible_members)}<small>{percent(u.completion_rate)}</small></>}</td>
            <td data-label="Lượt thi">{number(u.attempts)}</td><td data-label="Tỷ lệ đạt">{percent(u.pass_rate)}</td>
            {admin && <><td data-label="Điểm TB">{number(u.average_best_score)}</td><td data-label="Điểm mô phỏng">{number(u.competition_score)}</td></>}
          </tr>)}</tbody></table></div>
          {units.length === 0 && <EmptyState title="Không tìm thấy xã/phường phù hợp." />}
        </section>
        <section className="content-card nq-competition-panel">
          <h2>ĐƠN VỊ CHƯA CÓ NGƯỜI THAM GIA</h2><p>{number(summary.missing_units)} đơn vị chưa triển khai.</p>
          {(admin || data.config.public_missing_units) && <ul className="nq-missing-units">
            {filterCompetitionUnits(data.units, search, type, 'missing').filter((u) => u.active).map((u) =>
              <li key={u.unit_code}><Link to={`${base}/${u.unit_code}`}>{u.unit_name}</Link></li>)}
          </ul>}
        </section>
        {summary.participants === 0 && <p>Chưa có dữ liệu tham gia.</p>}
      </>}
      <p className="nq-competition-note">Thi lại để học tập; mỗi người chỉ đóng góp một kết quả cao nhất. Với khách, tên trùng trong cùng đơn vị có thể được tính là một người.
        Dữ liệu lượt thi khách được lưu theo chính sách 30 ngày hiện hành.</p>
    </>}
  </div>;
}
