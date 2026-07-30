# ĐẶC TẢ THI CÔNG
## SỔ TAY ĐOÀN VIÊN SỐ VÀ GÓC ĐỔI MỚI SÁNG TẠO

**Phiên bản:** 1.0  
**Ngày lập:** 30/7/2026  
**Định hướng triển khai:** React/Vite PWA + Supabase + Gemini + dịch vụ email giao dịch  
**Nền tảng tham khảo:** dự án `baovenentang`, tái sử dụng có chọn lọc phần frontend; không tiếp tục sử dụng Google Apps Script, Google Sheets, Google Drive và Pinecone làm hạ tầng chính.

---

# 1. Mục tiêu sản phẩm

Xây dựng một nền tảng dùng chung phục vụ công tác Đoàn, trong đó đoàn viên và cán bộ Đoàn có thể:

1. Cập nhật thông báo, kế hoạch, chương trình và nhiệm vụ mới.
2. Tra cứu văn bản, tài liệu, biểu mẫu và nội dung học tập.
3. Hỏi đáp bằng AI trên kho tài liệu đã được kiểm duyệt, có dẫn nguồn rõ ràng.
4. Nhận nhiệm vụ, theo dõi hạn và nộp báo cáo trực tuyến.
5. Theo dõi trạng thái đã nộp, chưa nộp, quá hạn hoặc cần bổ sung của từng chi đoàn.
6. Học tập chuyên đề và làm bài kiểm tra nhận thức.
7. Tiếp cận các công trình đổi mới sáng tạo đang triển khai hoặc đã triển khai hiệu quả.
8. Gửi các bài toán, điểm nghẽn trong thực tiễn để Câu lạc bộ đổi mới sáng tạo nghiên cứu, tư vấn và hỗ trợ giải pháp.

Sản phẩm không chỉ là thư viện tài liệu mà là một nền tảng gồm ba giá trị cốt lõi:

- **Biết đúng:** cập nhật và tra cứu thông tin chính thống.
- **Làm đúng hạn:** nhận nhiệm vụ, nộp báo cáo và được nhắc việc.
- **Đổi mới thực chất:** đưa bài toán thực tiễn đến Câu lạc bộ và nhân rộng giải pháp hiệu quả.

---

# 2. Tên gọi và định vị

## 2.1. Tên hiển thị trên ứng dụng

**Sổ tay Đoàn viên số**

## 2.2. Tên đầy đủ trong hồ sơ công trình

**Sổ tay Đoàn viên số và Góc đổi mới sáng tạo tuổi trẻ Công an tỉnh Phú Thọ**

## 2.3. Mô tả ngắn

> Nền tảng hỗ trợ đoàn viên cập nhật thông tin, tra cứu văn bản, học tập, hỏi đáp AI, thực hiện nhiệm vụ báo cáo và kết nối Câu lạc bộ đổi mới sáng tạo để giải quyết các bài toán, điểm nghẽn trong thực tiễn công tác.

---

# 3. Nguyên tắc kiến trúc

## 3.1. Kiến trúc chốt

```text
Người dùng trên điện thoại/máy tính
              │
              ▼
React/Vite PWA trên Vercel hoặc Mắt Bão
              │
              ▼
Supabase
├── Auth: đăng nhập, phiên làm việc
├── PostgreSQL: dữ liệu nghiệp vụ
├── Storage: văn bản, báo cáo, hình ảnh
├── Row Level Security: phân quyền dữ liệu
├── Edge Functions: nghiệp vụ backend
├── Cron: nhắc hạn, xử lý tự động
├── Realtime: cập nhật trạng thái
└── pgvector: tìm kiếm ngữ nghĩa cho AI
              │
              ├── Gemini: embedding và trả lời AI
              └── Brevo/Resend/SMTP: gửi email
```

## 3.2. Phân vai các thành phần

| Thành phần | Vai trò |
|---|---|
| React/Vite PWA | Giao diện người dùng, có thể cài lên màn hình điện thoại |
| Supabase Auth | Đăng nhập, đặt lại mật khẩu, quản lý phiên |
| PostgreSQL | Lưu toàn bộ dữ liệu có cấu trúc |
| Supabase Storage | Lưu PDF, DOCX, XLSX, ảnh và tệp báo cáo |
| Row Level Security | Bảo đảm người dùng chỉ truy cập đúng dữ liệu được phép |
| Edge Functions | Xử lý nghiệp vụ quan trọng, gọi Gemini và email |
| Supabase Cron | Chạy việc nhắc hạn và cập nhật trạng thái theo lịch |
| pgvector | Lưu vector và tìm đoạn tài liệu liên quan |
| Gemini | Tạo embedding, tóm tắt, trả lời câu hỏi |
| Brevo/Resend/SMTP | Gửi email giao dịch và nhắc việc |

## 3.3. Những thành phần loại bỏ khỏi kiến trúc cũ

- Google Apps Script.
- Google Sheets làm cơ sở dữ liệu chính.
- Google Drive làm kho tệp chính.
- Pinecone.
- API proxy `/api/gas` và các action dạng `?action=...`.
- Cơ chế mã truy cập dùng chung của Trợ lý 35.
- Các module crawler tin tức, Telegram Bot, Bản tin 35, phản bác và dựng video nếu không thuộc phạm vi dự án mới.

## 3.4. Những thành phần có thể tái sử dụng từ repo `baovenentang`

- React 18 và Vite.
- Cách lazy-load trang.
- `ErrorBoundary`.
- `Skeleton`.
- Một phần hệ thống CSS mobile-first.
- Một phần thư viện icon `lucide-react`.
- DOMPurify và bộ xử lý Markdown an toàn.
- Cơ chế cache phía trình duyệt sau khi điều chỉnh.
- Tư duy tách trang học tập, quiz, tủ sách và trợ lý AI.

Không bê nguyên `App.jsx`, `api.js`, `BottomNav.jsx` hoặc các trang cũ sang mà phải refactor theo cấu trúc mới.

---

# 4. Phạm vi phiên bản đầu

## 4.1. Bắt buộc có

1. Đăng nhập và phân quyền theo đơn vị.
2. Trang chủ cá nhân hóa.
3. Thông báo và việc cần làm.
4. Kho văn bản, tài liệu và biểu mẫu.
5. Trợ lý AI hỏi đáp có dẫn nguồn.
6. Tạo đợt yêu cầu báo cáo.
7. Giao yêu cầu báo cáo cho các đơn vị được chọn.
8. Nộp báo cáo và tệp đính kèm.
9. Nộp lại theo phiên bản, không ghi đè lịch sử.
10. Theo dõi đơn vị đã nộp, chưa nộp, quá hạn, cần bổ sung.
11. Nhắc hạn trong ứng dụng và qua email.
12. Chuyên đề học tập, video/infographic/tài liệu.
13. Trắc nghiệm và lưu kết quả.
14. Góc đổi mới sáng tạo.
15. Danh sách công trình đang triển khai.
16. Danh sách công trình đã triển khai hiệu quả.
17. Biểu mẫu gửi bài toán, điểm nghẽn.
18. Quy trình tiếp nhận và theo dõi xử lý bài toán.
19. Trang quản trị tổng hợp.
20. Nhật ký thao tác quan trọng.

## 4.2. Chưa làm trong phiên bản đầu

- Quản lý đoàn phí.
- Chuyển sinh hoạt Đoàn.
- Hồ sơ đoàn viên đầy đủ như hệ thống nghiệp vụ chính thức.
- Xếp loại đoàn viên tự động.
- Mạng xã hội nội bộ.
- Nhắn tin riêng.
- Bình luận công khai.
- Cho phép tự công khai công trình chưa qua kiểm duyệt.
- Tự động công nhận sáng kiến.
- Tích hợp dữ liệu bí mật nhà nước hoặc dữ liệu nghiệp vụ nhạy cảm.

