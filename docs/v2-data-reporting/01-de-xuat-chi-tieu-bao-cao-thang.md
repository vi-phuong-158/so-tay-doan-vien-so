# Đề xuất bộ chỉ tiêu "Cập nhật số liệu công tác Đoàn hằng tháng"

> **Mục đích:** tài liệu để trao đổi với Ban Thanh niên. Đây là **đề xuất ban đầu**, chưa chốt.
> **Người lập:** Claude Code theo yêu cầu của đồng chí phụ trách dự án · **Ngày:** 2026-10-10
> **Đặc tả kỹ thuật liên quan:** `00-technical-spec.md` mục 5.

---

## 1. Nguyên tắc đề xuất

1. **Ít mà chắc.** Báo cáo tháng chỉ lấy khoảng 15 con số thiết yếu, nhập trong 5–10 phút trên điện thoại.
2. **Mỗi chỉ tiêu có một mã cố định.** Câu chữ trên form có thể sửa dần, nhưng mã (ví dụ `YOUTH_TOTAL`) không đổi
   để so sánh được qua nhiều năm.
3. **Phân biệt hai loại số** — đây là điểm cần Ban Thanh niên thống nhất kỹ nhất:

| Loại | Ý nghĩa | Ví dụ | Khi tổng hợp quý/năm |
|---|---|---|---|
| **Số thời điểm** | Có bao nhiêu **tại ngày cuối kỳ** | Tổng số đoàn viên | Lấy số của tháng cuối, **không cộng** |
| **Số phát sinh** | Xảy ra bao nhiêu **trong kỳ** | Số hoạt động đã tổ chức | **Cộng** các tháng |

   Nếu không phân biệt, tổng đoàn viên cả năm sẽ bị cộng 12 lần.
4. **Báo cáo quý, 6 tháng, năm không hỏi lại** các số phát sinh đã thu theo tháng — hệ thống tự cộng và ghi rõ
   đủ bao nhiêu tháng có dữ liệu. Giai đoạn đầu hệ thống **chỉ thu theo tháng**; form quý/năm có chỉ tiêu riêng
   làm sau khi bộ chỉ tiêu tháng ổn định.
5. **Đơn vị tự khai** số đoàn viên (đã thống nhất).
6. **Mốc số liệu:** số thời điểm tính đến **hết ngày cuối cùng của tháng**; số phát sinh tính từ ngày 1 đến hết
   ngày cuối tháng.

---

## 2. Danh sách chỉ tiêu đề xuất

### A. Tổ chức (số thời điểm)

| Mã | Tên chỉ tiêu | Đơn vị tính | Ghi chú cần thống nhất |
|---|---|---|---|
| `YOUTH_TOTAL` | Tổng số đoàn viên | người | Chỉ tính đoàn viên đang sinh hoạt tại chi đoàn |
| `YOUTH_FEMALE` | Trong đó: đoàn viên nữ | người | |
| `YOUTH_PARTY_MEMBER` | Trong đó: đoàn viên là đảng viên | người | Tính cả đảng viên dự bị? |

### B. Tổ chức (số phát sinh)

| Mã | Tên chỉ tiêu | Đơn vị tính | Ghi chú cần thống nhất |
|---|---|---|---|
| `YOUTH_ADMITTED` | Kết nạp đoàn viên mới trong tháng | người | Có cần không? |
| `YOUTH_TRANSFERRED_OUT` | Chuyển sinh hoạt đi / trưởng thành Đoàn trong tháng | người | Có cần không? |

### C. Giáo dục chính trị, tư tưởng (số phát sinh)

| Mã | Tên chỉ tiêu | Đơn vị tính | Ghi chú cần thống nhất |
|---|---|---|---|
| `EDU_ACTIVITY_COUNT` | Số buổi sinh hoạt, học tập, tuyên truyền đã tổ chức | buổi | Sinh hoạt chi đoàn định kỳ có tính không? |
| `EDU_PARTICIPANT_COUNT` | Số lượt đoàn viên tham gia | lượt | "Lượt": một người tham gia 2 buổi = 2 lượt |

### D. Phong trào, tình nguyện (số phát sinh)

