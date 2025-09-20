# Imagify - AI Image Generator với VNPAY Payment

Ứng dụng tạo ảnh AI với tích hợp thanh toán VNPAY để mua credits.

## 🚀 Tính năng

- **Tạo ảnh AI**: Sử dụng ClipDrop API để tạo ảnh từ text prompt
- **Hệ thống Credits**: Người dùng cần credits để tạo ảnh
- **Thanh toán VNPAY**: Tích hợp cổng thanh toán VNPAY để mua credits
- **Xác thực JWT**: Đăng ký, đăng nhập với JWT token
- **Responsive UI**: Giao diện thân thiện trên mọi thiết bị

## 📋 Yêu cầu hệ thống

- Node.js (v16 trở lên)
- MongoDB
- NPM hoặc Yarn

## 🛠️ Cài đặt

### 1. Clone repository

```bash
git clone <repository-url>
cd imagify
```

### 2. Cài đặt dependencies

#### Backend (Server)

```bash
cd server
npm install
```

#### Frontend (Client)

```bash
cd client
npm install
```

### 3. Cấu hình môi trường

#### Server (.env)

Tạo file `server/.env`:

```env
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/imagify

# JWT Secret
JWT_SECRET=your_jwt_secret_key

# ClipDrop API
CLIPDROP_API=your_clipdrop_api_key

# VNPAY Configuration
VNPAY_TMN_CODE=your_terminal_code
VNPAY_HASH_SECRET=your_hash_secret
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=http://localhost:5173/payment-result

# Currency
CURRENCY=VND
```

#### Client (.env)

Tạo file `client/.env`:

```env
VITE_BACKEND_URL=http://localhost:4000
```

### 4. Cấu hình VNPAY

1. Đăng ký tài khoản test tại [VNPAY Sandbox](https://sandbox.vnpayment.vn/)
2. Lấy thông tin:
   - Terminal Code (vnp_TmnCode)
   - Hash Secret (vnp_HashSecret)
3. Cập nhật vào file `server/.env`

### 5. Cấu hình ClipDrop API

1. Đăng ký tại [ClipDrop](https://clipdrop.co/apis)
2. Lấy API key
3. Cập nhật vào file `server/.env`

## 🚀 Chạy ứng dụng

### Development Mode

#### 1. Chạy Backend

```bash
cd server
npm start
```

Server sẽ chạy tại: http://localhost:4000

#### 2. Chạy Frontend

```bash
cd client
npm run dev
```

Client sẽ chạy tại: http://localhost:5173

### Production Mode

#### Build Frontend

```bash
cd client
npm run build
```

#### Deploy

- Backend: Deploy lên Heroku, Railway, hoặc VPS
- Frontend: Deploy lên Vercel, Netlify
- Database: Sử dụng MongoDB Atlas

## 📁 Cấu trúc thư mục

```
imagify/
├── client/                 # Frontend React
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/         # Trang chính
│   │   ├── context/       # Context API
│   │   └── assets/        # Hình ảnh, icons
│   └── package.json
├── server/                # Backend Node.js
│   ├── controller/        # Controllers
│   ├── models/           # MongoDB models
│   ├── routes/           # API routes
│   ├── middlewares/      # Middlewares
│   ├── utils/            # Utilities (VNPAY)
│   ├── config/           # Database config
│   └── package.json
└── README.md
```

## 🔧 API Endpoints

### Authentication

- `POST /api/user/register` - Đăng ký
- `POST /api/user/login` - Đăng nhập
- `GET /api/user/credits` - Lấy thông tin credits

### Payment

- `POST /api/user/pay-vnpay` - Tạo URL thanh toán VNPAY
- `GET /api/user/vnpay-return` - Xử lý callback từ VNPAY

### Image Generation

- `POST /api/image/generate-image` - Tạo ảnh AI

## 💳 Gói Credits

| Gói      | Credits | Giá (VND) |
| -------- | ------- | --------- |
| Basic    | 100     | 10,000    |
| Advanced | 500     | 50,000    |
| Business | 5,000   | 100,000   |

## 🔒 Bảo mật

- JWT token cho authentication
- Bcrypt để hash password
- CORS protection
- Input validation
- VNPAY signature verification

## 🐛 Troubleshooting

### Lỗi thường gặp

1. **"Cannot find module"**

   ```bash
   npm install
   ```

2. **"Database connection failed"**

   - Kiểm tra MONGODB_URI trong .env
   - Đảm bảo MongoDB đang chạy

3. **"VNPAY signature error"**

   - Kiểm tra VNPAY_HASH_SECRET
   - Đảm bảo Terminal Code đúng

4. **"ClipDrop API error"**
   - Kiểm tra CLIPDROP_API key
   - Đảm bảo có đủ quota

### Debug Mode

Thêm vào file .env:

```env
NODE_ENV=development
DEBUG=true
```

## 📞 Hỗ trợ

- Email: support@imagify.com
- Documentation: [Link docs]
- Issues: [GitHub Issues]

## 📄 License

MIT License - xem file LICENSE để biết thêm chi tiết.

## 🤝 Đóng góp

1. Fork repository
2. Tạo feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Tạo Pull Request

## 📝 Changelog

### v1.0.0

- Tích hợp VNPAY payment gateway
- Hệ thống tạo ảnh AI với ClipDrop
- Authentication với JWT
- Responsive UI design

---

**Lưu ý**: Đây là phiên bản demo sử dụng VNPAY Sandbox. Để sử dụng production, cần đăng ký tài khoản VNPAY chính thức và cập nhật URL endpoint.