---

# 5. Nhóm người dùng và quyền

## 5.1. Vai trò hệ thống

### A. Đoàn viên

- Xem nội dung được phép.
- Tra cứu văn bản và hỏi AI.
- Học tập, làm trắc nghiệm.
- Xem Góc đổi mới sáng tạo.
- Gửi bài toán, điểm nghẽn.
- Theo dõi bài toán do mình gửi.

### B. Cán bộ chi đoàn

Có toàn bộ quyền của đoàn viên và thêm:

- Xem nhiệm vụ, yêu cầu báo cáo của đơn vị.
- Nộp báo cáo cho chi đoàn.
- Nộp lại báo cáo khi được phép.
- Xem lịch sử nộp của đơn vị.
- Nhận thông báo cần bổ sung.

### C. Thành viên Câu lạc bộ đổi mới sáng tạo

- Xem danh sách bài toán được phân công.
- Ghi nhận kết quả khảo sát.
- Đề xuất hướng giải quyết.
- Cập nhật trạng thái nghiên cứu/thử nghiệm.
- Đính kèm tài liệu phương án.
- Không tự công khai công trình nếu chưa có quyền duyệt.

### D. Ban Thanh niên/Quản trị nội dung

- Tạo thông báo.
- Quản lý văn bản, chuyên đề, quiz.
- Tạo đợt báo cáo và chọn đơn vị phải nộp.
- Xem toàn bộ tình trạng báo cáo.
- Yêu cầu bổ sung hoặc xác nhận hoàn thành.
- Quản lý công trình và bài toán đổi mới sáng tạo.
- Phân công thành viên Câu lạc bộ xử lý bài toán.
- Xuất dữ liệu tổng hợp.

### E. Quản trị hệ thống

- Quản lý tài khoản, vai trò, đơn vị.
- Quản lý cấu hình hệ thống.
- Quản lý secret và tích hợp.
- Xem audit log.
- Khóa/mở tài khoản.
- Khôi phục dữ liệu theo quy trình.

## 5.2. Nguyên tắc quyền

- Quyền phải được kiểm tra tại Database/RLS hoặc Edge Function.
- Không coi việc ẩn nút ở giao diện là biện pháp bảo mật.
- Người dùng không được tự đổi `organization_id` hoặc `role`.
- Service role key chỉ được dùng trong backend, tuyệt đối không đưa vào frontend.

---

# 6. Cấu trúc điều hướng

Ứng dụng có 5 khu vực chính:

1. **Trang chủ**
2. **Công việc**
3. **Tri thức**
4. **Đổi mới sáng tạo**
5. **Cá nhân**

Trợ lý AI hiển thị bằng nút nổi hoặc nút dễ truy cập trên Trang chủ/Tri thức.

## 6.1. Route đề xuất

```text
/
/login
/quen-mat-khau

/cong-viec
/cong-viec/bao-cao/:campaignId
/cong-viec/bao-cao/:campaignId/nop
/cong-viec/lich-su

/tri-thuc
/tri-thuc/van-ban
/tri-thuc/van-ban/:documentId
/tri-thuc/chuyen-de
/tri-thuc/chuyen-de/:topicId
/tri-thuc/trac-nghiem/:quizId
/tro-ly-ai

/doi-moi-sang-tao
/doi-moi-sang-tao/cong-trinh
/doi-moi-sang-tao/cong-trinh/:projectId
/doi-moi-sang-tao/bai-toan
/doi-moi-sang-tao/bai-toan/gui
/doi-moi-sang-tao/bai-toan/:problemId

/ca-nhan
/ca-nhan/thong-bao
/ca-nhan/ket-qua-hoc-tap

/admin
/admin/bao-cao
/admin/van-ban
/admin/chuyen-de
/admin/doi-moi-sang-tao
/admin/nguoi-dung
/admin/cau-hinh
```

Bắt buộc dùng router thực sự để mỗi nội dung có URL riêng, chia sẻ được và mở đúng từ email/thông báo.

---

# 7. Mô tả chức năng chi tiết

# 7.1. Đăng nhập và hồ sơ

## Chức năng

- Đăng nhập bằng email và mật khẩu.
- Quên mật khẩu.
- Đổi mật khẩu.
- Duy trì phiên đăng nhập.
- Đăng xuất toàn bộ thiết bị khi cần.
- Hiển thị họ tên, đơn vị, vai trò.
- Tài khoản do quản trị viên tạo hoặc nhập danh sách; không mở đăng ký tự do ở bản đầu.

## Trạng thái tài khoản

- `INVITED`: đã tạo, chưa kích hoạt.
- `ACTIVE`: đang hoạt động.
- `SUSPENDED`: tạm khóa.
- `ARCHIVED`: không còn sử dụng.

## Tiêu chí nghiệm thu

- Người dùng không đăng nhập không truy cập được khu vực nội bộ.
- Người dùng bị khóa bị thu hồi quyền truy cập.
- Hồ sơ không cho tự sửa vai trò hoặc đơn vị.

---

# 7.2. Trang chủ cá nhân hóa

## Thành phần

1. Thanh chào và thông tin người dùng.
2. Khối “Việc cần làm”.
3. Báo cáo sắp đến hạn.
4. Thông báo mới.
5. Văn bản mới.
6. Chuyên đề cần học.
7. Công trình đổi mới sáng tạo nổi bật.
8. Nút hỏi AI.

## Quy tắc cá nhân hóa

- Đoàn viên chỉ thấy nội dung thuộc phạm vi được cấp.
- Cán bộ chi đoàn thấy báo cáo của đơn vị mình.
- Ban Thanh niên thấy số liệu tổng hợp nhanh.
- Thành viên Câu lạc bộ thấy bài toán được phân công.

## Mức ưu tiên hiển thị

1. Việc đã quá hạn.
2. Việc hết hạn trong 48 giờ.
3. Thông báo bắt buộc.
4. Chuyên đề đang mở.
5. Nội dung tham khảo.

---

# 7.3. Thông báo

## Loại thông báo

- Thông báo chung.
- Thông báo theo đơn vị.
- Thông báo theo vai trò.
- Thông báo cá nhân.
- Thông báo hệ thống tự sinh.

## Thuộc tính

- Tiêu đề.
- Nội dung ngắn.
- Nội dung chi tiết.
- Mức ưu tiên.
- Thời gian bắt đầu/kết thúc hiển thị.
- Đường dẫn hành động.
- Phạm vi người nhận.
- Người tạo.
- Trạng thái nháp/đã phát hành/đã thu hồi.

## Hành vi

- Đánh dấu đã đọc.
- Bộ đếm chưa đọc.
- Mở từ email đi đúng nội dung.
- Không xóa vật lý thông báo đã phát hành; chuyển trạng thái thu hồi nếu cần.

---

# 7.4. Phân hệ Công việc và nộp báo cáo

## 7.4.1. Tạo đợt báo cáo

Quản trị viên nhập:

- Tên đợt báo cáo.
- Mô tả/yêu cầu.
- Cơ quan hoặc bộ phận yêu cầu.
- Ngày mở.
- Hạn nộp.
- Cho phép nộp muộn hay không.
- Cho phép nộp lại hay không.
- Các loại tệp được phép.
- Dung lượng tối đa từng tệp.
- Số lượng tệp tối đa.
- Biểu mẫu đính kèm.
- Danh sách đơn vị phải nộp.
- Lịch nhắc email.
- Người phụ trách tiếp nhận.

