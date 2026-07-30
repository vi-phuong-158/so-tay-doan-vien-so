# DESIGN SYSTEM — SỔ TAY ĐOÀN VIÊN SỐ

**Phiên bản:** 1.0  
**Mục đích:** Tài liệu thiết kế UI/UX dùng trực tiếp cho quá trình thi công frontend.  
**Định hướng:** Xanh thanh niên làm chủ đạo, hiện đại, tối giản, chính thống, thân thiện trên thiết bị di động.  
**Font chính:** Be Vietnam Pro.  
**Icon:** Lucide Icons hoặc Phosphor Icons, phong cách nét mảnh tối giản.

---

## 1. Tuyên bố thiết kế

Sổ tay Đoàn viên số được thiết kế như một nền tảng số phục vụ đoàn viên, cán bộ Đoàn và Câu lạc bộ đổi mới sáng tạo. Giao diện phải tạo được ba cảm giác đồng thời:

1. **Trẻ trung và năng động:** thể hiện tinh thần thanh niên, đổi mới, sáng tạo.
2. **Chính thống và tin cậy:** phù hợp môi trường Công an, rõ ràng, kỷ luật, dễ sử dụng.
3. **Hiện đại và gần gũi:** tối ưu cho điện thoại, thao tác nhanh, không tạo cảm giác hành chính nặng nề.

Nguyên tắc tổng quát:

- Xanh thanh niên là màu nhận diện chính.
- Trắng và xanh rất nhạt là nền chủ đạo.
- Đỏ và vàng chỉ dùng làm điểm nhấn nhận diện, không sử dụng dàn trải.
- Các khối thông tin bo tròn mềm, nổi khối vừa phải.
- Glassmorphism chỉ dùng có chọn lọc, không phủ toàn bộ giao diện.
- Icon phải đồng bộ, tối giản, không dùng icon 3D hoặc icon nhiều màu.
- Nội dung phải được ưu tiên hơn hiệu ứng.

---

## 2. Tệp tham chiếu thiết kế

- Logo tham chiếu: `logo-reference.png`
- Concept UI đã chốt: `design-reference.png`

Trong repo nên đặt tại:

```text
public/brand/logo-reference.png
public/brand/design-reference.png
```

---

## 3. Nhận diện thương hiệu

### 3.1. Logo

Logo sử dụng ngôn ngữ hình ảnh:

- Khối nền xanh dương bo tròn.
- Phần dưới tạo hình tam giác đỏ.
- Ngôi sao vàng làm điểm nhấn.
- Viền trắng giúp logo rõ trên nền xanh đậm.

Logo nên được sử dụng tại:

- Màn hình đăng nhập.
- Header Trang chủ.
- Icon PWA.
- Splash screen.
- Favicon.
- Footer hoặc trang Giới thiệu.

Không nên lặp logo ở mọi card, mọi danh sách hoặc mọi modal.

### 3.2. Kích thước logo

| Vị trí | Kích thước đề xuất |
|---|---:|
| Favicon | 32 × 32 px |
| Header mobile | 28–32 px |
| Splash screen | 88–112 px |
| Trang đăng nhập | 72–88 px |
| Desktop header | 36–40 px |

### 3.3. Khoảng trống an toàn

Khoảng trống quanh logo tối thiểu bằng **1/4 chiều rộng logo**. Không đặt chữ hoặc icon sát viền logo.

---

## 4. Bảng màu

### 4.1. Màu thương hiệu chính

```css
:root {
  --brand-900: #073B8C;
  --brand-800: #0D47A1;
  --brand-700: #1257C4;
  --brand-600: #1976D2;
  --brand-500: #2F80ED;
  --brand-100: #DCEBFF;
  --brand-050: #F2F7FF;

  --accent-red: #E53935;
  --accent-yellow: #FFD600;
  --accent-green: #138A63;

  --surface-page: #F5F8FC;
  --surface-card: #FFFFFF;
  --surface-soft: #EDF4FF;
  --surface-glass: rgba(255, 255, 255, 0.78);

  --text-primary: #12233F;
  --text-secondary: #5E6F88;
  --text-muted: #8794A8;
  --border-default: rgba(105, 129, 166, 0.18);

  --success: #16875E;
  --warning: #E58A00;
  --danger: #D73A49;
  --info: #1976D2;
}
```

