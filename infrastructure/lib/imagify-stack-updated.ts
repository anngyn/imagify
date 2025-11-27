import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

export class ImagifyStackUpdated extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Tables
    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: 'imagify-users',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const imagesTable = new dynamodb.Table(this, 'ImagesTable', {
      tableName: 'imagify-images',
      partitionKey: { name: 'imageId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // Add GSI for user images
    imagesTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING }
    });

    const transactionsTable = new dynamodb.Table(this, 'TransactionsTable', {
      tableName: 'imagify-transactions',
      partitionKey: { name: 'transactionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // S3 Bucket for images
    const imagesBucket = new s3.Bucket(this, 'ImagesBucket', {
      bucketName: 'imagify-images-prod',
      publicReadAccess: true,
      cors: [{
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
        allowedOrigins: ['*'],
        allowedHeaders: ['*']
      }],
      lifecycleRules: [{
        id: 'DeleteOldImages',
        expiration: cdk.Duration.days(365) // Delete images after 1 year
      }],
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // Cognito User Pool
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'imagify-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      authFlows: {
        userPassword: true,
        userSrp: true
      }
    });

    // IAM Role for Lambda functions with Bedrock permissions
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ],
      inlinePolicies: {
        BedrockAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:InvokeModel',
                'bedrock:InvokeModelWithResponseStream'
              ],
              resources: [
                'arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-image-generator-v1',
                'arn:aws:bedrock:us-east-1::foundation-model/stability.stable-diffusion-xl-v1'
              ]
            })
          ]
        }),
        DynamoDBAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:UpdateItem',
                'dynamodb:Query',
                'dynamodb:Scan'
              ],
              resources: [
                usersTable.tableArn,
                imagesTable.tableArn,
                transactionsTable.tableArn,
                `${imagesTable.tableArn}/index/*`
              ]
            })
          ]
        }),
        S3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:PutObject',
                's3:PutObjectAcl',
                's3:GetObject'
              ],
              resources: [`${imagesBucket.bucketArn}/*`]
            })
          ]
        })
      }
    });

    // Lambda Functions
    const authLambda = new lambda.Function(this, 'AuthFunction', {
      runtime: lambda.Runtime.PYTHON_3_10,
      handler: 'auth.lambda_handler',
      code: lambda.Code.fromAsset('lambda'),
      role: lambdaRole,
      environment: {
        USERS_TABLE: usersTable.tableName,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256
    });

    const imageGenLambda = new lambda.Function(this, 'ImageGenFunction', {
      runtime: lambda.Runtime.PYTHON_3_10,
      handler: 'image_gen_bedrock.lambda_handler',
      code: lambda.Code.fromAsset('lambda'),
      role: lambdaRole,
      environment: {
        USERS_TABLE: usersTable.tableName,
        IMAGES_TABLE: imagesTable.tableName,
        S3_BUCKET: imagesBucket.bucketName
      },
      timeout: cdk.Duration.seconds(60),
      memorySize: 1024 // Higher memory for image processing
    });

    const paymentLambda = new lambda.Function(this, 'PaymentFunction', {
      runtime: lambda.Runtime.PYTHON_3_10,
      handler: 'payment.lambda_handler',
      code: lambda.Code.fromAsset('lambda'),
      role: lambdaRole,
      environment: {
        USERS_TABLE: usersTable.tableName,
        TRANSACTIONS_TABLE: transactionsTable.tableName,
        VNPAY_TMN_CODE: process.env.VNPAY_TMN_CODE || '',
        VNPAY_HASH_SECRET: process.env.VNPAY_HASH_SECRET || '',
        VNPAY_URL: process.env.VNPAY_URL || '',
        VNPAY_RETURN_URL: process.env.VNPAY_RETURN_URL || ''
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256
    });

    // API Gateway
    const api = new apigateway.RestApi(this, 'ImagifyApi', {
      restApiName: 'Imagify API',
      description: 'API for Imagify application with Bedrock integration',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization']
      }
    });

    // Cognito Authorizer
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool]
    });

    // API Routes
    const auth = api.root.addResource('auth');
    auth.addResource('register').addMethod('POST', new apigateway.LambdaIntegration(authLambda));
    auth.addResource('login').addMethod('POST', new apigateway.LambdaIntegration(authLambda));

    const user = api.root.addResource('user');
    user.addResource('credits').addMethod('GET', new apigateway.LambdaIntegration(authLambda), {
      authorizer
    });

    const image = api.root.addResource('image');
    image.addResource('generate').addMethod('POST', new apigateway.LambdaIntegration(imageGenLambda), {
      authorizer
    });

    const payment = api.root.addResource('payment');
    payment.addResource('vnpay').addMethod('POST', new apigateway.LambdaIntegration(paymentLambda), {
      authorizer
    });
    payment.addResource('vnpay-return').addMethod('GET', new apigateway.LambdaIntegration(paymentLambda));

    // CloudWatch Log Groups
    new logs.LogGroup(this, 'AuthLambdaLogGroup', {
      logGroupName: `/aws/lambda/${authLambda.functionName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    new logs.LogGroup(this, 'ImageGenLambdaLogGroup', {
      logGroupName: `/aws/lambda/${imageGenLambda.functionName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    new logs.LogGroup(this, 'PaymentLambdaLogGroup', {
      logGroupName: `/aws/lambda/${paymentLambda.functionName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: api.url,
      description: 'API Gateway URL'
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID'
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID'
    });

    new cdk.CfnOutput(this, 'ImagesBucketName', {
      value: imagesBucket.bucketName,
      description: 'S3 Images Bucket Name'
    });
  }
}
