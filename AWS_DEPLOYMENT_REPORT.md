# Báo Cáo Triển Khai Dự Án Imagify trên AWS

## 📋 Tổng Quan Dự Án

**Imagify** là ứng dụng tạo ảnh AI với tích hợp thanh toán VNPAY, bao gồm:
- Frontend React với Vite
- Backend Node.js với Express
- Tích hợp ClipDrop API để tạo ảnh AI
- Hệ thống thanh toán VNPAY
- Xác thực JWT và hệ thống credits

## 🏗️ Kiến Trúc AWS Được Đề Xuất

### 1. Tổng Quan Kiến Trúc

Kiến trúc serverless với các thành phần chính:
- **Frontend**: S3 + CloudFront
- **API**: API Gateway + Lambda Functions
- **Database**: DynamoDB
- **Authentication**: Cognito
- **Monitoring**: CloudWatch + X-Ray

![AWS Architecture](./generated-diagrams/imagify_aws_architecture.png.png)

### 2. Lý Do Chọn Kiến Trúc Serverless

#### Ưu điểm:
- **Chi phí tối ưu**: Chỉ trả tiền khi sử dụng
- **Tự động scale**: Không cần quản lý server
- **Bảo mật cao**: AWS quản lý infrastructure security
- **Độ tin cậy**: 99.9% uptime SLA
- **Phát triển nhanh**: Focus vào business logic

#### Phù hợp với dự án vì:
- Traffic không đều (burst khi tạo ảnh)
- Startup/SME với budget hạn chế
- Cần deploy nhanh và scale linh hoạt

## 🛠️ Chi Tiết Resources & Services

### Frontend Layer

#### Amazon S3 (Static Website Hosting)
```
Bucket: imagify-frontend-prod
Configuration:
- Static website hosting enabled
- Public read access for website files
- Versioning enabled for rollback
```

#### Amazon CloudFront (CDN)
```
Distribution: imagify-cdn
Configuration:
- Origin: S3 bucket
- Cache behaviors: 24h for static assets
- Compression enabled
- HTTPS redirect
- Custom domain support
```

**Lý do chọn**: 
- Chi phí thấp cho static hosting
- Performance tốt với CDN global
- SSL/TLS tự động

### API Layer

#### Amazon API Gateway (REST API)
```
API: imagify-api
Endpoints:
- POST /auth/register
- POST /auth/login  
- GET /user/credits
- POST /user/pay-vnpay
- GET /user/vnpay-return
- POST /image/generate-image
```

#### Amazon Cognito (Authentication)
```
User Pool: imagify-users
Configuration:
- Email verification
- Password policy
- JWT token expiration: 24h
- MFA optional
```

**Lý do chọn**:
- Managed authentication service
- JWT token tự động
- Tích hợp sẵn với API Gateway
- Compliance với security standards

### Compute Layer

#### AWS Lambda Functions

##### 1. Auth Lambda (imagify-auth-function)
```javascript
Runtime: Node.js 18.x
Memory: 256 MB
Timeout: 30s
Environment Variables:
- JWT_SECRET
- MONGODB_URI (DynamoDB endpoint)
```

##### 2. Image Generation Lambda (imagify-image-function)
```javascript
Runtime: Node.js 18.x
Memory: 512 MB
Timeout: 60s
Environment Variables:
- CLIPDROP_API
- DYNAMODB_TABLE_NAME
```

##### 3. Payment Lambda (imagify-payment-function)
```javascript
Runtime: Node.js 18.x
Memory: 256 MB
Timeout: 30s
Environment Variables:
- VNPAY_TMN_CODE
- VNPAY_HASH_SECRET
- VNPAY_URL
- VNPAY_RETURN_URL
```

**Lý do chọn Lambda**:
- Auto-scaling theo demand
- Pay-per-request pricing
- Không cần quản lý server
- Tích hợp tốt với API Gateway

### Database Layer

#### Amazon DynamoDB

##### Users Table
```
Table: imagify-users
Partition Key: userId (String)
Attributes:
- email (String)
- passwordHash (String)
- credits (Number)
- createdAt (String)
- updatedAt (String)

GSI: email-index
- Partition Key: email
```

##### Transactions Table
```
Table: imagify-transactions
Partition Key: transactionId (String)
Attributes:
- userId (String)
- amount (Number)
- credits (Number)
- status (String)
- vnpayData (Map)
- createdAt (String)

GSI: userId-index
- Partition Key: userId
- Sort Key: createdAt
```