### 4.2. Quy tắc sử dụng màu

- `brand-800` dùng cho header, nút chính, trạng thái đang chọn.
- `brand-600` dùng cho liên kết, icon tương tác, hiệu ứng hover.
- `brand-050` và `surface-page` dùng cho nền trang.
- `accent-red` chỉ dùng ở logo, trạng thái lỗi hoặc điểm nhấn cần chú ý.
- `accent-yellow` dùng cho sao, nội dung nổi bật, huy hiệu hoặc cảnh báo nhẹ.
- `accent-green` dùng cho trạng thái hoàn thành, đã nộp, hoạt động ổn định.

Không sử dụng đỏ và vàng làm màu nền lớn.

### 4.3. Gradient

Gradient chính cho header:

```css
background: linear-gradient(145deg, #073B8C 0%, #0D47A1 45%, #1976D2 100%);
```

Gradient nút hoặc card nổi bật:

```css
background: linear-gradient(135deg, #0D47A1 0%, #1E70E6 100%);
```

Không dùng quá hai gradient trên cùng một màn hình.

---

## 5. Typography

### 5.1. Font

```css
font-family: "Be Vietnam Pro", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

### 5.2. Trọng lượng chữ

- `400`: nội dung thường.
- `500`: nhãn, mô tả quan trọng.
- `600`: tiêu đề card, nút, tab.
- `700`: tiêu đề màn hình, số liệu chính.

Không nên dùng `800` hoặc `900` trong giao diện thông thường.

### 5.3. Hệ thống cỡ chữ

| Token | Kích thước | Line-height | Trọng lượng | Ứng dụng |
|---|---:|---:|---:|---|
| Display | 28 px | 36 px | 700 | Splash, tiêu đề đặc biệt |
| H1 | 22 px | 30 px | 700 | Tiêu đề màn hình |
| H2 | 18 px | 26 px | 700 | Tên người dùng, tiêu đề nhóm lớn |
| H3 | 16 px | 24 px | 600 | Tiêu đề card |
| Body | 14 px | 21 px | 400 | Nội dung chính |
| Body Small | 13 px | 19 px | 400 | Danh sách, mô tả |
| Caption | 12 px | 17 px | 400 | Metadata, ngày giờ |
| Badge | 11 px | 16 px | 600 | Trạng thái |

Không dùng chữ nhỏ hơn 11 px trên điện thoại.

---

## 6. Hệ thống khoảng cách

Dùng thang khoảng cách 4 px:

```text
4, 8, 12, 16, 20, 24, 32, 40, 48
```

Quy tắc:

- Padding ngang màn hình mobile: 16 px.
- Khoảng cách giữa các section: 20–24 px.
- Padding card: 16 px.
- Khoảng cách icon và chữ: 8–10 px.
- Khoảng cách giữa các item danh sách: 8–12 px.

---

## 7. Bo góc và độ nổi

### 7.1. Border radius

```css
--radius-xs: 8px;
--radius-sm: 12px;
--radius-md: 16px;
--radius-lg: 20px;
--radius-xl: 24px;
--radius-pill: 999px;
```

Áp dụng:

| Thành phần | Radius |
|---|---:|
| Badge | 999 px |
| Ô nhập liệu | 14–16 px |
| Card thông thường | 16–18 px |
| Card nổi bật | 20 px |
| Modal, bottom sheet | 24 px |
| Nút chính | 14–16 px |

### 7.2. Shadow

```css
--shadow-sm: 0 4px 12px rgba(20, 56, 105, 0.06);
--shadow-md: 0 10px 28px rgba(20, 56, 105, 0.10);
--shadow-lg: 0 18px 50px rgba(20, 56, 105, 0.14);
```

Không dùng bóng đen đậm. Bóng phải mang sắc xanh xám nhẹ.

---

## 8. Glassmorphism

Glassmorphism chỉ áp dụng cho:

- Hero card Trang chủ.
- Modal và bottom sheet.
- Thanh điều hướng dưới.
- Nút nổi AI.
- Một số card nổi bật.

```css
.glass {
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(255, 255, 255, 0.62);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 12px 32px rgba(18, 72, 155, 0.10);
}
```

Danh sách báo cáo và văn bản phải dùng nền trắng rõ ràng để dễ đọc.

---

## 9. Iconography

### 9.1. Bộ icon

Ưu tiên:

1. Lucide Icons.
2. Phosphor Icons.

Không trộn nhiều bộ icon trong cùng dự án.

### 9.2. Quy chuẩn

- Kích thước thường: 20–22 px.
- Kích thước trong bottom navigation: 21–23 px.
- Độ dày nét: 1.8–2 px.
- Icon mặc định là nét đơn sắc.
- Icon active có thể dùng màu xanh thương hiệu và nền xanh nhạt.
- Không dùng icon 3D, emoji, sticker hoặc minh họa hoạt hình trong chức năng chính.

### 9.3. Danh mục icon đề xuất

| Chức năng | Icon Lucide |
|---|---|
| Trang chủ | `House` |
| Công việc | `ClipboardList` |
| Báo cáo | `FileText` |
| Tri thức | `BookOpen` |
| Văn bản | `Files` |
| Đổi mới sáng tạo | `Lightbulb` |
| Cá nhân | `UserRound` |
| Thông báo | `Bell` |
| Hạn nộp | `CalendarClock` |
| Hoàn thành | `CircleCheck` |
| Chưa nộp | `Clock3` |
| Quá hạn | `TriangleAlert` |
| Tìm kiếm | `Search` |
| Bộ lọc | `SlidersHorizontal` |
| Hỏi AI | `Sparkles` hoặc `Bot` |
| Gửi bài toán | `Send` |
| Bảo mật | `LockKeyhole` |
| Tải xuống | `Download` |
| Tải lên | `Upload` |

---

## 10. Cấu trúc điều hướng

Bottom navigation cố định gồm 5 mục:

1. Trang chủ.
2. Công việc.
3. Tri thức.
4. Đổi mới.
5. Cá nhân.

Quy tắc:

- Luôn hiển thị cả icon và nhãn.
- Mục active dùng màu `brand-700`.
- Mục inactive dùng `text-muted`.
- Có thể dùng nền pill xanh nhạt cho mục active.
- Chiều cao thanh điều hướng: 64–72 px cộng safe-area.
- Không đặt nút AI vào bottom navigation; dùng nút nổi trong phần Tri thức.

---

## 11. Thiết kế từng màn hình

## 11.1. Trang chủ

### Mục tiêu

Cho người dùng biết ngay hôm nay có việc gì cần chú ý.

### Thành phần

1. Header xanh gradient.
2. Logo nhỏ, tên ứng dụng và icon thông báo.
3. Lời chào cá nhân hóa.
4. Khối ba chỉ số:
   - Thông báo mới.
   - Việc sắp đến hạn.
   - Chuyên đề nổi bật.
5. Khối Tổng quan nhanh.
6. Tin hoặc nội dung nổi bật.
7. Bottom navigation.

### Quy tắc UI

- Header cao khoảng 190–220 px.
- Phần chỉ số có thể nằm chồng nhẹ lên header.
- Không đặt quá 3 chỉ số trên cùng một hàng.
- Mỗi chỉ số dùng icon nét đơn giản và một màu nhấn.
- Tin nổi bật chỉ hiển thị một nội dung chính và nút “Xem thêm”.

---

## 11.2. Công việc / Báo cáo

### Mục tiêu

Theo dõi đợt báo cáo, hạn nộp và trạng thái các đơn vị.

### Thành phần

1. App bar trắng.
2. Card đợt báo cáo đang diễn ra.
3. Thời hạn và badge còn bao nhiêu ngày.
4. Danh sách đơn vị.
5. Bộ lọc trạng thái.
6. Nút chính “Tạo đợt báo cáo” hoặc “Nộp báo cáo”.

### Trạng thái

```text
Đã nộp      → xanh lá
Chưa nộp    → vàng cam
Quá hạn     → đỏ
Cần bổ sung → tím hoặc xanh tím
Đang xử lý  → xanh dương
```

### Quy tắc

- Mỗi hàng danh sách cao tối thiểu 64 px.
- Trạng thái phải hiển thị bằng cả màu và chữ.
- Không chỉ dựa vào màu để truyền tải trạng thái.
- Tệp đã nộp phải có thời gian nộp và số phiên bản.

---

## 11.3. Tri thức / Văn bản + AI

### Mục tiêu

Tìm nhanh văn bản, chuyên đề, quiz và hỏi AI có dẫn nguồn.

### Thành phần

1. Search bar.
2. Filter chips.
3. Card đề xuất.
4. Danh sách tài liệu phổ biến.
5. Nút nổi “Hỏi AI”.

### Quy tắc

- Search bar cao 44–48 px.
- Filter chip active dùng nền xanh và chữ trắng.
- Card văn bản cần hiển thị loại tài liệu, cơ quan ban hành, ngày và trạng thái hiệu lực.
- Không dùng thumbnail quá phức tạp; ưu tiên icon tài liệu tối giản.
- Nút AI dùng hình tròn hoặc pill, hiệu ứng nổi vừa phải.

---

## 11.4. Góc đổi mới sáng tạo

### Mục tiêu

Giới thiệu công trình và tiếp nhận bài toán, điểm nghẽn.

### Ba lối vào chính

1. Công trình đang triển khai.
2. Đã triển khai hiệu quả.
3. Gửi bài toán / điểm nghẽn.

### Card dự án nổi bật

Hiển thị:

- Trạng thái.
- Tên dự án.
- Đơn vị phụ trách.
- Mô tả ngắn.
- Tiến độ.
- Số thành viên hoặc lượt đề xuất.
- Nút xem chi tiết.

### Quy tắc

- Không dùng minh họa hoạt hình lớn.
- Dùng icon line hoặc hình học đơn giản.
- Card dự án nổi bật có thể dùng nền xanh đậm.
- Chỉ một card nổi bật trên màn hình đầu tiên.

---

## 11.5. Modal “Gửi bài toán, điểm nghẽn”

### Thành phần

- Tiêu đề.
- Nút đóng.
- Tên vấn đề.
- Đơn vị.
- Mô tả ngắn.
- Tệp minh họa nếu có.
- Ghi chú bảo mật.
- Nút “Gửi hỗ trợ”.

### Quy tắc

- Dùng modal hoặc bottom sheet theo thiết bị.
- Mobile ưu tiên bottom sheet cao tối đa 90% viewport.
- Bo góc 24 px ở phía trên.
- Overlay tối khoảng 28–36%.
- Không để modal chạm sát cạnh màn hình.
- Button chính phải nằm trong vùng dễ bấm bằng ngón cái.

---

## 12. Component Library

Các component bắt buộc phải xây dựng dùng chung:

```text
AppHeader
PageHeader
BottomNavigation
GlassCard
MetricCard
SectionHeader
StatusBadge
PrimaryButton
SecondaryButton
IconButton
SearchInput
FilterChip
ListItem
DocumentCard
ReportCampaignCard
ReportUnitRow
ProjectCard
EmptyState
LoadingSkeleton
ConfirmDialog
BottomSheet
FormField
FileUploader
Toast
FloatingAIButton
```

Không tạo style riêng lặp lại giữa các trang nếu có thể dùng component chung.

---

## 13. Button

### Primary Button

```css
.button-primary {
  min-height: 48px;
  padding: 0 20px;
  border-radius: 16px;
  background: #0D47A1;
  color: #FFFFFF;
  font-weight: 600;
  box-shadow: 0 8px 18px rgba(13, 71, 161, 0.18);
}
```

### Secondary Button

- Nền trắng.
- Viền xanh nhạt.
- Chữ xanh.
- Không dùng shadow lớn.

### Danger Button

Chỉ dùng cho hành động xóa, hủy hoặc thu hồi.

---

## 14. Form

### Input

- Chiều cao: 48 px.
- Border: 1 px màu xanh xám nhạt.
- Radius: 14–16 px.
- Focus ring màu xanh.
- Label đặt phía trên input.
- Placeholder không thay thế label.

```css
.input:focus {
  border-color: #1976D2;
  box-shadow: 0 0 0 4px rgba(25, 118, 210, 0.10);
}
```

### Validation

- Lỗi hiển thị ngay dưới trường.
- Có icon cảnh báo nhỏ.
- Không chỉ đổi màu viền.
- Thông báo lỗi phải dễ hiểu, tránh thuật ngữ kỹ thuật.

---

## 15. Trạng thái hệ thống

Bắt buộc thiết kế đủ:

- Loading.
- Empty state.
- Error state.
- Offline state.
- Không có quyền truy cập.
- Phiên đăng nhập hết hạn.
- Upload thành công.
- Upload thất bại.
- Đang gửi email.
- AI đang xử lý.

### Skeleton

Không dùng spinner toàn màn hình nếu có thể dùng skeleton theo cấu trúc nội dung.

### Toast

- Thành công: xanh lá.
- Cảnh báo: vàng cam.
- Lỗi: đỏ.
- Tự đóng sau 3–5 giây.
- Không che bottom navigation.

---

## 16. Responsive

### Mobile

- Thiết kế chính từ 360–430 px.
- Padding ngang 16 px.
- Một cột.
- Bottom navigation cố định.

### Tablet

- 768–1024 px.
- Nội dung tối đa 760–840 px.
- Có thể dùng hai cột cho dashboard và danh sách.

### Desktop

- Nội dung tối đa 1180–1280 px.
- Chuyển bottom navigation thành sidebar trái.
- Header gọn hơn.
- Không kéo card quá rộng.

---

## 17. Accessibility

- Độ tương phản chữ và nền đạt WCAG AA.
- Vùng bấm tối thiểu 44 × 44 px.
- Hỗ trợ bàn phím trên desktop.
- Có focus state rõ ràng.
- Icon quan trọng phải có `aria-label`.
- Không chỉ dùng màu để mô tả trạng thái.
- Tôn trọng `prefers-reduced-motion`.

---

## 18. Motion

Hiệu ứng phải nhanh và tiết chế:

| Hiệu ứng | Thời gian |
|---|---:|
| Hover | 120–160 ms |
| Press | 80–120 ms |
| Modal open | 200–260 ms |
| Page transition | 180–240 ms |
| Skeleton shimmer | 1.2–1.6 s |

Không dùng bounce mạnh, xoay 3D hoặc animation liên tục.

---

## 19. Design Tokens đề xuất

```css
:root {
  --font-sans: "Be Vietnam Pro", sans-serif;

  --color-brand: #0D47A1;
  --color-brand-hover: #0B3E8E;
  --color-accent: #1976D2;
  --color-bg: #F5F8FC;
  --color-card: #FFFFFF;
  --color-text: #12233F;
  --color-text-secondary: #5E6F88;

  --radius-card: 18px;
  --radius-modal: 24px;
  --radius-button: 16px;
  --radius-input: 15px;

  --spacing-page: 16px;
  --spacing-section: 24px;
  --spacing-card: 16px;

  --shadow-card: 0 8px 24px rgba(20, 56, 105, 0.08);
  --shadow-floating: 0 14px 36px rgba(20, 56, 105, 0.14);
}
```

---

## 20. Yêu cầu thi công frontend

1. Dùng CSS variables hoặc Tailwind theme để quản lý token.
2. Không hard-code màu và radius rải rác.
3. Tất cả màn hình phải sử dụng component chung.
4. Tích hợp Be Vietnam Pro bằng package hoặc Google Fonts.
5. Icon lấy từ một thư viện duy nhất.
6. Mỗi màn hình có loading, empty, error state.
7. Thiết kế mobile-first.
8. Kiểm thử ở các kích thước 360, 390, 430, 768 và 1440 px.
9. Không dùng emoji thay icon.
10. Không dùng gradient, glass và shadow quá mức.

---

## 21. Cấu trúc thư mục đề xuất

```text
src/
├── app/
├── assets/
│   └── brand/
├── components/
│   ├── common/
│   ├── navigation/
│   ├── reports/
│   ├── knowledge/
│   └── innovation/
├── design-system/
│   ├── tokens.css
│   ├── typography.css
│   ├── effects.css
│   └── components.css
├── pages/
│   ├── home/
│   ├── work/
│   ├── knowledge/
│   ├── innovation/
│   └── profile/
└── styles/
```

---

## 22. Tiêu chí nghiệm thu giao diện

Giao diện được coi là đạt khi:

- Đúng tông xanh thanh niên theo logo đã chọn.
- Font Be Vietnam Pro hoạt động trên toàn hệ thống.
- Icon tối giản, thống nhất một bộ.
- Các card và modal bo tròn, nổi khối vừa phải.
- Không có icon 3D hoặc minh họa hoạt hình dư thừa.
- Không gian trắng đủ thoáng.
- Điều hướng rõ, dùng được bằng một tay trên điện thoại.
- Trạng thái báo cáo dễ nhận biết.
- Modal gửi bài toán dễ sử dụng.
- Giao diện không vỡ trên màn hình 360 px.
- Màu đỏ và vàng chỉ là điểm nhấn.
- Các component được tái sử dụng, không sao chép CSS giữa các trang.

---

## 23. Prompt giao AGENT thiết kế UI

```text
Hãy triển khai giao diện Sổ tay Đoàn viên số theo file DESIGN.md.