Khi phát hành, hệ thống tạo một `report_assignment` cho từng đơn vị được chọn.

## 7.4.2. Trạng thái nhiệm vụ báo cáo

- `PENDING`: chưa nộp, còn hạn.
- `SUBMITTED`: đã nộp, chờ xem xét.
- `NEEDS_SUPPLEMENT`: cần bổ sung.
- `RESUBMITTED`: đã nộp lại.
- `ACCEPTED`: đã xác nhận hoàn thành.
- `OVERDUE`: quá hạn nhưng chưa nộp.
- `LATE_SUBMITTED`: nộp sau hạn.
- `CLOSED`: đợt đã đóng.
- `EXEMPTED`: được miễn nộp, phải có lý do và người phê duyệt.

## 7.4.3. Nộp báo cáo

Cán bộ chi đoàn thực hiện:

1. Mở yêu cầu.
2. Đọc hướng dẫn và tải biểu mẫu.
3. Nhập nội dung tóm tắt nếu đợt yêu cầu.
4. Chọn tệp.
5. Hệ thống kiểm tra loại tệp, kích thước và số lượng.
6. Xác nhận nộp.
7. Tạo bản ghi phiên bản mới.
8. Gửi thông báo xác nhận trong ứng dụng.
9. Gửi email xác nhận nếu được cấu hình.

## 7.4.4. Nộp lại

- Không ghi đè tệp cũ.
- Mỗi lần nộp có số phiên bản.
- Phiên bản cũ ở trạng thái chỉ đọc.
- Ghi rõ ai nộp, thời điểm, ghi chú.
- Chỉ cho nộp lại khi đợt cho phép hoặc quản trị viên yêu cầu bổ sung.

## 7.4.5. Tiếp nhận báo cáo

Quản trị viên có thể:

- Mở và tải tệp.
- Xem lịch sử phiên bản.
- Xác nhận hoàn thành.
- Yêu cầu bổ sung, ghi rõ nội dung cần bổ sung.
- Miễn nộp có lý do.
- Xuất danh sách trạng thái.

## 7.4.6. Dashboard theo dõi

Hiển thị:

- Tổng đơn vị phải nộp.
- Đã nộp.
- Chưa nộp.
- Quá hạn.
- Cần bổ sung.
- Đã hoàn thành.
- Tỷ lệ hoàn thành.
- Danh sách cụ thể từng đơn vị.

Có bộ lọc theo:

- Đợt báo cáo.
- Trạng thái.
- Đơn vị.
- Thời điểm nộp.
- Nộp đúng hạn/nộp muộn.

## 7.4.7. Xuất dữ liệu

- Xuất Excel danh sách trạng thái.
- Xuất CSV khi cần.
- Tải từng tệp.
- Tải toàn bộ tệp của một đợt dạng ZIP thông qua Edge Function hoặc tiến trình phù hợp.
- Tên tệp tải về phải chuẩn hóa để nhận biết đơn vị và phiên bản.

---

# 7.5. Kho văn bản và tài liệu

## 7.5.1. Phân loại

- Nghị quyết.
- Điều lệ, quy định.
- Hướng dẫn.
- Kế hoạch, chương trình.
- Công văn.
- Biểu mẫu.
- Tài liệu học tập.
- Tài liệu nội bộ được phép phổ biến.

## 7.5.2. Thuộc tính văn bản

- Số, ký hiệu.
- Tên văn bản.
- Cơ quan ban hành.
- Ngày ban hành.
- Ngày hiệu lực.
- Ngày hết hiệu lực nếu có.
- Loại văn bản.
- Cấp ban hành.
- Phạm vi áp dụng.
- Trạng thái hiệu lực.
- Tóm tắt.
- Từ khóa.
- Tệp gốc.
- Văn bản thay thế/sửa đổi/liên quan.
- Mức độ truy cập.
- Trạng thái duyệt.
- Người kiểm duyệt.

## 7.5.3. Trạng thái tài liệu

- `DRAFT`.
- `PROCESSING`.
- `PENDING_REVIEW`.
- `PUBLISHED`.
- `REPLACED`.
- `EXPIRED`.
- `WITHDRAWN`.

## 7.5.4. Tìm kiếm

- Tìm theo tên, số ký hiệu, từ khóa.
- Lọc theo loại, cơ quan, năm, hiệu lực.
- Tìm kiếm ngữ nghĩa bằng AI trong nội dung được duyệt.
- Ưu tiên văn bản còn hiệu lực và mới hơn.

## 7.5.5. Trang chi tiết

- Metadata văn bản.
- Tóm tắt nội dung chính.
- Tệp PDF xem trực tiếp nếu trình duyệt hỗ trợ.
- Nút tải tệp nếu người dùng có quyền.
- Văn bản liên quan.
- Nút “Hỏi AI về văn bản này”.

---

# 7.6. Chuyên đề học tập và trắc nghiệm

## Chuyên đề

Mỗi chuyên đề gồm:

- Tiêu đề.
- Mô tả.
- Mục tiêu học tập.
- Tài liệu.
- Video.
- Infographic.
- Nội dung tóm tắt.
- Thời gian mở/đóng.
- Đối tượng học.
- Bài kiểm tra liên quan.

## Trắc nghiệm

- Câu hỏi một đáp án hoặc nhiều đáp án nếu cần.
- Đảo thứ tự câu hỏi và đáp án.
- Giới hạn số lần làm tùy cấu hình.
- Điểm đạt.
- Hiển thị đáp án sau khi hoàn thành tùy cấu hình.
- Lưu kết quả và thời gian làm.
- Xuất kết quả theo đơn vị.

Không coi kết quả trắc nghiệm là căn cứ đánh giá chính thức nếu chưa có quy định nghiệp vụ rõ ràng.

---

# 7.7. Trợ lý AI

## 7.7.1. Mục tiêu

- Trả lời câu hỏi dựa trên kho tài liệu đã duyệt.
- Không bịa nội dung thành quy định.
- Dẫn rõ tên văn bản, số ký hiệu, mục/điều/trang hoặc đoạn nguồn.
- Cho phép mở trực tiếp tài liệu nguồn.

## 7.7.2. Chế độ

### Tra cứu văn bản

Trả lời quy định, nội dung, hướng dẫn dựa trên văn bản.

### Hỗ trợ công tác Đoàn

Gợi ý dàn ý kế hoạch, chương trình, nội dung sinh hoạt trên cơ sở tài liệu được duyệt; phải ghi rõ phần nào là gợi ý soạn thảo.

### Tìm giải pháp đổi mới sáng tạo

Tìm các công trình, giải pháp đã triển khai có liên quan đến bài toán người dùng nêu.

## 7.7.3. Quy tắc bắt buộc

1. Chỉ dùng tài liệu người dùng được phép xem.
2. Không đưa nội dung tài liệu hạn chế vào câu trả lời cho người không có quyền.
3. Nếu không đủ căn cứ, trả lời rõ chưa tìm thấy trong kho tri thức.
4. Không biến suy luận của AI thành quy định chính thức.
5. Mỗi câu trả lời phải có danh sách nguồn.
6. Lưu câu hỏi, câu trả lời, nguồn và phản hồi để đánh giá chất lượng.
7. Có giới hạn độ dài câu hỏi, số lượt và chống lạm dụng.
8. Lọc dữ liệu nhạy cảm trước khi gửi đến mô hình bên ngoài theo cấu hình được phê duyệt.

## 7.7.4. Luồng RAG