##### Images Table
```
Table: imagify-images
Partition Key: imageId (String)
Attributes:
- userId (String)
- prompt (String)
- imageUrl (String)
- creditsUsed (Number)
- createdAt (String)

GSI: userId-index
- Partition Key: userId
- Sort Key: createdAt
```

**Lý do chọn DynamoDB**:
- NoSQL phù hợp với data structure
- Auto-scaling và high performance
- Serverless, không cần quản lý
- Cost-effective cho startup

### Storage Layer

#### Amazon S3 (Image Storage)
```
Bucket: imagify-images-prod
Configuration:
- Private bucket
- Lifecycle policy: Delete after 1 year
- Versioning disabled
- Server-side encryption
```

### Monitoring & Logging

#### Amazon CloudWatch
- Lambda function metrics
- API Gateway logs
- DynamoDB metrics
- Custom business metrics

#### AWS X-Ray
- Distributed tracing
- Performance analysis
- Error tracking

## 💰 Ước Tính Chi Phí Hàng Tháng

### Scenario: 1000 users, 5000 images/month

#### Compute (Lambda)
- Auth requests: 10,000/month × $0.0000002 = $0.002
- Image generation: 5,000/month × $0.000001 = $0.005
- Payment: 500/month × $0.0000002 = $0.0001
- **Total Lambda**: ~$0.01/month

#### API Gateway
- 15,500 requests × $0.0000035 = $0.054
- **Total API Gateway**: ~$0.05/month

#### DynamoDB
- 20,000 read units × $0.000125 = $2.5
- 10,000 write units × $0.000625 = $6.25
- Storage: 1GB × $0.25 = $0.25
- **Total DynamoDB**: ~$9/month

#### S3 + CloudFront
- S3 storage: 10GB × $0.023 = $0.23
- CloudFront: 50GB transfer × $0.085 = $4.25
- **Total S3+CDN**: ~$4.5/month

#### Cognito
- 1000 MAU × $0.0055 = $5.5
- **Total Cognito**: ~$5.5/month

### **Tổng Chi Phí Ước Tính: ~$19/month**

*Lưu ý: Chưa bao gồm chi phí ClipDrop API*

## 🚀 Quy Trình Triển Khai Step-by-Step

### Phase 1: Chuẩn Bị Infrastructure (1-2 ngày)

#### Step 1: Setup AWS Account & IAM
```bash
# Tạo IAM user với permissions
aws iam create-user --user-name imagify-deployer
aws iam attach-user-policy --user-name imagify-deployer --policy-arn arn:aws:iam::aws:policy/PowerUserAccess
```

#### Step 2: Setup AWS CLI & CDK
```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS CLI
aws configure

# Install CDK
npm install -g aws-cdk
cdk bootstrap
```

### Phase 2: Database Setup (1 ngày)

#### Step 3: Tạo DynamoDB Tables
```typescript
// cdk/lib/database-stack.ts
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class DatabaseStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Users Table
    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: 'imagify-users',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    usersTable.addGlobalSecondaryIndex({
      indexName: 'email-index',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
    });

    // Transactions Table
    const transactionsTable = new dynamodb.Table(this, 'TransactionsTable', {
      tableName: 'imagify-transactions',
      partitionKey: { name: 'transactionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Images Table
    const imagesTable = new dynamodb.Table(this, 'ImagesTable', {
      tableName: 'imagify-images',
      partitionKey: { name: 'imageId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
  }
}
```

#### Deploy Database
```bash
cd cdk
cdk deploy DatabaseStack
```

### Phase 3: Authentication Setup (1 ngày)

#### Step 4: Setup Cognito User Pool
```typescript
// cdk/lib/auth-stack.ts
import * as cognito from 'aws-cdk-lib/aws-cognito';

export class AuthStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, 'ImagifyUserPool', {
      userPoolName: 'imagify-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    });

    this.userPoolClient = new cognito.UserPoolClient(this, 'ImagifyUserPoolClient', {
      userPool: this.userPool,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
    });
  }
}
```

### Phase 4: Lambda Functions (2-3 ngày)

#### Step 5: Migrate Backend Code to Lambda

