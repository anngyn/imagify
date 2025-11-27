# Imagify Quick Reference

## 🚀 Current Status (2025-11-27)
- ✅ **Infrastructure**: Deployed to Singapore (ap-southeast-1)
- ✅ **Authentication**: Working (373ms avg)
- ✅ **Performance**: 40-50% improvement vs US East
- 🔄 **Image Generation**: Needs Bedrock model access enablement

## 📍 Key Endpoints
```
API Base: https://atp6bmow87.execute-api.ap-southeast-1.amazonaws.com/prod/
Cognito Pool: ap-southeast-1_MB0WRuCHA
Client ID: 7n94jsqv65pk6rblp4avitqjmr
```

## 🧪 Test User
```json
{
  "email": "perf@test.com", 
  "password": "TestPass123!",
  "credits": 10
}
```

## ⚡ Quick Commands
```bash
# Performance Test
cd /home/prj/imagify && python3 test_performance.py

# Deploy Changes  
cd infrastructure && npx cdk deploy --require-approval never

# Check DynamoDB Tables
aws dynamodb list-tables --region ap-southeast-1

# Test Login
curl -X POST https://atp6bmow87.execute-api.ap-southeast-1.amazonaws.com/prod/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "perf@test.com", "password": "TestPass123!"}'
```

## 🔧 Pending Issues
1. **Image Generation**: Enable Titan models in Bedrock console (US East)
2. **Payment Performance**: 1037ms avg - needs optimization
3. **CloudFront**: Static asset caching not yet implemented

## 📊 Performance Targets
- Login: <300ms (currently 373ms)
- Credits: <200ms (currently 392ms) 
- Payment: <500ms (currently 1037ms)
- Image Gen: <5000ms (pending fix)

## 🏗️ Architecture Notes
- **Main Stack**: Singapore region for low latency
- **Bedrock**: Cross-region to US East (only region with image models)
- **DynamoDB**: EmailIndex GSI required for authentication
- **S3**: Singapore region for image storage