```text
Quản trị viên tải tài liệu
→ hệ thống kiểm tra metadata và quyền
→ trích xuất nội dung
→ chia theo chương/mục/điều/đoạn
→ tạo embedding bằng Gemini
→ lưu chunk + vector vào PostgreSQL/pgvector
→ cán bộ duyệt
→ chỉ chunk đã duyệt được dùng khi trả lời
```

Khi người dùng hỏi:

```text
Xác thực người dùng
→ xác định phạm vi tài liệu được phép
→ tạo embedding câu hỏi
→ tìm các chunk phù hợp
→ ưu tiên văn bản còn hiệu lực
→ gửi context đã chọn cho Gemini
→ chuẩn hóa câu trả lời và nguồn
→ lưu lịch sử
→ trả kết quả
```

---

# 7.8. Góc đổi mới sáng tạo

Gồm hai cấu phần chính:

1. **Giới thiệu công trình, giải pháp.**
2. **Tiếp nhận bài toán, điểm nghẽn.**

## 7.8.1. Công trình đang triển khai

Hiển thị các công trình ở trạng thái:

- Đang khảo sát.
- Đang xây dựng.
- Đang thử nghiệm.
- Đang hoàn thiện.
- Đang triển khai mở rộng.

Mỗi công trình có:

- Tên công trình.
- Đơn vị/nhóm thực hiện.
- Vấn đề thực tiễn.
- Mục tiêu.
- Mô tả giải pháp.
- Công nghệ sử dụng ở mức phù hợp.
- Phạm vi triển khai.
- Tiến độ.
- Kết quả bước đầu.
- Hình ảnh/video/tài liệu.
- Đầu mối phụ trách.
- Mức độ truy cập.

## 7.8.2. Công trình đã triển khai hiệu quả

Ngoài các trường trên, bổ sung:

- Thời điểm đưa vào sử dụng.
- Kết quả định lượng/định tính.
- Đơn vị đã áp dụng.
- Điều kiện triển khai.
- Khả năng nhân rộng.
- Hướng dẫn liên hệ hoặc đăng ký tìm hiểu.

## 7.8.3. Không công khai quá mức

Phần hiển thị không được chứa:

- Mã nguồn nhạy cảm.
- Secret, token, tài khoản.
- Sơ đồ hạ tầng chi tiết có thể tạo rủi ro.
- Dữ liệu người dùng thật.
- Quy trình nghiệp vụ hạn chế.
- Tài liệu chưa được duyệt công bố.

## 7.8.4. Gửi bài toán, điểm nghẽn

Biểu mẫu gồm:

- Tiêu đề ngắn.
- Đơn vị đề xuất.
- Người liên hệ.
- Mô tả quy trình hiện tại.
- Điểm nghẽn/khó khăn.
- Tần suất phát sinh.
- Ảnh hưởng thực tế.
- Kết quả mong muốn.
- Mức độ cấp thiết.
- Dữ liệu/hệ thống đang sử dụng.
- Tệp minh họa.
- Phạm vi thông tin.
- Xác nhận nội dung không chứa bí mật nhà nước hoặc dữ liệu không được phép đưa lên nền tảng.

Không yêu cầu người gửi phải tự viết giải pháp kỹ thuật.

## 7.8.5. Trạng thái bài toán

- `NEW`: mới tiếp nhận.
- `SCREENING`: đang sàng lọc.
- `NEEDS_INFO`: cần bổ sung thông tin.
- `ACCEPTED`: đồng ý nghiên cứu.
- `ASSIGNED`: đã phân công.
- `RESEARCHING`: đang nghiên cứu.
- `PROPOSED`: đã có phương án đề xuất.
- `PILOTING`: đang thử nghiệm.
- `COMPLETED`: đã có giải pháp/kết quả.
- `ON_HOLD`: tạm dừng.
- `DECLINED`: chưa phù hợp triển khai, phải có lý do.

## 7.8.6. Quy trình xử lý

```text
Người dùng gửi bài toán
→ hệ thống xác nhận tiếp nhận
→ quản trị viên sàng lọc
→ yêu cầu bổ sung nếu cần
→ Câu lạc bộ quyết định tiếp nhận
→ phân công thành viên/nhóm
→ khảo sát và đề xuất giải pháp
→ thử nghiệm
→ đánh giá kết quả
→ hoàn thành hoặc tạm dừng
```

## 7.8.7. Theo dõi và trao đổi

- Người gửi chỉ xem nội dung được phép của bài toán mình gửi.
- Thành viên được phân công xem dữ liệu cần thiết.
- Có nhật ký trạng thái.
- Có ghi chú nội bộ không hiển thị cho người gửi.
- Có tệp phương án, biên bản khảo sát, báo cáo thử nghiệm.
- Mọi thay đổi trạng thái quan trọng tạo thông báo.

## 7.8.8. Gợi ý bằng AI

AI có thể:

- Tóm tắt bài toán.
- Phát hiện thông tin còn thiếu.
- Tìm công trình tương tự.
- Gợi ý câu hỏi khảo sát.
- Tạo dự thảo phiếu mô tả bài toán.
- Gợi ý hướng giải pháp sơ bộ.

AI không tự quyết định tiếp nhận, phân công, công nhận hoặc công khai công trình.

---

# 7.9. Trang cá nhân

Hiển thị:

- Họ tên.
- Đơn vị.
- Vai trò.
- Thông báo chưa đọc.
- Lịch sử báo cáo đã nộp nếu có quyền.
- Kết quả học tập.
- Bài toán đã gửi.
- Phản hồi AI đã gửi.
- Đổi mật khẩu và đăng xuất.

Không hiển thị thông tin cá nhân không cần thiết trong bản đầu.

---

# 7.10. Trang quản trị

## Dashboard

- Số người dùng hoạt động.
- Số đơn vị.
- Báo cáo sắp đến hạn.
- Danh sách chưa nộp.
- Văn bản đang chờ duyệt.
- Bài toán mới tiếp nhận.
- Công trình đang triển khai.
- Lượt hỏi AI và tỷ lệ phản hồi tốt/xấu.

## Quản trị dữ liệu

- Người dùng và đơn vị.
- Thông báo.
- Đợt báo cáo.
- Văn bản.
- Chuyên đề và quiz.
- Công trình đổi mới sáng tạo.
- Bài toán, điểm nghẽn.
- Nhật ký email.
- Audit log.

---

# 8. Mô hình dữ liệu Supabase

Mọi bảng chính dùng UUID, `created_at`, `updated_at`. Các bảng nghiệp vụ quan trọng có `created_by`, `updated_by` khi phù hợp.

# 8.1. Tổ chức và người dùng

## `organizations`

- `id`
- `code`
- `name`
- `short_name`
- `parent_id`
- `organization_type`
- `email`
- `phone`
- `is_active`
- `metadata`
- timestamps

## `profiles`

- `id` liên kết `auth.users.id`
- `full_name`
- `organization_id`
- `job_title`
- `phone`
- `account_status`
- `last_seen_at`
- timestamps

## `user_roles`

- `user_id`
- `role_code`
- `scope_organization_id` nếu quyền có phạm vi
- `granted_by`
- `granted_at`

Không chỉ lưu một cột role duy nhất nếu một người có thể vừa là cán bộ chi đoàn vừa là thành viên Câu lạc bộ.

---

# 8.2. Thông báo

## `announcements`

- `id`
- `title`
- `summary`
- `content`
- `priority`
- `status`
- `audience_type`
- `publish_at`
- `expire_at`
- `action_url`
- `visibility_level`
- timestamps

## `announcement_targets`

- `announcement_id`
- `organization_id` hoặc `role_code` hoặc `user_id`

