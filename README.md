# Imagify - AI Image Generator với VNPAY Payment

Ứng dụng tạo ảnh AI với tích hợp thanh toán VNPAY để mua credits.

## 🚀 Tính năng

- **Tạo ảnh AI**: Sử dụng Amazon Bedrock để tạo ảnh từ text prompt
- **Hệ thống Credits**: Người dùng cần credits để tạo ảnh
- **Thanh toán VNPAY**: Tích hợp cổng thanh toán VNPAY để mua credits
- **Xác thực AWS Cognito**: Đăng ký, đăng nhập với Cognito User Pool
- **Responsive UI**: Giao diện thân thiện trên mọi thiết bị
- **CI/CD Pipeline**: Automated deployment với GitHub Actions

## 🏗️ Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
│   Users     │───▶│  CloudFront  │───▶│   S3 Website    │
└─────────────┘    └──────────────┘    └─────────────────┘
                                                │
                                                ▼
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
│    WAF      │◀───│ API Gateway  │◀───│   React App     │
└─────────────┘    └──────────────┘    └─────────────────┘
                           │
                           ▼
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
│  DynamoDB   │◀───│   Lambda     │───▶│  Amazon Bedrock │
└─────────────┘    └──────────────┘    └─────────────────┘
                           │
                           ▼
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
│     S3      │◀───│   Cognito    │───▶│     VNPAY       │
└─────────────┘    └──────────────┘    └─────────────────┘
```

## 📋 Yêu cầu hệ thống

- Node.js (v18 trở lên)
- AWS CLI configured
- AWS CDK v2
- NPM hoặc Yarn

## 🛠️ Cài đặt

### 1. Clone repository

```bash
git clone <repository-url>
cd imagify
```

### 2. Cài đặt dependencies

```bash
# Infrastructure
cd infrastructure && npm install

# Server dependencies (for local development)
cd ../server && npm install

# Client dependencies
cd ../client && npm install
```

### 3. Cấu hình môi trường

#### Infrastructure (.env)

Tạo file `infrastructure/.env`:

```env
# VNPAY Configuration
VNPAY_TMN_CODE=your_terminal_code
VNPAY_HASH_SECRET=your_hash_secret
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=https://your-domain.com/payment-result

# AWS Configuration
AWS_REGION=us-east-1
```

### 4. Deploy Infrastructure

```bash
cd infrastructure
npm run build
npx cdk bootstrap
npx cdk deploy
```

## 🚀 CI/CD Pipeline

### GitHub Actions Workflows:

1. **PR Quality Check** (`pr-check.yml`):
   - Lint code
   - Run tests
   - Security audit
   - CDK synth validation

2. **Main Deployment** (`deploy.yml`):
   - Deploy infrastructure to AWS
   - Update Lambda functions
   - Generate deployment outputs

3. **Frontend Deployment** (`frontend-deploy.yml`):
   - Build React app with API URLs
   - Deploy to S3 bucket
   - Invalidate CloudFront cache

### Required GitHub Secrets:

```bash
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
VNPAY_TMN_CODE=your_vnpay_terminal_code
VNPAY_HASH_SECRET=your_vnpay_hash_secret
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=https://your-domain.com/payment-result
```

## 📁 Cấu trúc thư mục

```
imagify/
├── .github/
│   ├── workflows/          # CI/CD pipelines
│   ├── CODEOWNERS         # Code review assignments
│   └── pull_request_template.md
├── client/                # Frontend React
├── server/                # Backend Node.js (for local dev)
├── infrastructure/        # AWS CDK Infrastructure
│   ├── lib/              # CDK stacks
│   ├── lambda/           # Lambda functions
│   └── bin/              # CDK app entry
└── README.md
```

## 🔧 API Endpoints

### Authentication
- `POST /auth/register` - Đăng ký
- `POST /auth/login` - Đăng nhập
- `GET /user/credits` - Lấy thông tin credits

### Payment
- `POST /payment/vnpay` - Tạo URL thanh toán VNPAY
- `GET /payment/vnpay-return` - Xử lý callback từ VNPAY

### Image Generation
- `POST /image/generate` - Tạo ảnh AI với Bedrock

## 💳 Gói Credits

| Gói      | Credits | Giá (VND) |
|----------|---------|-----------|
| Basic    | 100     | 10,000    |
| Advanced | 500     | 50,000    |
| Business | 5,000   | 100,000   |

## 🔒 Bảo mật

- AWS Cognito User Pool authentication
- IAM roles với least privilege
- CORS protection
- Input validation
- VNPAY signature verification
- Secrets Manager for sensitive data

## 🚀 Deployment

### Manual Deployment:
```bash
cd infrastructure
npm run build
cdk deploy
```

### Automated Deployment:
Push to `main` branch triggers automatic deployment via GitHub Actions.

## 🐛 Troubleshooting

### Common Issues:

1. **CDK Bootstrap Error**
   ```bash
   cdk bootstrap aws://ACCOUNT-ID/REGION
   ```

2. **Lambda Function Timeout**
   - Check CloudWatch logs
   - Increase timeout in CDK stack

3. **VNPAY Integration Issues**
   - Verify sandbox credentials
   - Check return URL configuration

4. **Bedrock Access Denied**
   - Enable Bedrock models in AWS Console
   - Verify IAM permissions

## 📊 Monitoring

- **CloudWatch Logs**: Lambda function logs
- **CloudWatch Metrics**: API Gateway, Lambda metrics
- **X-Ray Tracing**: Distributed tracing (optional)

## 🤝 Contributing

1. Fork repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Create Pull Request

## 📝 Changelog

### v2.0.0 (Current)
- Migrated to AWS serverless architecture
- Added Amazon Bedrock integration
- Implemented CI/CD pipeline
- Enhanced security with Cognito

### v1.0.0
- Initial version with Node.js/Express backend
- ClipDrop API integration
- Basic VNPAY integration

---

**Production Ready**: Sử dụng AWS production services và VNPAY production credentials cho môi trường thực tế.