| Mã | Tên chỉ tiêu | Đơn vị tính | Ghi chú cần thống nhất |
|---|---|---|---|
| `VOLUNTEER_ACTIVITY_COUNT` | Số hoạt động tình nguyện, xung kích | hoạt động | |
| `VOLUNTEER_PARTICIPANT_COUNT` | Số lượt đoàn viên tham gia | lượt | |
| `YOUTH_PROJECT_COUNT` | Số công trình, phần việc thanh niên **hoàn thành** trong tháng | công trình | Tính lúc khởi công hay lúc hoàn thành? (đề xuất: hoàn thành) |

### E. Đổi mới sáng tạo, chuyển đổi số (số phát sinh)

| Mã | Tên chỉ tiêu | Đơn vị tính | Ghi chú cần thống nhất |
|---|---|---|---|
| `INNOVATION_IDEA_COUNT` | Số ý tưởng, đề xuất mới | ý tưởng | |
| `INNOVATION_INITIATIVE_COUNT` | Số sáng kiến, giải pháp được áp dụng | sáng kiến | Cần được cấp có thẩm quyền công nhận hay chỉ cần áp dụng? |
| `DIGITAL_PRODUCT_COUNT` | Số sản phẩm số (video, infographic, ứng dụng…) | sản phẩm | |

### F. Nguồn lực, an sinh (số phát sinh)

| Mã | Tên chỉ tiêu | Đơn vị tính | Ghi chú cần thống nhất |
|---|---|---|---|
| `RESOURCE_VALUE_VND` | Giá trị kinh phí, hiện vật huy động | đồng | Hiện vật quy đổi ra tiền? |
| `BENEFICIARY_COUNT` | Số **lượt người** được hỗ trợ, trao quà | lượt người | Một người nhận 2 lần = 2 lượt. Nếu cần số người không trùng thì phải thu cách khác (không cộng được qua các tháng) |

### G. Đánh giá (chữ, không tổng hợp số)

| Trường | Bắt buộc? |
|---|---|
| Kết quả nổi bật trong tháng | Không |
| Khó khăn, vướng mắc | Không |
| Đề xuất, kiến nghị | Không |

---

## 3. Kiểm tra tự động đề xuất

**Chặn không cho gửi (lỗi chắc chắn):**

- Mọi số không được âm.
- Đoàn viên nữ ≤ Tổng số đoàn viên.
- Đoàn viên là đảng viên ≤ Tổng số đoàn viên.
- Kinh phí là số nguyên (đồng), không quá 10 tỷ đồng/tháng/chi đoàn (ngưỡng tạm, Ban chỉnh).

**Cảnh báo, cho gửi nếu có giải trình:**

- Tổng số đoàn viên tăng hoặc giảm quá **20%** so với tháng trước.
- Số lượt tham gia nhỏ hơn số buổi/hoạt động (có thể nhập nhầm cột).
- Một chỉ tiêu phát sinh lớn gấp **3 lần** trung bình 3 tháng gần nhất (áp dụng sau khi có đủ dữ liệu).

**Hỗ trợ nhập:** nút **"Sao chép số liệu tháng trước"** điền sẵn các số thời điểm (đoàn viên, nữ, đảng viên). Số
phát sinh **không** sao chép, để tránh khai lặp hoạt động của tháng trước.

---

## 4. Câu hỏi cần Ban Thanh niên trả lời

1. Danh sách trên thừa hoặc thiếu chỉ tiêu nào? Có chỉ tiêu nào bắt buộc theo hướng dẫn của Đoàn cấp trên không?
2. Các ô "Ghi chú cần thống nhất" ở mục 2.
3. Hạn nộp hằng tháng: ngày nào của tháng sau (đề xuất: ngày 05)?
4. Có cho nộp muộn và sửa lại sau khi đã gửi không (đề xuất: cho, có lưu lịch sử)?
5. Ngưỡng cảnh báo 20% và 3 lần có phù hợp không?
6. Báo cáo quý/6 tháng/năm cần thêm chỉ tiêu riêng nào?
7. Hoạt động do nhiều chi đoàn cùng tổ chức: mỗi chi đoàn cùng tính, hay chỉ đơn vị chủ trì tính?

*Đã chốt (2026-10-10):* nhiệm vụ hoàn thành khi đơn vị đã gửi; hệ thống không có bước "yêu cầu bổ sung" cho số
liệu — Ban liên hệ trực tiếp, đơn vị tự gửi lại và số mới nhất được dùng để tổng hợp.