## `announcement_reads`

- `announcement_id`
- `user_id`
- `read_at`

---

# 8.3. Báo cáo

## `report_campaigns`

- `id`
- `title`
- `description`
- `issuer`
- `open_at`
- `due_at`
- `close_at`
- `allow_late_submission`
- `allow_resubmission`
- `allowed_extensions`
- `max_file_size_mb`
- `max_files`
- `status`
- `reminder_policy`
- `visibility_level`
- timestamps

## `report_campaign_templates`

- `id`
- `campaign_id`
- `storage_path`
- `file_name`
- `mime_type`
- `size_bytes`

## `report_assignments`

- `id`
- `campaign_id`
- `organization_id`
- `status`
- `due_at_override`
- `assigned_at`
- `accepted_at`
- `exempted_at`
- `exempt_reason`
- unique `(campaign_id, organization_id)`

## `report_submissions`

- `id`
- `assignment_id`
- `version_number`
- `submitted_by`
- `submitted_at`
- `summary`
- `submit_note`
- `is_late`
- `review_status`
- `reviewed_by`
- `reviewed_at`
- `review_note`
- unique `(assignment_id, version_number)`

## `report_submission_files`

- `id`
- `submission_id`
- `storage_path`
- `original_name`
- `safe_name`
- `mime_type`
- `size_bytes`
- `checksum`
- `uploaded_by`
- timestamps

## `report_status_history`

- `id`
- `assignment_id`
- `from_status`
- `to_status`
- `changed_by`
- `reason`
- `created_at`

---

# 8.4. Văn bản và RAG

## `documents`

- `id`
- `document_number`
- `title`
- `document_type`
- `issuing_authority`
- `issued_date`
- `effective_date`
- `expiry_date`
- `effect_status`
- `scope`
- `summary`
- `keywords`
- `storage_path`
- `source_url`
- `status`
- `visibility_level`
- `approved_by`
- `approved_at`
- timestamps

## `document_relations`

- `source_document_id`
- `target_document_id`
- `relation_type`: sửa đổi, thay thế, hướng dẫn, liên quan

## `document_chunks`

- `id`
- `document_id`
- `chunk_index`
- `section_path`
- `page_from`
- `page_to`
- `content`
- `content_hash`
- `embedding`
- `review_status`
- `visibility_level`
- timestamps

Chỉ chunk `APPROVED` mới được tìm bởi AI ở môi trường production.

---

# 8.5. Học tập và quiz

## `learning_topics`

- `id`
- `title`
- `description`
- `objectives`
- `status`
- `open_at`
- `close_at`
- `visibility_level`

## `learning_resources`

- `id`
- `topic_id`
- `resource_type`
- `title`
- `content`
- `storage_path`
- `external_url`
- `sort_order`

## `quizzes`

- `id`
- `topic_id`
- `title`
- `description`
- `pass_score`
- `time_limit_minutes`
- `max_attempts`
- `shuffle_questions`
- `shuffle_options`
- `status`

## `quiz_questions`

- `id`
- `quiz_id`
- `question_type`
- `question_text`
- `explanation`
- `points`
- `sort_order`

## `quiz_options`

- `id`
- `question_id`
- `option_text`
- `is_correct`
- `sort_order`

`is_correct` không được trả trực tiếp cho frontend trước khi nộp bài.

## `quiz_attempts`

- `id`
- `quiz_id`
- `user_id`
- `started_at`
- `submitted_at`
- `score`
- `passed`
- `attempt_number`

## `quiz_answers`

- `attempt_id`
- `question_id`
- `selected_option_ids`
- `is_correct`
- `awarded_points`

---

# 8.6. Trợ lý AI

## `ai_conversations`

- `id`
- `user_id`
- `title`
- `mode`
- timestamps

## `ai_messages`

- `id`
- `conversation_id`
- `role`
- `content`
- `model`
- `latency_ms`
- `token_usage`
- `status`
- timestamps

## `ai_message_sources`

- `message_id`
- `document_id`
- `chunk_id`
- `rank`
- `similarity`
- `quoted_excerpt`

## `ai_feedback`

- `message_id`
- `user_id`
- `rating`
- `comment`
- timestamps

---

# 8.7. Đổi mới sáng tạo

## `innovation_projects`

- `id`
- `title`
- `slug`
- `project_status`
- `project_category`
- `lead_organization_id`
- `team_name`
- `problem_statement`
- `objectives`
- `solution_summary`
- `technology_summary`
- `implementation_scope`
- `progress_percent`
- `results_summary`
- `replication_potential`
- `contact_user_id`
- `visibility_level`
- `publish_status`
- `approved_by`
- `approved_at`
- timestamps

## `innovation_project_media`

- `project_id`
- `media_type`
- `storage_path`
- `caption`
- `sort_order`

## `innovation_problems`

- `id`
- `title`
- `submitted_by`
- `organization_id`
- `current_process`
- `pain_point`
- `frequency`
- `impact`
- `desired_outcome`
- `urgency`
- `current_tools`
- `visibility_level`
- `status`
- `assigned_team_id`
- `public_summary`
- timestamps

## `innovation_problem_files`

- `problem_id`
- `storage_path`
- `original_name`
- `mime_type`
- `size_bytes`

## `innovation_problem_assignments`

- `problem_id`
- `assigned_user_id`
- `assignment_role`
- `assigned_by`
- `assigned_at`

## `innovation_problem_updates`

- `id`
- `problem_id`
- `update_type`
- `public_content`
- `internal_content`
- `from_status`
- `to_status`
- `created_by`
- timestamps

## `innovation_solution_artifacts`

- `problem_id`
- `artifact_type`
- `title`
- `description`
- `storage_path`
- `external_url`
- `visibility_level`

---

# 8.8. Thông báo và email

## `notifications`

- `id`
- `user_id`
- `type`
- `title`
- `body`
- `action_url`
- `read_at`
- `created_at`

## `email_queue`

- `id`
- `template_code`
- `recipient_email`
- `recipient_name`
- `payload`
- `scheduled_at`
- `status`
- `attempt_count`
- `last_error`
- timestamps

## `email_logs`

- `id`
- `queue_id`
- `provider`
- `provider_message_id`
- `status`
- `sent_at`
- `delivered_at`
- `error_code`
- `error_message`

---

# 8.9. Nhật ký

## `audit_logs`

- `id`
- `actor_user_id`
- `action`
- `entity_type`
- `entity_id`
- `organization_id`
- `before_data` chỉ lưu trường cần thiết
- `after_data` chỉ lưu trường cần thiết
- `ip_hash`
- `user_agent`
- `created_at`

Không lưu secret, mật khẩu, access token hoặc toàn bộ tệp vào audit log.

---

# 9. Storage

## 9.1. Bucket đề xuất

- `documents-private`
- `report-templates-private`
- `report-submissions-private`
- `learning-resources-private`
- `innovation-private`
- `innovation-public-media`
- `avatars-private` nếu cần

## 9.2. Cấu trúc đường dẫn

```text
report-submissions-private/
  {campaign_id}/
    {organization_id}/
      {assignment_id}/
        v{version_number}/
          {uuid}-{safe_filename}
```

```text
documents-private/
  {document_id}/
    source/{uuid}-{safe_filename}
    extracted/{content_hash}.txt
```

```text
innovation-private/
  problems/{problem_id}/attachments/...
  projects/{project_id}/internal/...
```

## 9.3. Nguyên tắc

