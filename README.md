# AWS SAA-C03 Practice App

Ứng dụng luyện thi AWS Certified Solutions Architect – Associate được xây dựng bằng **React + Vite + TypeScript**. UI tham khảo các ảnh CertLab người dùng cung cấp; dữ liệu câu hỏi lấy từ 11 file JSON hiện có.

## Chạy local

Yêu cầu Node.js 20.19+ hoặc 22.12+.

```bash
npm install
npm run dev
```

Mở URL Vite hiển thị trong terminal (thường là `http://localhost:5173`).

## Build production

```bash
npm run build
npm run preview
```

Bản build tĩnh được tạo tại `dist/`.

## Tính năng

- 11 set, mỗi set tối đa 65 câu; set cuối tự động có số câu ít hơn nếu cần.
- Gộp tuần tự câu hỏi từ `public/data/exam-00.json` đến `exam-10.json`, sau đó chia thành các set 65 câu theo tổng số câu. Vì `exam-01.json` có 37 câu, ranh giới set được tính trên pool tổng hợp, không mặc định một JSON tương ứng một set.
- Single-select và multi-select, chọn số đáp án theo `selectCount`/`correctAnswers`.
- Shuffle câu hỏi mỗi phiên; Exam Mode giữ thứ tự option đã xáo trộn ổn định trong phiên.
- Đồng hồ đếm ngược, tự nộp khi hết giờ nếu bật Auto-Submit.
- Question map, trạng thái câu đã trả lời/đúng/sai, xác nhận đáp án ở Practice Mode.
- Trang kết quả, điểm số, review câu trả lời.
- Lưu tiến độ và tùy chọn vào `localStorage`, có thể tiếp tục sau khi refresh.
- Giao diện responsive và dark mode cơ bản.

## Cấu trúc

```text
src/
  App.tsx       # UI và logic phiên luyện thi
  main.tsx      # Entry point
  styles.css    # UI responsive
  types.ts      # Types của dữ liệu
public/data/    # 11 JSON câu hỏi
```

## Lưu ý dữ liệu

- App giữ nguyên nội dung câu hỏi/đáp án trong các JSON nguồn; các câu có tag `needs-review` vẫn có thể được luyện tập nhưng nên kiểm tra lại trước khi coi đây là bộ đề chuẩn.
- Một số câu nguồn có `correctAnswers` rỗng do thiếu dữ liệu. App không tính câu bỏ trống/không có đáp án chuẩn là đúng.
- Dữ liệu tiến độ lưu ở trình duyệt hiện tại, chưa đồng bộ đa thiết bị và chưa có tài khoản/backend.
- Nút **Ask AI** hiện là placeholder; cần backend/API và chính sách bảo vệ API key trước khi tích hợp mô hình thật.
