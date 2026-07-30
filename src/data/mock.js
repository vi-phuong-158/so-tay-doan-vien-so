export const campaigns = [
  { id: 'bao-cao-thang-7', title: 'Báo cáo kết quả công tác Đoàn tháng 7/2026', issuer: 'Ban Thanh niên Công an tỉnh', due: '2026-08-02T17:00:00+07:00', status: 'PENDING', progress: 72, submitted: 144, total: 200, files: ['Mẫu báo cáo tháng 7.docx'] },
  { id: 'chien-dich-he', title: 'Tổng hợp hoạt động Chiến dịch Thanh niên tình nguyện hè', issuer: 'Ban Thanh niên Công an tỉnh', due: '2026-08-08T17:00:00+07:00', status: 'SUBMITTED', progress: 44, submitted: 88, total: 200, files: ['Phụ lục số liệu.xlsx'] },
  { id: 'sang-kien', title: 'Đăng ký công trình, phần việc thanh niên năm 2026', issuer: 'Câu lạc bộ đổi mới sáng tạo', due: '2026-07-28T17:00:00+07:00', status: 'NEEDS_SUPPLEMENT', progress: 93, submitted: 186, total: 200, files: ['Phiếu đăng ký.docx'] }
];

export const documents = [
  { id: 'hd-12', number: '12-HD/ĐTN', type: 'Hướng dẫn', title: 'Hướng dẫn tổ chức sinh hoạt Chi đoàn chủ điểm năm 2026', authority: 'Ban Thanh niên Công an tỉnh', date: '25/07/2026', effective: 'Còn hiệu lực', summary: 'Hướng dẫn nội dung, hình thức và tiêu chí tổ chức sinh hoạt Chi đoàn chủ điểm trong toàn lực lượng.' },
  { id: 'kh-88', number: '88-KH/ĐTN', type: 'Kế hoạch', title: 'Kế hoạch tổ chức Chiến dịch Thanh niên tình nguyện hè 2026', authority: 'Ban Thanh niên Công an tỉnh', date: '18/07/2026', effective: 'Còn hiệu lực', summary: 'Triển khai các hoạt động tình nguyện, chuyển đổi số và hỗ trợ nhân dân trên địa bàn.' },
  { id: 'bm-01', number: 'BM-01', type: 'Biểu mẫu', title: 'Mẫu báo cáo kết quả công tác Đoàn theo tháng', authority: 'Ban Thanh niên Công an tỉnh', date: '10/07/2026', effective: 'Đang áp dụng', summary: 'Biểu mẫu chuẩn để các cơ sở Đoàn tổng hợp kết quả, số liệu và hình ảnh hoạt động.' },
  { id: 'qc-clb', number: '03-QC/CLB', type: 'Quy chế', title: 'Quy chế hoạt động Câu lạc bộ đổi mới sáng tạo', authority: 'Câu lạc bộ đổi mới sáng tạo', date: '04/07/2026', effective: 'Còn hiệu lực', summary: 'Quy định nguyên tắc tiếp nhận, nghiên cứu, thử nghiệm và nhân rộng giải pháp.' }
];

export const topics = [
  { id: 'chuyen-doi-so', title: 'Thanh niên Công an tiên phong chuyển đổi số', progress: 75, duration: '35 phút', resources: 4, status: 'Đang học', description: 'Nhận diện vai trò của đoàn viên trong chuyển đổi số, bảo đảm an toàn dữ liệu và xây dựng sáng kiến từ thực tiễn.' },
  { id: 'ky-nang-doan', title: 'Kỹ năng tổ chức sinh hoạt Chi đoàn hiệu quả', progress: 0, duration: '28 phút', resources: 3, status: 'Chưa học', description: 'Phương pháp chuẩn bị nội dung, điều hành, tạo tương tác và đánh giá một buổi sinh hoạt.' },
  { id: 'an-toan-mang', title: 'An toàn thông tin trong hoạt động Đoàn', progress: 100, duration: '22 phút', resources: 5, status: 'Hoàn thành', description: 'Nguyên tắc xử lý tài liệu, sử dụng nền tảng số và phòng tránh lộ lọt thông tin.' }
];

export const projects = [
  { id: 'ban-do-cong-an-so', status: 'Đang triển khai mở rộng', title: 'Bản đồ Công an số tỉnh Phú Thọ', team: 'CLB Đổi mới sáng tạo', progress: 82, summary: 'Hỗ trợ người dân tra cứu đúng trụ sở, điểm cấp căn cước và thủ tục hành chính bằng bản đồ trực quan.', result: 'Đã phủ dữ liệu cơ bản toàn tỉnh và tiếp tục bổ sung điểm phục vụ.' },
  { id: 'f-alert', status: 'Đã triển khai hiệu quả', title: 'F-Alert — cảnh báo quản lý người nước ngoài', team: 'Phòng An ninh đối ngoại', progress: 100, summary: 'Tin học hóa quy trình rà soát, tổng hợp và cảnh báo phục vụ quản lý người nước ngoài.', result: 'Rút ngắn thời gian tổng hợp, tăng khả năng phát hiện thông tin cần chú ý.' },
  { id: 'tro-ly-thu-tuc', status: 'Đang thử nghiệm', title: 'Trợ lý AI hướng dẫn thủ tục hành chính', team: 'Nhóm AI thanh niên', progress: 64, summary: 'Hỏi đáp có dẫn nguồn, tạo checklist hồ sơ và chỉ dẫn địa điểm thực hiện phù hợp.', result: 'Đã hoàn thiện luồng hỏi đáp cơ bản và kiểm thử dữ liệu nguồn.' }
];

export const problems = [
  { id: 'bt-001', title: 'Tổng hợp báo cáo từ nhiều Chi đoàn còn thủ công', status: 'RESEARCHING', date: '28/07/2026', organization: 'Chi đoàn PA01', update: 'Nhóm phụ trách đang khảo sát biểu mẫu và quy trình hiện tại.' },
  { id: 'bt-002', title: 'Khó tra cứu nhanh biểu mẫu đang còn hiệu lực', status: 'PROPOSED', date: '21/07/2026', organization: 'Chi đoàn PX03', update: 'Đã đề xuất kho biểu mẫu có phiên bản và cảnh báo hết hiệu lực.' }
];

export const problemStatus = {
  NEW: ['Mới tiếp nhận', 'info'], SCREENING: ['Đang sàng lọc', 'warning'], NEEDS_INFO: ['Cần bổ sung', 'purple'], ACCEPTED: ['Đã tiếp nhận', 'success'], ASSIGNED: ['Đã phân công', 'info'], RESEARCHING: ['Đang nghiên cứu', 'info'], PROPOSED: ['Đã có phương án', 'purple'], PILOTING: ['Đang thử nghiệm', 'warning'], COMPLETED: ['Hoàn thành', 'success'], ON_HOLD: ['Tạm dừng', 'neutral'], DECLINED: ['Chưa phù hợp', 'danger']
};