Yêu cầu bắt buộc:
- Mobile-first.
- Font Be Vietnam Pro.
- Tông xanh thanh niên #0D47A1 và #1976D2 làm chủ đạo.
- Đỏ #E53935 và vàng #FFD600 chỉ dùng làm điểm nhấn nhận diện.
- Icon dùng Lucide Icons, phong cách line tối giản, không dùng icon 3D hoặc emoji.
- Card bo góc 16–20 px, modal 24 px.
- Shadow nhẹ có sắc xanh xám.
- Glassmorphism chỉ dùng cho hero, modal, bottom navigation và nút AI.
- Xây component dùng chung, không hard-code style rải rác.
- Thi công đầy đủ 5 khu vực: Trang chủ, Công việc, Tri thức, Góc đổi mới sáng tạo, Cá nhân.
- Tạo modal Gửi bài toán, điểm nghẽn.
- Bổ sung loading, empty, error và responsive state.

Trước khi code, hãy:
1. Đọc DESIGN.md và đặc tả sản phẩm.
2. Lập danh sách component dùng chung.
3. Chốt design tokens.
4. Xác định file cần tạo và file cần sửa.
5. Chỉ triển khai sau khi cấu trúc đã rõ.

Sau khi hoàn thành:
- Chạy lint, test và build.
- Chụp ảnh hoặc cung cấp mô tả giao diện ở kích thước 390 px và desktop.
- Ghi báo cáo thay đổi, file đã sửa, những điểm chưa hoàn thành và rủi ro còn lại.
```

---

## 24. Kết luận thiết kế

Phong cách chính thức của sản phẩm là:

> **Xanh thanh niên — tối giản — hiện đại — chính thống — mobile-first.**

Thiết kế giữ cấu trúc dashboard dễ sử dụng, kết hợp card bo tròn, độ nổi nhẹ và kính mờ có kiểm soát. Logo xanh, đỏ, vàng là điểm nhận diện; toàn bộ icon chức năng phải chuyển sang dạng line tối giản để giao diện trưởng thành, rõ ràng và phù hợp triển khai thực tế.