- Tệp nội bộ đặt private.
- Mở tệp qua signed URL thời hạn ngắn.
- Không tin `mime_type` từ trình duyệt; backend kiểm tra lại.
- Chuẩn hóa tên tệp và chặn phần mở rộng nguy hiểm.
- Thiết lập giới hạn kích thước theo từng loại nghiệp vụ.
- Lưu checksum để phát hiện tệp trùng hoặc thay đổi bất thường.

---

# 10. Row Level Security

## 10.1. Nguyên tắc chung

- Bật RLS cho mọi bảng có dữ liệu người dùng/nghiệp vụ.
- Từ chối mặc định, chỉ mở theo policy rõ ràng.
- Các bảng đáp án quiz, audit, email queue không được truy cập trực tiếp từ frontend.

## 10.2. Chính sách chính

### `profiles`

- Người dùng xem hồ sơ của mình.
- Quản trị viên xem danh sách theo quyền.
- Người dùng không tự sửa role, organization và status.

### `report_assignments`

- Cán bộ chi đoàn chỉ xem assignment của `organization_id` mình.
- Ban Thanh niên xem toàn bộ.
- Việc đổi trạng thái quan trọng đi qua Edge Function/RPC.

### `report_submissions`

- Đơn vị chỉ xem và tạo submission cho assignment của mình.
- Không sửa/xóa phiên bản đã nộp.
- Quản trị viên xem và review.

### `documents`

- Chỉ thấy tài liệu `PUBLISHED` và đúng `visibility_level`.
- Draft và tài liệu chờ duyệt chỉ người có quyền nội dung xem.

### `document_chunks`

- Không mở query trực tiếp rộng rãi cho frontend.
- AI retrieval chạy qua Edge Function có kiểm tra quyền.

### `innovation_problems`

- Người gửi xem bài toán của mình.
- Thành viên được phân công xem bài toán được giao.
- Ban quản trị xem toàn bộ.
- Ghi chú nội bộ không bao giờ trả cho người gửi thông thường.

---

# 11. Edge Functions và RPC

## 11.1. Edge Functions bắt buộc

### `submit-report`

- Xác thực người dùng.
- Kiểm tra assignment và tổ chức.
- Kiểm tra thời hạn/quyền nộp lại.
- Kiểm tra metadata tệp.
- Tạo phiên bản submission.
- Cập nhật trạng thái.
- Tạo notification và email xác nhận.
- Ghi audit.

### `review-report`

- Kiểm tra quyền quản trị.
- Chuyển trạng thái accepted/needs supplement/exempted.
- Ghi lý do.
- Tạo thông báo và lịch sử.

### `send-reminder`

- Nhận chiến dịch hoặc tự tìm chiến dịch cần nhắc.
- Chỉ chọn đơn vị chưa hoàn thành.
- Chống gửi trùng cùng loại nhắc.
- Đưa email vào queue.

### `process-email-queue`

- Lấy batch email chờ gửi.
- Gọi nhà cung cấp email.
- Retry có kiểm soát.
- Ghi log.

### `ask-ai`

- Xác thực và kiểm tra quota.
- Tìm tài liệu theo scope.
- Gọi Gemini.
- Chuẩn hóa nguồn.
- Lưu lịch sử và token usage.

### `process-document`

- Kiểm tra quyền quản trị.
- Lấy tệp.
- Trích xuất nội dung.
- Chia chunk.
- Tạo embedding.
- Lưu trạng thái chờ duyệt.

### `submit-innovation-problem`

- Xác thực người gửi.
- Kiểm tra dữ liệu và tệp.
- Tạo bài toán.
- Thông báo cho quản trị viên.
- Gửi xác nhận.

### `update-innovation-problem`

- Kiểm tra quyền và chuyển trạng thái hợp lệ.
- Lưu cập nhật công khai/nội bộ đúng phạm vi.
- Thông báo cho các bên liên quan.

### `export-report-status`

- Kiểm tra quyền.
- Tạo file Excel/CSV theo bộ lọc.
- Không xuất dữ liệu ngoài phạm vi được phép.

### `download-report-bundle`

- Kiểm tra quyền.
- Tạo gói ZIP hoặc luồng tải có kiểm soát.
- Có giới hạn số tệp/dung lượng để tránh timeout.

## 11.2. Database Functions/RPC đề xuất

- `create_report_assignments(campaign_id, organization_ids[])`
- `get_report_dashboard(campaign_id)`
- `mark_overdue_assignments()`
- `get_user_dashboard()`
- `match_document_chunks(query_embedding, filters, match_count)`
- `transition_problem_status(problem_id, new_status, reason)`

Mọi RPC dùng `security definer` phải được kiểm tra rất chặt, đặt `search_path` an toàn và tự kiểm tra quyền.

---

# 12. Cron và việc tự động

## 12.1. Lịch đề xuất

### Hằng ngày lúc 07:00

- Tìm báo cáo sắp đến hạn.
- Áp dụng reminder policy.
- Chỉ nhắc đơn vị chưa hoàn thành.

### Hằng ngày lúc 00:05

- Chuyển assignment quá hạn sang `OVERDUE`.

### Mỗi 10–15 phút

- Xử lý email queue theo batch phù hợp giới hạn nhà cung cấp.

### Hằng ngày lúc 01:00

- Dọn signed job tạm, dữ liệu cache hết hạn nếu có.

### Hằng tuần

- Gửi quản trị viên bản tổng hợp bài toán mới/đang chậm nếu được bật.

## 12.2. Chống gửi trùng

Tạo khóa idempotency theo:

```text
{campaign_id}:{assignment_id}:{reminder_type}:{date}
```

Một khóa chỉ được gửi một lần.

---

# 13. Email

## 13.1. Loại email

- Mời kích hoạt tài khoản.
- Khôi phục mật khẩu.
- Thông báo phát hành đợt báo cáo.
- Nhắc sắp đến hạn.
- Cảnh báo quá hạn.
- Xác nhận đã nộp.
- Yêu cầu bổ sung.
- Xác nhận hoàn thành.
- Xác nhận tiếp nhận bài toán.
- Thông báo bài toán đổi trạng thái.

## 13.2. Nguyên tắc

- Email không phải kênh duy nhất; mọi sự kiện quan trọng phải có notification trong ứng dụng.
- Không gửi lại cho đơn vị đã hoàn thành.
- Có queue, retry và log.
- Template có biến rõ ràng, không ghép HTML tùy tiện từ input người dùng.
- Link email đi đến route cụ thể.
- Không đưa tệp nội bộ trực tiếp vào email; dùng link đăng nhập và tải có kiểm soát.

---

# 14. Frontend

## 14.1. Cấu trúc đề xuất

```text
web/src/
├── app/
│   ├── AppRouter.jsx
│   ├── AuthGuard.jsx
│   ├── RoleGuard.jsx
│   └── providers/
├── components/
│   ├── common/
│   ├── layout/
│   ├── reports/
│   ├── documents/
│   ├── learning/
│   ├── ai/
│   └── innovation/
├── pages/
│   ├── auth/
│   ├── home/
│   ├── work/
│   ├── knowledge/
│   ├── innovation/
│   ├── profile/
│   └── admin/
├── services/
│   ├── supabaseClient.js
│   ├── authService.js
│   ├── reportService.js
│   ├── documentService.js
│   ├── aiService.js
│   └── innovationService.js
├── hooks/
├── utils/
├── lib/
└── styles/
```

## 14.2. Thư viện

Giữ tối giản. Có thể bổ sung:

- `react-router-dom` cho định tuyến.
- Một thư viện form nhẹ nếu thực sự cần.
- Không tự ý thêm framework UI lớn khi chưa có quyết định thiết kế.

## 14.3. Yêu cầu giao diện

