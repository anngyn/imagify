import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

export class ImagifyStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Tables
    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const imagesTable = new dynamodb.Table(this, 'ImagesTable', {
      partitionKey: { name: 'imageId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const transactionsTable = new dynamodb.Table(this, 'TransactionsTable', {
      partitionKey: { name: 'transactionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // S3 Bucket for images
    const imagesBucket = new s3.Bucket(this, 'ImagesBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
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
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY
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

    // Lambda Execution Role
    const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ]
    });

    // Grant permissions to Lambda role
    usersTable.grantReadWriteData(lambdaExecutionRole);
    imagesTable.grantReadWriteData(lambdaExecutionRole);
    transactionsTable.grantReadWriteData(lambdaExecutionRole);
    imagesBucket.grantReadWrite(lambdaExecutionRole);

    // Bedrock permissions
    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: [
        'arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-image-generator-v1',
        'arn:aws:bedrock:us-east-1::foundation-model/stability.stable-diffusion-xl-v1'
      ]
    }));

    // Cognito permissions
    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminSetUserPassword',
        'cognito-idp:AdminInitiateAuth',
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminUpdateUserAttributes'
      ],
      resources: [userPool.userPoolArn]
    }));

    // Lambda Functions
    const authFunction = new lambda.Function(this, 'AuthFunction', {
      runtime: lambda.Runtime.PYTHON_3_10,
      handler: 'auth.handler',
      code: lambda.Code.fromAsset('lambda'),
      role: lambdaExecutionRole,
      timeout: cdk.Duration.seconds(30),
      environment: {
        USERS_TABLE: usersTable.tableName,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId
      }
    });

    const imageGenFunction = new lambda.Function(this, 'ImageGenFunction', {
      runtime: lambda.Runtime.PYTHON_3_10,
      handler: 'image_gen.handler',
      code: lambda.Code.fromAsset('lambda'),
      role: lambdaExecutionRole,
      timeout: cdk.Duration.seconds(60),
      environment: {
        IMAGES_TABLE: imagesTable.tableName,
        IMAGES_BUCKET: imagesBucket.bucketName,
        USERS_TABLE: usersTable.tableName
      }
    });

    const paymentFunction = new lambda.Function(this, 'PaymentFunction', {
      runtime: lambda.Runtime.PYTHON_3_10,
      handler: 'payment.handler',
      code: lambda.Code.fromAsset('lambda'),
      role: lambdaExecutionRole,
      timeout: cdk.Duration.seconds(30),
      environment: {
        USERS_TABLE: usersTable.tableName,
        TRANSACTIONS_TABLE: transactionsTable.tableName,
        VNPAY_TMN_CODE: process.env.VNPAY_TMN_CODE || '',
        VNPAY_HASH_SECRET: process.env.VNPAY_HASH_SECRET || '',
        VNPAY_URL: process.env.VNPAY_URL || '',
        VNPAY_RETURN_URL: process.env.VNPAY_RETURN_URL || ''
      }
    });

    // API Gateway
    const api = new apigateway.RestApi(this, 'ImagifyApi', {
      restApiName: 'Imagify API',
      description: 'API for Imagify application',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key']
      }
    });

    // Cognito Authorizer with proper configuration
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      identitySource: 'method.request.header.Authorization',
      authorizerName: 'CognitoAuth',
      resultsCacheTtl: cdk.Duration.minutes(5)
    });

    // API Routes
    const auth = api.root.addResource('auth');
    auth.addResource('register').addMethod('POST', new apigateway.LambdaIntegration(authFunction));
    auth.addResource('login').addMethod('POST', new apigateway.LambdaIntegration(authFunction));

    const user = api.root.addResource('user');
    user.addResource('credits').addMethod('GET', new apigateway.LambdaIntegration(authFunction), {
      authorizer: cognitoAuthorizer
    });

    const image = api.root.addResource('image');
    image.addResource('generate').addMethod('POST', new apigateway.LambdaIntegration(imageGenFunction), {
      authorizer: cognitoAuthorizer
    });

    const payment = api.root.addResource('payment');
    payment.addResource('vnpay').addMethod('POST', new apigateway.LambdaIntegration(paymentFunction), {
      authorizer: cognitoAuthorizer
    });
    payment.addResource('vnpay-return').addMethod('GET', new apigateway.LambdaIntegration(paymentFunction));

    // CloudWatch Log Groups
    new logs.LogGroup(this, 'AuthLambdaLogGroup', {
      logGroupName: `/aws/lambda/${authFunction.functionName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    new logs.LogGroup(this, 'ImageGenLambdaLogGroup', {
      logGroupName: `/aws/lambda/${imageGenFunction.functionName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    new logs.LogGroup(this, 'PaymentLambdaLogGroup', {
      logGroupName: `/aws/lambda/${paymentFunction.functionName}`,
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
