import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { MonitoringStack } from './monitoring-stack';

export class ImagifySecureStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Tables
    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 3,
      writeCapacity: 2,
      encryption: dynamodb.TableEncryption.AWS_MANAGED
    });

    // Add GSI for email lookup
    usersTable.addGlobalSecondaryIndex({
      indexName: 'EmailIndex',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      readCapacity: 2,
      writeCapacity: 2
    });

    const imagesTable = new dynamodb.Table(this, 'ImagesTable', {
      partitionKey: { name: 'imageId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 3,
      writeCapacity: 2,
      encryption: dynamodb.TableEncryption.AWS_MANAGED
    });

    const transactionsTable = new dynamodb.Table(this, 'TransactionsTable', {
      partitionKey: { name: 'transactionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 2,
      writeCapacity: 3,
      encryption: dynamodb.TableEncryption.AWS_MANAGED
    });

    // S3 Buckets
    const imagesBucket = new s3.Bucket(this, 'ImagesBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicPolicy: false,
        restrictPublicBuckets: false
      }),
      versioned: true
    });

    // Add public read policy for images
    imagesBucket.addToResourcePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:GetObject'],
      resources: [imagesBucket.bucketArn + '/images/*']
    }));

    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      websiteIndexDocument: 'index.html',
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicPolicy: false,
        restrictPublicBuckets: false
      })
    });

    // Secrets Manager for VNPAY credentials
    const vnpaySecret = new secretsmanager.Secret(this, 'VnpaySecret', {
      description: 'VNPAY payment gateway credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ 
          tmn_code: process.env.VNPAY_TMN_CODE || 'SANDBOX_TMN_CODE',
          return_url: 'http://localhost:5173/payment-result'
        }),
        generateStringKey: 'hash_secret',
        excludeCharacters: '"@/\\'
      }
    });

    // Cognito User Pool
    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true
      }
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      generateSecret: false,
      authFlows: {
        adminUserPassword: true,
        userPassword: true,
        userSrp: true
      }
    });

    // Lambda Role
    const lambdaRole = new iam.Role(this, 'LambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ],
      inlinePolicies: {
        DynamoDBAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Query', 'dynamodb:Scan'],
              resources: [
                usersTable.tableArn, 
                usersTable.tableArn + '/index/*',  // GSI permissions
                imagesTable.tableArn,
                transactionsTable.tableArn
              ]
            })
          ]
        }),
        CognitoAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'cognito-idp:AdminCreateUser',
                'cognito-idp:AdminSetUserPassword',
                'cognito-idp:AdminInitiateAuth',
                'cognito-idp:AdminGetUser',
                'cognito-idp:AdminUpdateUserAttributes'
              ],
              resources: [userPool.userPoolArn]
            })
          ]
        }),
        BedrockAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
              resources: [
                'arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-image-generator-v1',
                'arn:aws:bedrock:us-east-1::foundation-model/stability.stable-diffusion-xl-v1',
                'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-canvas-v1:0'
              ]
            })
          ]
        }),
        S3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['s3:PutObject', 's3:GetObject'],
              resources: [imagesBucket.bucketArn + '/*']
            })
          ]
        }),
        CloudWatchMetrics: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['cloudwatch:PutMetricData'],
              resources: ['*']
            })
          ]
        }),
        SecretsManagerAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['secretsmanager:GetSecretValue'],
              resources: [vnpaySecret.secretArn]
            })
          ]
        })
      }
    });

    // Lambda Functions with cost optimization
    const authLambda = new lambda.Function(this, 'AuthFunction', {
      runtime: lambda.Runtime.PYTHON_3_10,
      handler: 'auth.handler',
      code: lambda.Code.fromAsset('lambda'),
      role: lambdaRole,
      memorySize: 1024,  // Higher memory = faster execution = lower cost per request
      timeout: cdk.Duration.seconds(15),  // Shorter timeout
      environment: {
        USERS_TABLE: usersTable.tableName,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId
      },
      // Enable ARM64 for better price/performance
      architecture: lambda.Architecture.ARM_64
    });

    // Add minimal provisioned concurrency (cost-optimized)
    const authAlias = new lambda.Alias(this, 'AuthLambdaAlias', {
      aliasName: 'live',
      version: authLambda.currentVersion
    });

    authAlias.addAutoScaling({
      minCapacity: 1,
      maxCapacity: 2
    });

    const imageGenLambda = new lambda.Function(this, 'ImageGenFunction', {
      runtime: lambda.Runtime.PYTHON_3_10,
      handler: 'image_gen.handler',
      code: lambda.Code.fromAsset('lambda'),
      role: lambdaRole,
      timeout: cdk.Duration.minutes(5),
      environment: {
        IMAGES_TABLE: imagesTable.tableName,
        IMAGES_BUCKET: imagesBucket.bucketName
      }
    });

    const paymentLambda = new lambda.Function(this, 'PaymentFunction', {
      runtime: lambda.Runtime.PYTHON_3_10,
      handler: 'payment.handler',
      code: lambda.Code.fromAsset('lambda'),
      role: lambdaRole,
      environment: {
        USERS_TABLE: usersTable.tableName,
        VNPAY_SECRET_ARN: vnpaySecret.secretArn
      }
    });

    // API Gateway with caching
    const api = new apigateway.RestApi(this, 'ImagifyApi', {
      restApiName: 'Imagify API',
      defaultCorsPreflightOptions: {
        allowOrigins: [
          'https://imagify.com',
          'https://www.imagify.com',
          'http://localhost:*'
        ],
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization']
      },
      deployOptions: {
        cachingEnabled: true,
        cacheClusterEnabled: true,
        cacheClusterSize: '0.5',  // Smallest cache size for cost optimization
        cacheTtl: cdk.Duration.minutes(5)  // 5 minute cache
      }
    });

    // Cognito Authorizer with optimized caching
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      identitySource: 'method.request.header.Authorization',
      resultsCacheTtl: cdk.Duration.minutes(15) // Reduce from 60 to 15 min for faster updates
    });

    // API Routes
    const auth = api.root.addResource('auth');
    auth.addResource('register').addMethod('POST', new apigateway.LambdaIntegration(authLambda));
    auth.addResource('login').addMethod('POST', new apigateway.LambdaIntegration(authLambda));

    const user = api.root.addResource('user');
    user.addResource('credits').addMethod('GET', new apigateway.LambdaIntegration(authLambda), {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      requestParameters: {
        'method.request.header.Authorization': true
      },
      methodResponses: [{
        statusCode: '200',
        responseParameters: {
          'method.response.header.Cache-Control': true
        }
      }]
    });

    const image = api.root.addResource('image');
    image.addResource('generate').addMethod('POST', new apigateway.LambdaIntegration(imageGenLambda), {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });

    const payment = api.root.addResource('payment');
    payment.addResource('vnpay').addMethod('POST', new apigateway.LambdaIntegration(paymentLambda), {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });
    payment.addResource('callback').addMethod('GET', new apigateway.LambdaIntegration(paymentLambda));

    // WAF v2 for API Gateway protection
    const webAcl = new wafv2.CfnWebACL(this, 'ImagifyWebACL', {
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      rules: [
        {
          name: 'RateLimitRule',
          priority: 1,
          statement: {
            rateBasedStatement: {
              limit: 2000,
              aggregateKeyType: 'IP'
            }
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRule'
          }
        },
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet'
            }
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSetMetric'
          }
        }
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'ImagifyWebACL'
      }
    });

    // Associate WAF with API Gateway
    new wafv2.CfnWebACLAssociation(this, 'WebACLAssociation', {
      resourceArn: `arn:aws:apigateway:${this.region}::/restapis/${api.restApiId}/stages/${api.deploymentStage.stageName}`,
      webAclArn: webAcl.attrArn
    });

    // CloudFront Distribution with optimized static asset caching
    const distribution = new cloudfront.CloudFrontWebDistribution(this, 'Distribution', {
      originConfigs: [
        // Static assets from S3 (primary) - optimized caching
        {
          s3OriginSource: {
            s3BucketSource: frontendBucket
          },
          behaviors: [{
            isDefaultBehavior: true,
            allowedMethods: cloudfront.CloudFrontAllowedMethods.GET_HEAD_OPTIONS,
            cachedMethods: cloudfront.CloudFrontAllowedCachedMethods.GET_HEAD_OPTIONS,
            compress: true,
            defaultTtl: cdk.Duration.days(30), // Long cache for static assets
            maxTtl: cdk.Duration.days(365),
            minTtl: cdk.Duration.seconds(0),
            forwardedValues: {
              queryString: false,
              headers: ['Origin', 'Access-Control-Request-Method', 'Access-Control-Request-Headers']
            }
          }]
        },
        // API Gateway (secondary) - selective caching
        {
          customOriginSource: {
            domainName: api.restApiId + '.execute-api.' + this.region + '.amazonaws.com',
            httpPort: 443,
            originProtocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY
          },
          behaviors: [
            // Cache user credits endpoint
            {
              pathPattern: '/prod/user/credits',
              allowedMethods: cloudfront.CloudFrontAllowedMethods.GET_HEAD_OPTIONS,
              cachedMethods: cloudfront.CloudFrontAllowedCachedMethods.GET_HEAD_OPTIONS,
              compress: true,
              defaultTtl: cdk.Duration.minutes(5),
              maxTtl: cdk.Duration.minutes(10),
              minTtl: cdk.Duration.seconds(0),
              forwardedValues: {
                queryString: false,
                headers: ['Authorization', 'Origin', 'Access-Control-Request-Method']
              }
            },
            // No cache for dynamic endpoints
            {
              pathPattern: '/prod/*',
              allowedMethods: cloudfront.CloudFrontAllowedMethods.ALL,
              defaultTtl: cdk.Duration.seconds(0),
              maxTtl: cdk.Duration.seconds(0),
              minTtl: cdk.Duration.seconds(0),
              forwardedValues: {
                queryString: true,
                headers: ['*']
              }
            }
          ]
        }
      ],
      // Performance optimizations
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // US, Canada, Europe
      geoRestriction: cloudfront.GeoRestriction.allowlist('US', 'CA', 'VN', 'SG', 'JP'),
      errorConfigurations: [{
        errorCode: 404,
        responseCode: 200,
        responsePagePath: '/index.html',
        errorCachingMinTtl: 300
      }]
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'DistributionUrl', { value: distribution.distributionDomainName });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'VnpaySecretArn', { value: vnpaySecret.secretArn });
    new cdk.CfnOutput(this, 'WebAclArn', { value: webAcl.attrArn });

    // Create Monitoring Stack
    new MonitoringStack(scope, 'ImagifyMonitoring', [authLambda, imageGenLambda, paymentLambda], props);
  }
}
