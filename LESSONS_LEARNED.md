# Lessons Learned - Imagify Project

*Ghi chú các lỗi và bài học từ dự án AI Image Generator*

---

## 📅 Timeline: November 2025

### 🔧 Infrastructure & Deployment Issues

#### 1. CDK "No Changes" False Positive
**Lỗi**: CDK hiển thị "no changes" nhưng thực tế cần update
**Giải pháp**: Destroy và redeploy stack hoàn toàn
```bash
cdk destroy
cdk deploy
```
**Bài học**: CDK đôi khi không detect được changes trong Lambda code hoặc configuration

#### 2. Cognito Authorizer JWT Token Format
**Lỗi**: API Gateway Authorizer không work với access tokens
**Giải pháp**: Sử dụng ID tokens thay vì access tokens
**Bài học**: 
- ID tokens chứa user claims cần thiết cho authorization
- Access tokens chỉ dùng để call APIs, không phù hợp cho custom authorizers

#### 3. WAF v2 Configuration
**Thành công**: Implement WAF với rate limiting (2000 requests/IP)
**Bài học**: WAF v2 cung cấp better protection và managed rules

#### 4. Secrets Manager Integration
**Thành công**: Migrate VNPAY credentials từ environment variables sang Secrets Manager
**Bài học**: 
- Secrets Manager secure hơn cho production
- Auto-generate hash secrets tăng security
- Lambda cần IAM permissions để access secrets

### 💰 Cost Optimization Insights

#### 1. Route53 Custom Domain
**Phát hiện**: Custom domain cost $36/year cho .com domain
**Quyết định**: Sử dụng default API Gateway URL cho development
**Bài học**: 
- Development environments không cần custom domain
- Production có thể justify cost này
- API Gateway URLs work perfectly cho testing

### 🔒 Security Enhancements

#### 1. Enterprise-Grade Security Stack
**Implemented**:
- WAF v2 với AWS managed rules
- Secrets Manager cho sensitive data
- Cognito User Pool authentication
- IAM least privilege roles

**Bài học**: Security layers không impact performance nhưng tăng đáng kể độ tin cậy

### 🧪 Testing & Validation

#### 1. End-to-End Testing Results
**All endpoints working**:
- Register: 201 ✅
- Login: 200 ✅  
- Credits: 200 ✅
- Image Generation: 200 ✅
- Payment: 200 ✅

**Bài học**: Systematic testing từng endpoint giúp identify issues sớm

### 🏗️ Architecture Decisions

#### 1. Serverless Architecture Choice
**Thành công**: 65+ AWS resources deployed successfully
**Components**:
- API Gateway + Lambda
- DynamoDB cho user data
- S3 cho image storage
- Bedrock cho AI image generation
- Cognito cho authentication

**Bài học**: Serverless architecture scale tốt và cost-effective cho startup

#### 2. Bedrock Integration
**Thành công**: Titan Image Generator working perfectly
**Bài học**: AWS Bedrock cung cấp high-quality AI models với simple integration

---

## 🎯 Key Takeaways

1. **Infrastructure as Code**: CDK giúp manage complex AWS resources hiệu quả
2. **Security First**: Implement security từ đầu, không phải afterthought  
3. **Cost Awareness**: Evaluate từng service cost, especially cho development vs production
4. **Testing Strategy**: End-to-end testing critical cho multi-service architecture
5. **Documentation**: Ghi chú lessons learned giúp avoid repeat mistakes

---

## 📝 Next Actions

- [ ] Monitor CloudWatch metrics sau deployment
- [ ] Setup alerts cho error rates và costs
- [ ] Document API usage patterns
- [ ] Plan production deployment strategy

### 🔧 Frontend Configuration Issues

#### 1. Stale API Configuration After Redeploy
**Lỗi**: Frontend .env file có API URLs và Cognito IDs cũ sau khi redeploy infrastructure
**Giải pháp**: Update .env với thông tin mới từ CDK output
```bash
# Old config
VITE_API_URL=https://8sk9b0jq1h.execute-api.us-east-1.amazonaws.com/prod
VITE_COGNITO_USER_POOL_ID=us-east-1_v0GSIWxr7
VITE_COGNITO_CLIENT_ID=733spmkb0udelksa5u0u8g90hh

# New config  
VITE_API_URL=https://3zmzkpxgga.execute-api.us-east-1.amazonaws.com/prod
VITE_COGNITO_USER_POOL_ID=us-east-1_wlP1crudg
VITE_COGNITO_CLIENT_ID=1uit7s65nv4m9av3mmiaktf6d7
```
**Bài học**: 
- Sau mỗi lần destroy/redeploy CDK, cần update frontend config
- Nên automate việc này trong CI/CD pipeline
- Consider sử dụng CDK outputs để auto-generate frontend config

### 🔧 Jenkins Setup Issues

#### 1. Jenkins Initial Setup Loading Forever
**Lỗi**: Sau khi nhập initial admin password, Jenkins cứ loading mãi không hiện gì
**Nguyên nhân**: Network connection issues khi download plugins (SocketException: Connection reset)
**Giải pháp**:
1. **Restart browser** với hard refresh (Ctrl+F5)
2. **Restart Jenkins container**: `docker restart jenkins-imagify`
3. **Skip plugin installation**: Chọn "Select plugins to install" → "None" → Continue
4. **Manual plugin install**: Install plugins sau khi setup xong

**Bài học**: 
- Jenkins initial setup có thể fail do network issues
- Có thể skip plugin installation và install manual sau
- Container restart thường fix network connection issues

---

*File này sẽ được update sau mỗi issue hoặc lesson learned mới*