- Mobile-first.
- Nút bấm tối thiểu dễ thao tác bằng ngón tay.
- Tình trạng công việc dùng màu kèm chữ/icon, không chỉ dựa vào màu.
- Có skeleton khi tải.
- Có empty state rõ ràng.
- Lỗi phải hướng dẫn cách xử lý.
- Form giữ bản nháp cục bộ nếu người dùng mất mạng trong lúc nhập, nhưng không lưu tệp nhạy cảm vào localStorage.
- Xác nhận trước thao tác quan trọng.
- PWA có manifest, icon và hướng dẫn cài đặt.

## 14.4. Hiệu năng

- Lazy-load khu vực quản trị và AI.
- Phân trang dữ liệu dài.
- Không tải toàn bộ danh sách công trình/văn bản một lần.
- Ảnh dùng kích thước phù hợp.
- Không cache nội dung private bằng cơ chế có thể làm lộ dữ liệu giữa tài khoản.

---

# 15. Cấu trúc repo đề xuất

```text
so-tay-doan-vien/
├── AGENTS.md
├── README.md
├── .env.example
├── docs/
│   ├── 01-product-spec.md
│   ├── 02-architecture.md
│   ├── 03-data-model.md
│   ├── 04-security-rls.md
│   ├── 05-testing.md
│   ├── 06-deploy.md
│   ├── 07-decisions.md
│   └── 08-working-log.md
├── web/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   ├── seed.sql
│   ├── tests/
│   └── functions/
│       ├── _shared/
│       ├── submit-report/
│       ├── review-report/
│       ├── send-reminder/
│       ├── process-email-queue/
│       ├── ask-ai/
│       ├── process-document/
│       ├── submit-innovation-problem/
│       └── update-innovation-problem/
└── scripts/
```

Không giữ thư mục `backend/*.gs` trong repo mới, trừ thư mục archive tham khảo ngoài production.

---

# 16. Chiến lược chuyển từ dự án hiện tại

## 16.1. Không sửa trực tiếp production cũ

- Tạo repo mới hoặc branch độc lập từ frontend hiện tại.
- Dự án `baovenentang` tiếp tục hoạt động riêng.
- Không đổi backend Apps Script cũ để phục vụ dự án mới.

## 16.2. Tái sử dụng có chọn lọc

### Có thể chuyển

- ErrorBoundary.
- Skeleton.
- Markdown sanitizer.
- Một phần CSS và responsive layout.
- Cách lazy-load page.
- Một số component học tập/quiz sau khi bỏ phụ thuộc API cũ.

### Phải viết lại

- `App.jsx`: chuyển sang router và layout 5 khu vực.
- `BottomNav.jsx`: 5 mục mới, quyền và badge.
- `api.js`: bỏ `/api/gas`, thay bằng Supabase services và Edge Function calls.
- Tất cả trang Tin tức/Trợ lý 35 gắn chặt action Apps Script.
- Cơ chế access code.
- Cơ chế history dựa Sheets.
- Tủ sách và quiz nếu đang phụ thuộc schema cũ.

### Không chuyển

- `backend/*.gs`.
- Pinecone scripts.
- Crawler.
- Telegram.
- Bản tin 35.
- Phản bác/fact-check/article writer.
- Video module nếu không có yêu cầu riêng.

---

# 17. An toàn thông tin và dữ liệu

## 17.1. Phân loại nội dung

- `PUBLIC`: có thể công khai.
- `INTERNAL_YOUTH`: nội bộ đoàn viên.
- `ORGANIZATION_ONLY`: chỉ đơn vị liên quan.
- `RESTRICTED`: nhóm người được cấp quyền cụ thể.

## 17.2. Nguyên tắc

- Không đưa bí mật nhà nước lên hệ thống nếu chưa có hạ tầng/quy trình được phép.
- Không gửi nội dung hạn chế đến Gemini nếu chưa được phê duyệt phạm vi xử lý.
- Tệp báo cáo mặc định private.
- Secret lưu trong Supabase Secrets/Vercel Environment Variables.
- Không dùng biến `VITE_*` cho secret.
- Có rate limit cho đăng nhập, upload, AI và gửi form.
- Có kiểm tra định dạng tệp.
- Có audit log cho thao tác quản trị.
- Không log toàn bộ nội dung nhạy cảm.
- Có backup và kiểm thử khôi phục.

## 17.3. RLS acceptance

Bắt buộc có test chứng minh:

- Chi đoàn A không xem báo cáo Chi đoàn B.
- Người gửi A không xem bài toán riêng của người B.
- Đoàn viên không xem ghi chú nội bộ của Câu lạc bộ.
- Người không có quyền không xem file private kể cả biết đường dẫn.
- Frontend anon key không thể đọc bảng audit/email/đáp án quiz.

---

# 18. Yêu cầu phi chức năng

## Hiệu năng

- Trang chủ có dữ liệu hiển thị nhanh trên mạng di động thông thường.
- Danh sách phân trang.
- Tác vụ AI/upload có trạng thái tiến trình.

## Ổn định

- Edge Function phải idempotent với thao tác có thể gửi lại.
- Không tạo hai submission cùng version.
- Không gửi email trùng.
- Không chuyển trạng thái trái quy trình.

## Khả năng vận hành

- Có trang trạng thái tích hợp cơ bản.
- Có log lỗi có mã theo dõi.
- Có tài liệu deploy và rollback.
- Có seed dữ liệu demo.

## Khả năng tiếp cận

- Có label cho input.
- Dùng bàn phím được trên desktop.
- Độ tương phản đủ rõ.
- Có thông báo lỗi dạng chữ.

---

# 19. Kiểm thử

# 19.1. Unit test

- Hàm xác định trạng thái đúng hạn/quá hạn.
- Hàm tăng version submission.
- Hàm kiểm tra loại tệp.
- Hàm xây reminder recipients.
- Trạng thái bài toán hợp lệ.
- Chuẩn hóa nguồn AI.

# 19.2. Database/RLS test

- Mỗi policy có cả positive và negative test.
- Test multi-organization.
- Test role kết hợp.
- Test user bị khóa.

# 19.3. Integration test

- Đăng nhập → xem assignment → nộp tệp → quản trị review.
- Cron → email queue → email log.
- Upload tài liệu → process → duyệt → hỏi AI.
- Gửi bài toán → phân công → cập nhật → người gửi nhận thông báo.

# 19.4. E2E test

Các kịch bản tối thiểu:

1. Cán bộ chi đoàn nộp báo cáo đúng hạn.
2. Nộp lại sau yêu cầu bổ sung.
3. Đơn vị khác không xem được báo cáo.
4. Quản trị viên lọc danh sách chưa nộp.
5. Trợ lý AI trả lời có nguồn.
6. AI không tìm thấy nguồn thì không bịa.
7. Đoàn viên gửi bài toán.
8. Thành viên Câu lạc bộ chỉ thấy bài toán được giao.
9. Công trình nháp không hiển thị cho người dùng thường.
10. Link email mở đúng màn hình sau khi đăng nhập.

# 19.5. Kiểm thử tải và giới hạn

- Nhiều người mở dashboard cùng lúc.
- Upload tệp lớn sát giới hạn.
- Gửi nhiều câu hỏi AI.
- Batch email.
- Đợt báo cáo có hàng trăm đơn vị.

---

# 20. Lộ trình thi công

Không giao AGENT làm toàn bộ trong một lượt. Chia theo phase, mỗi phase có migration, test và báo cáo riêng.

## Phase 0 — Khởi tạo và baseline