##### Auth Lambda Function
```typescript
// lambda/auth/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { httpMethod, path, body } = event;
    
    if (httpMethod === 'POST' && path === '/auth/register') {
      return await registerUser(JSON.parse(body || '{}'));
    }
    
    if (httpMethod === 'POST' && path === '/auth/login') {
      return await loginUser(JSON.parse(body || '{}'));
    }
    
    return {
      statusCode: 404,
      body: JSON.stringify({ message: 'Not found' }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

async function registerUser(userData: any) {
  // Implementation logic here
}

async function loginUser(credentials: any) {
  // Implementation logic here
}
```

##### Image Generation Lambda
```typescript
// lambda/image/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import axios from 'axios';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { prompt } = JSON.parse(event.body || '{}');
    
    // Call ClipDrop API
    const response = await axios.post('https://clipdrop-api.co/text-to-image/v1', {
      prompt,
    }, {
      headers: {
        'x-api-key': process.env.CLIPDROP_API,
      },
    });
    
    // Save to S3 and update user credits
    // Implementation logic here
    
    return {
      statusCode: 200,
      body: JSON.stringify({ imageUrl: response.data.imageUrl }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
```

#### Step 6: Deploy Lambda Functions
```typescript
// cdk/lib/lambda-stack.ts
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

export class LambdaStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Auth Lambda
    const authFunction = new lambda.Function(this, 'AuthFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/auth'),
      environment: {
        JWT_SECRET: process.env.JWT_SECRET!,
        USERS_TABLE: 'imagify-users',
      },
    });

    // Image Lambda
    const imageFunction = new lambda.Function(this, 'ImageFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/image'),
      timeout: Duration.seconds(60),
      memorySize: 512,
      environment: {
        CLIPDROP_API: process.env.CLIPDROP_API!,
        IMAGES_TABLE: 'imagify-images',
      },
    });

    // API Gateway
    const api = new apigateway.RestApi(this, 'ImagifyApi', {
      restApiName: 'Imagify API',
      description: 'API for Imagify application',
    });

    // Add routes
    const auth = api.root.addResource('auth');
    auth.addResource('register').addMethod('POST', new apigateway.LambdaIntegration(authFunction));
    auth.addResource('login').addMethod('POST', new apigateway.LambdaIntegration(authFunction));
  }
}
```

### Phase 5: Frontend Deployment (1 ngày)

#### Step 7: Setup S3 + CloudFront
```typescript
// cdk/lib/frontend-stack.ts
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';

export class FrontendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // S3 Bucket for website
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: 'imagify-frontend-prod',
      publicReadAccess: true,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
    });

    // CloudFront Distribution
    const distribution = new cloudfront.CloudFrontWebDistribution(this, 'WebsiteDistribution', {
      originConfigs: [{
        s3OriginSource: {
          s3BucketSource: websiteBucket,
        },
        behaviors: [{
          isDefaultBehavior: true,
          compress: true,
          allowedMethods: cloudfront.CloudFrontAllowedMethods.GET_HEAD_OPTIONS,
        }],
      }],
    });

    // Deploy website files
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset('../client/dist')],
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ['/*'],
    });
  }
}
```

#### Step 8: Build và Deploy Frontend
```bash
# Build React app
cd client
npm run build

# Deploy CDK stack
cd ../cdk
cdk deploy FrontendStack
```

### Phase 6: Monitoring & Security (1 ngày)

#### Step 9: Setup CloudWatch & X-Ray
```typescript
// cdk/lib/monitoring-stack.ts
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';

export class MonitoringStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // CloudWatch Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'ImagifyDashboard', {
      dashboardName: 'Imagify-Metrics',
    });

    // Lambda metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Invocations',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Invocations',
            dimensionsMap: {
              FunctionName: 'imagify-auth-function',
            },
          }),
        ],
      }),
    );

    // Alarms
    new cloudwatch.Alarm(this, 'HighErrorRate', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Errors',
        dimensionsMap: {
          FunctionName: 'imagify-auth-function',
        },
      }),
      threshold: 10,
      evaluationPeriods: 2,
    });
  }
}
```

### Phase 7: Testing & Go-Live (2-3 ngày)

#### Step 10: Integration Testing
```bash
# Test API endpoints
curl -X POST https://api.imagify.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'

# Test image generation
curl -X POST https://api.imagify.com/image/generate-image \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"A beautiful sunset over mountains"}'
```

#### Step 11: Performance Testing
```bash
# Load testing với Artillery
npm install -g artillery
artillery quick --count 100 --num 10 https://api.imagify.com/auth/login
```

#### Step 12: Security Hardening
- Enable WAF cho API Gateway
- Setup SSL certificates
- Configure CORS properly
- Enable CloudTrail logging
- Setup backup policies

