# Hướng dẫn Triển khai Hệ thống HRM lên Web

Hệ thống đã được cấu hình để có thể chạy trên môi trường Web, cho phép truy cập từ nhiều máy tính khác nhau thông qua mạng nội bộ hoặc Internet.

## 1. Truy cập qua Mạng Nội bộ (LAN)

Nếu bạn muốn các máy tính trong cùng văn phòng truy cập vào hệ thống đang chạy trên máy của mình:

1. **Tìm địa chỉ IP của máy chủ**:
   - Mở Terminal/Command Prompt.
   - Gõ `ipconfig` (trên Windows) hoặc `ifconfig` (trên Mac/Linux).
   - Tìm dòng `IPv4 Address` (Ví dụ: `192.168.1.15`).

2. **Truy cập từ máy khác**:
   - Mở trình duyệt trên máy tính khác.
   - Nhập địa chỉ: `http://192.168.1.15:5000` (Thay IP bằng IP máy bạn).

## 2. Triển khai lên Internet (Cloud Hosting)

Để hệ thống có một đường link độc lập (ví dụ: `https://my-hrm-system.onrender.com`), bạn có thể sử dụng các dịch vụ sau:

### Lựa chọn A: Render.com (Khuyên dùng - Miễn phí)
1. Đẩy mã nguồn lên một kho lưu trữ **GitHub**.
2. Đăng nhập vào [Render.com](https://render.com).
3. Chọn **New > Web Service**.
4. Kết nối với Repo GitHub của bạn.
5. Cấu hình:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
6. Nhấn **Deploy**. Sau vài phút, bạn sẽ có một link `https://...` để truy cập từ bất cứ đâu.

### Lựa chọn B: Vercel (Cho Frontend)
Lưu ý: Vercel chủ yếu cho Frontend. Vì hệ thống này có Backend đi kèm, Render hoặc Heroku sẽ phù hợp hơn cho việc triển khai toàn diện.

## 3. Các lưu ý quan trọng

- **Bảo mật**: Khi đưa lên Internet, hãy đảm bảo bạn đã thay đổi mật khẩu mặc định của các tài khoản Admin.
- **Cơ sở dữ liệu**: Hệ thống hiện đang dùng NeDB (lưu file cục bộ). Khi deploy lên các dịch vụ như Heroku/Render bản miễn phí, các file này có thể bị xóa khi server khởi động lại. Để lưu trữ vĩnh viễn, bạn nên cân nhắc chuyển sang MongoDB Atlas (Hệ thống đã viết code tương thích cơ bản).
- **Tên miền**: Bạn có thể mua tên miền riêng và trỏ về địa chỉ Cloud Hosting để có đường link chuyên nghiệp hơn.

---
Chúc bạn triển khai thành công!