- Tạo repo mới.
- Copy chọn lọc frontend.
- Thiết lập docs/brain hoặc bộ tài liệu tương đương.
- Thiết lập Supabase local và dự án dev/rehearsal tách production.
- Thiết lập CI build/test.
- Chốt design tokens và navigation.

**Nghiệm thu:** frontend baseline chạy; Supabase local chạy; không ảnh hưởng repo cũ.

## Phase 1 — Auth, tổ chức, phân quyền

- Schema organizations/profiles/user_roles.
- Auth flow.
- RLS nền tảng.
- Admin tạo/khóa tài khoản.
- Layout, router và 5 khu vực.

**Nghiệm thu:** đăng nhập, phân quyền và isolation đa đơn vị pass.

## Phase 2 — Công việc và báo cáo

- Campaign, assignment, submission, files, history.
- Submit/review functions.
- Dashboard đã nộp/chưa nộp.
- Export danh sách.

**Nghiệm thu:** hoàn thành đầy đủ luồng một đợt báo cáo.

## Phase 3 — Notification và email

- Notification trong app.
- Email queue/log.
- Cron nhắc hạn.
- Idempotency.

**Nghiệm thu:** không gửi trùng; chỉ nhắc đơn vị chưa hoàn thành.

## Phase 4 — Văn bản và học tập

- Documents, Storage, filter/search.
- Learning topics.
- Quiz.
- Kết quả theo người dùng/đơn vị.

**Nghiệm thu:** quản trị tạo nội dung và người dùng học/làm bài được.

## Phase 5 — AI/RAG

- pgvector.
- Process document.
- Review chunks.
- Ask AI có nguồn và scope.
- Feedback và quota.

**Nghiệm thu:** AI chỉ dùng tài liệu được duyệt và người dùng được phép xem.

## Phase 6 — Góc đổi mới sáng tạo

- Công trình đang triển khai/đã hiệu quả.
- Workflow xuất bản.
- Gửi bài toán.
- Phân công và cập nhật.
- AI hỗ trợ tóm tắt/tìm công trình tương tự.

**Nghiệm thu:** hoàn thành một vòng từ gửi bài toán đến thử nghiệm/hoàn thành.

## Phase 7 — Hardening và production

- Security review.
- RLS/IDOR audit.
- Performance.
- Backup/restore.
- Monitoring.
- PWA.
- Hướng dẫn vận hành.
- Pilot với nhóm đơn vị nhỏ.

**Nghiệm thu:** production readiness checklist pass.

---

# 21. Tiêu chí nghiệm thu tổng thể

Hệ thống chỉ được coi là hoàn thành bản đầu khi:

1. Có tài khoản và phân quyền theo đơn vị.
2. Không có lỗi truy cập chéo dữ liệu giữa hai đơn vị trong bộ test.
3. Quản trị viên tạo được đợt báo cáo và giao đúng danh sách.
4. Chi đoàn nộp được nhiều loại tệp được phép.
5. Hệ thống giữ đầy đủ lịch sử nộp lại.
6. Dashboard xác định chính xác ai chưa nộp.
7. Cron chuyển quá hạn và nhắc đúng đối tượng.
8. Email có queue/log và không gửi trùng.
9. Kho văn bản có filter, hiệu lực và phân quyền.
10. AI trả lời có nguồn và không dùng tài liệu ngoài quyền.
11. Quiz lưu kết quả chính xác.
12. Công trình chỉ hiển thị khi được duyệt.
13. Thành viên gửi được bài toán và theo dõi trạng thái.
14. Câu lạc bộ phân công, ghi phương án và cập nhật tiến độ được.
15. Có audit log cho thao tác quan trọng.
16. Có tài liệu deploy, rollback và vận hành.
17. Build production và test suite pass.

---

# 22. Sản phẩm bàn giao của AGENT

Mỗi phase phải bàn giao:

- Mã nguồn.
- Migration SQL.
- RLS policies.
- Edge Functions liên quan.
- Unit/integration/E2E tests.
- Seed/demo data.
- Tài liệu thay đổi kiến trúc.
- Hướng dẫn test thủ công.
- Danh sách file đã sửa.
- Rủi ro còn lại.
- Commit rõ ràng trên branch riêng.

Không chấp nhận báo cáo chỉ ghi “đã hoàn thành” mà không có bằng chứng test.

---

# 23. Quy tắc giao việc cho AGENT

AGENT phải tuân thủ:

1. Đọc toàn bộ tài liệu kiến trúc và đặc tả trước khi code.
2. Khảo sát repo và lập impact analysis.
3. Không sửa production hoặc nhánh main trực tiếp.
4. Mỗi phase một branch hoặc một chuỗi commit rõ ràng.
5. Migration idempotent và có rollback/forward-fix plan.
6. RLS được viết cùng lúc với bảng, không để cuối dự án.
7. Không dùng service role ở frontend.
8. Không đưa secret vào Git.
9. Không vô hiệu hóa test cũ để đạt trạng thái pass.
10. Không tự ý mở rộng phạm vi.
11. Cập nhật tài liệu sau thay đổi kiến trúc.
12. Ghi rõ phần nào chưa làm hoặc chưa xác minh.

---

# 24. Prompt khởi động dành cho AGENT

```text
Hãy đọc toàn bộ đặc tả “Sổ tay Đoàn viên số và Góc đổi mới sáng tạo” cùng AGENTS.md trước khi sửa mã nguồn.

Mục tiêu hiện tại chỉ thực hiện PHASE 0 — Khởi tạo và baseline, chưa thi công các phase sau.

Yêu cầu:
1. Khảo sát toàn bộ repo baovenentang hiện tại và lập bảng thành phần tái sử dụng, thành phần viết lại, thành phần loại bỏ.
2. Tạo repo/nhánh dự án mới, không ảnh hưởng hệ thống đang vận hành.
3. Giữ React/Vite, ErrorBoundary, Skeleton, DOMPurify và các thành phần frontend phù hợp.
4. Loại bỏ phụ thuộc runtime vào Google Apps Script, Google Sheets, Google Drive và Pinecone trong nền mới.
5. Thiết lập React Router, layout 5 khu vực: Trang chủ, Công việc, Tri thức, Đổi mới sáng tạo, Cá nhân.
6. Thiết lập Supabase local, cấu trúc migrations/functions/tests và .env.example.
7. Tạo tài liệu architecture, decisions, testing, deploy và working log.
8. Chưa xây nghiệp vụ báo cáo, AI hoặc đổi mới sáng tạo ở phase này; chỉ tạo skeleton có route và placeholder rõ ràng.
9. Chạy build, lint/test hiện có hoặc bổ sung smoke test tối thiểu.
10. Báo cáo: file đã thêm/sửa, lệnh chạy, kết quả test, rủi ro và đề xuất bước tiếp theo.

Không push main. Không deploy production. Không dùng secret thật.
```

---

# 25. Kết luận thiết kế

Phương án phù hợp nhất là tạo một nền tảng mới dựa trên kinh nghiệm và một phần frontend của `baovenentang`, nhưng thiết kế lại backend hoàn toàn trên Supabase.

Trọng tâm phiên bản đầu không phải quản lý toàn bộ hồ sơ đoàn viên mà là:

- cập nhật và tra cứu;
- giao việc và nộp báo cáo;
- nhắc đúng đơn vị chưa hoàn thành;
- học tập và hỏi đáp AI có căn cứ;
- giới thiệu công trình đổi mới sáng tạo;
- tiếp nhận và xử lý bài toán, điểm nghẽn thực tiễn.

Thiết kế này đủ gọn để triển khai từng bước, đồng thời đủ nền tảng để mở rộng sau này mà không phải thay đổi lại toàn bộ kiến trúc.