## 🔧 Configuration Files

### Environment Variables
```bash
# Production .env
NODE_ENV=production
AWS_REGION=ap-southeast-1
JWT_SECRET=your-super-secret-jwt-key
CLIPDROP_API=your-clipdrop-api-key
VNPAY_TMN_CODE=your-vnpay-terminal-code
VNPAY_HASH_SECRET=your-vnpay-hash-secret
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=https://imagify.com/payment-result
```

### CDK App Configuration
```typescript
// cdk/bin/imagify.ts
import * as cdk from 'aws-cdk-lib';
import { DatabaseStack } from '../lib/database-stack';
import { AuthStack } from '../lib/auth-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { MonitoringStack } from '../lib/monitoring-stack';

const app = new cdk.App();

const databaseStack = new DatabaseStack(app, 'ImagifyDatabaseStack');
const authStack = new AuthStack(app, 'ImagifyAuthStack');
const lambdaStack = new LambdaStack(app, 'ImagifyLambdaStack');
const frontendStack = new FrontendStack(app, 'ImagifyFrontendStack');
const monitoringStack = new MonitoringStack(app, 'ImagifyMonitoringStack');
```

## 📊 Monitoring & Maintenance

### Key Metrics to Monitor
1. **Lambda Performance**
   - Invocation count
   - Duration
   - Error rate
   - Cold starts

2. **API Gateway**
   - Request count
   - Latency
   - 4xx/5xx errors

3. **DynamoDB**
   - Read/Write capacity
   - Throttling events
   - Item count

4. **Business Metrics**
   - User registrations
   - Images generated
   - Revenue from credits

### Backup Strategy
- DynamoDB: Point-in-time recovery enabled
- S3: Cross-region replication for images
- Code: Git repository with CI/CD

### Scaling Considerations
- Lambda: Auto-scales, monitor concurrent executions
- DynamoDB: On-demand billing scales automatically
- API Gateway: 10,000 RPS default limit
- CloudFront: Global CDN, no scaling needed

## 🚨 Disaster Recovery Plan

### RTO/RPO Targets
- **RTO (Recovery Time Objective)**: 4 hours
- **RPO (Recovery Point Objective)**: 1 hour

### Backup Procedures
1. **Database**: Daily automated backups
2. **Code**: Git repository with multiple remotes
3. **Images**: S3 cross-region replication
4. **Configuration**: Infrastructure as Code (CDK)

### Recovery Procedures
1. **Database failure**: Restore from point-in-time backup
2. **Region failure**: Failover to secondary region
3. **Code issues**: Rollback via CDK/Git
4. **Complete disaster**: Rebuild from CDK templates

## 💡 Optimization Recommendations

### Performance
1. **Caching**: Implement Redis for session data
2. **CDN**: Use CloudFront for API responses
3. **Database**: Add read replicas for heavy queries
4. **Images**: Implement lazy loading and compression

### Cost Optimization
1. **Reserved Capacity**: For predictable DynamoDB usage
2. **S3 Lifecycle**: Move old images to cheaper storage classes
3. **Lambda**: Optimize memory allocation based on usage
4. **CloudFront**: Configure appropriate cache behaviors

### Security Enhancements
1. **WAF**: Add rate limiting and SQL injection protection
2. **Secrets Manager**: Store API keys securely
3. **VPC**: Move Lambda functions to private subnets
4. **Encryption**: Enable encryption at rest for all services

## 📈 Future Scaling Path

### Phase 1 (0-1K users)
- Current serverless architecture
- Single region deployment
- Basic monitoring

### Phase 2 (1K-10K users)
- Add ElastiCache for session management
- Implement API rate limiting
- Enhanced monitoring and alerting

### Phase 3 (10K+ users)
- Multi-region deployment
- Microservices architecture
- Advanced analytics and ML features

## 🎯 Success Metrics

### Technical KPIs
- **Uptime**: >99.9%
- **API Response Time**: <500ms p95
- **Error Rate**: <0.1%
- **Cold Start**: <3s

### Business KPIs
- **User Growth**: 20% month-over-month
- **Image Generation**: 5 images/user/month
- **Revenue**: $1000/month by month 6
- **User Retention**: >60% monthly active users

---

**Tổng thời gian triển khai ước tính: 7-10 ngày**
**Tổng chi phí setup: $0 (chỉ có chi phí vận hành hàng tháng)**
**Skill requirements: AWS, Node.js, React, CDK/CloudFormation**
