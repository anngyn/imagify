"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImagifySecureStack = void 0;
const cdk = require("aws-cdk-lib");
const lambda = require("aws-cdk-lib/aws-lambda");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const s3 = require("aws-cdk-lib/aws-s3");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const cognito = require("aws-cdk-lib/aws-cognito");
const iam = require("aws-cdk-lib/aws-iam");
const secretsmanager = require("aws-cdk-lib/aws-secretsmanager");
const wafv2 = require("aws-cdk-lib/aws-wafv2");
const monitoring_stack_1 = require("./monitoring-stack");
class ImagifySecureStack extends cdk.Stack {
    constructor(scope, id, props) {
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
                                usersTable.tableArn + '/index/*',
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
            memorySize: 1024,
            timeout: cdk.Duration.seconds(15),
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
                cacheClusterSize: '0.5',
                cacheTtl: cdk.Duration.minutes(5) // 5 minute cache
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
                            defaultTtl: cdk.Duration.days(30),
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
            priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
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
        new monitoring_stack_1.MonitoringStack(scope, 'ImagifyMonitoring', [authLambda, imageGenLambda, paymentLambda], props);
    }
}
exports.ImagifySecureStack = ImagifySecureStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1hZ2lmeS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImltYWdpZnktc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBQ25DLGlEQUFpRDtBQUNqRCx5REFBeUQ7QUFDekQscURBQXFEO0FBQ3JELHlDQUF5QztBQUN6Qyx5REFBeUQ7QUFDekQsbURBQW1EO0FBQ25ELDJDQUEyQztBQUUzQyxpRUFBaUU7QUFDakUsK0NBQStDO0FBQy9DLHlEQUFxRDtBQUVyRCxNQUFhLGtCQUFtQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQy9DLFlBQVksS0FBYyxFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUM1RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixrQkFBa0I7UUFDbEIsTUFBTSxVQUFVLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDeEQsWUFBWSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUU7WUFDckUsV0FBVyxFQUFFLFFBQVEsQ0FBQyxXQUFXLENBQUMsV0FBVztZQUM3QyxZQUFZLEVBQUUsQ0FBQztZQUNmLGFBQWEsRUFBRSxDQUFDO1lBQ2hCLFVBQVUsRUFBRSxRQUFRLENBQUMsZUFBZSxDQUFDLFdBQVc7U0FDakQsQ0FBQyxDQUFDO1FBRUgsMkJBQTJCO1FBQzNCLFVBQVUsQ0FBQyx1QkFBdUIsQ0FBQztZQUNqQyxTQUFTLEVBQUUsWUFBWTtZQUN2QixZQUFZLEVBQUUsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRTtZQUNwRSxZQUFZLEVBQUUsQ0FBQztZQUNmLGFBQWEsRUFBRSxDQUFDO1NBQ2pCLENBQUMsQ0FBQztRQUVILE1BQU0sV0FBVyxHQUFHLElB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aW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQnO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlcic7XG5pbXBvcnQgKiBhcyB3YWZ2MiBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtd2FmdjInO1xuaW1wb3J0IHsgTW9uaXRvcmluZ1N0YWNrIH0gZnJvbSAnLi9tb25pdG9yaW5nLXN0YWNrJztcblxuZXhwb3J0IGNsYXNzIEltYWdpZnlTZWN1cmVTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBjZGsuQXBwLCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyBEeW5hbW9EQiBUYWJsZXNcbiAgICBjb25zdCB1c2Vyc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdVc2Vyc1RhYmxlJywge1xuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICd1c2VySWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBST1ZJU0lPTkVELFxuICAgICAgcmVhZENhcGFjaXR5OiAzLFxuICAgICAgd3JpdGVDYXBhY2l0eTogMixcbiAgICAgIGVuY3J5cHRpb246IGR5bmFtb2RiLlRhYmxlRW5jcnlwdGlvbi5BV1NfTUFOQUdFRFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIEdTSSBmb3IgZW1haWwgbG9va3VwXG4gICAgdXNlcnNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6ICdFbWFpbEluZGV4JyxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnZW1haWwnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgcmVhZENhcGFjaXR5OiAyLFxuICAgICAgd3JpdGVDYXBhY2l0eTogMlxuICAgIH0pO1xuXG4gICAgY29uc3QgaW1hZ2VzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ0ltYWdlc1RhYmxlJywge1xuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdpbWFnZUlkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QUk9WSVNJT05FRCxcbiAgICAgIHJlYWRDYXBhY2l0eTogMyxcbiAgICAgIHdyaXRlQ2FwYWNpdHk6IDIsXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRURcbiAgICB9KTtcblxuICAgIGNvbnN0IHRyYW5zYWN0aW9uc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdUcmFuc2FjdGlvbnNUYWJsZScsIHtcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndHJhbnNhY3Rpb25JZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUFJPVklTSU9ORUQsXG4gICAgICByZWFkQ2FwYWNpdHk6IDIsXG4gICAgICB3cml0ZUNhcGFjaXR5OiAzLFxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VEXG4gICAgfSk7XG5cbiAgICAvLyBTMyBCdWNrZXRzXG4gICAgY29uc3QgaW1hZ2VzQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnSW1hZ2VzQnVja2V0Jywge1xuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IG5ldyBzMy5CbG9ja1B1YmxpY0FjY2Vzcyh7XG4gICAgICAgIGJsb2NrUHVibGljUG9saWN5OiBmYWxzZSxcbiAgICAgICAgcmVzdHJpY3RQdWJsaWNCdWNrZXRzOiBmYWxzZVxuICAgICAgfSksXG4gICAgICB2ZXJzaW9uZWQ6IHRydWVcbiAgICB9KTtcblxuICAgIC8vIEFkZCBwdWJsaWMgcmVhZCBwb2xpY3kgZm9yIGltYWdlc1xuICAgIGltYWdlc0J1Y2tldC5hZGRUb1Jlc291cmNlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIHByaW5jaXBhbHM6IFtuZXcgaWFtLkFueVByaW5jaXBhbCgpXSxcbiAgICAgIGFjdGlvbnM6IFsnczM6R2V0T2JqZWN0J10sXG4gICAgICByZXNvdXJjZXM6IFtpbWFnZXNCdWNrZXQuYnVja2V0QXJuICsgJy9pbWFnZXMvKiddXG4gICAgfSkpO1xuXG4gICAgY29uc3QgZnJvbnRlbmRCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdGcm9udGVuZEJ1Y2tldCcsIHtcbiAgICAgIHdlYnNpdGVJbmRleERvY3VtZW50OiAnaW5kZXguaHRtbCcsXG4gICAgICBwdWJsaWNSZWFkQWNjZXNzOiB0cnVlLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IG5ldyBzMy5CbG9ja1B1YmxpY0FjY2Vzcyh7XG4gICAgICAgIGJsb2NrUHVibGljUG9saWN5OiBmYWxzZSxcbiAgICAgICAgcmVzdHJpY3RQdWJsaWNCdWNrZXRzOiBmYWxzZVxuICAgICAgfSlcbiAgICB9KTtcblxuICAgIC8vIFNlY3JldHMgTWFuYWdlciBmb3IgVk5QQVkgY3JlZGVudGlhbHNcbiAgICBjb25zdCB2bnBheVNlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ1ZucGF5U2VjcmV0Jywge1xuICAgICAgZGVzY3JpcHRpb246ICdWTlBBWSBwYXltZW50IGdhdGV3YXkgY3JlZGVudGlhbHMnLFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6IEpTT04uc3RyaW5naWZ5KHsgXG4gICAgICAgICAgdG1uX2NvZGU6IHByb2Nlc3MuZW52LlZOUEFZX1RNTl9DT0RFIHx8ICdTQU5EQk9YX1RNTl9DT0RFJyxcbiAgICAgICAgICByZXR1cm5fdXJsOiAnaHR0cDovL2xvY2FsaG9zdDo1MTczL3BheW1lbnQtcmVzdWx0J1xuICAgICAgICB9KSxcbiAgICAgICAgZ2VuZXJhdGVTdHJpbmdLZXk6ICdoYXNoX3NlY3JldCcsXG4gICAgICAgIGV4Y2x1ZGVDaGFyYWN0ZXJzOiAnXCJAL1xcXFwnXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbFxuICAgIGNvbnN0IHVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgJ1VzZXJQb29sJywge1xuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXG4gICAgICBzaWduSW5BbGlhc2VzOiB7IGVtYWlsOiB0cnVlIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IDgsXG4gICAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWVcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IHVzZXJQb29sQ2xpZW50ID0gbmV3IGNvZ25pdG8uVXNlclBvb2xDbGllbnQodGhpcywgJ1VzZXJQb29sQ2xpZW50Jywge1xuICAgICAgdXNlclBvb2wsXG4gICAgICBnZW5lcmF0ZVNlY3JldDogZmFsc2UsXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICAgIHVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgICAgdXNlclNycDogdHJ1ZVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIFJvbGVcbiAgICBjb25zdCBsYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdMYW1iZGFSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJylcbiAgICAgIF0sXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBEeW5hbW9EQkFjY2VzczogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBhY3Rpb25zOiBbJ2R5bmFtb2RiOkdldEl0ZW0nLCAnZHluYW1vZGI6UHV0SXRlbScsICdkeW5hbW9kYjpVcGRhdGVJdGVtJywgJ2R5bmFtb2RiOlF1ZXJ5JywgJ2R5bmFtb2RiOlNjYW4nXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgdXNlcnNUYWJsZS50YWJsZUFybiwgXG4gICAgICAgICAgICAgICAgdXNlcnNUYWJsZS50YWJsZUFybiArICcvaW5kZXgvKicsICAvLyBHU0kgcGVybWlzc2lvbnNcbiAgICAgICAgICAgICAgICBpbWFnZXNUYWJsZS50YWJsZUFybixcbiAgICAgICAgICAgICAgICB0cmFuc2FjdGlvbnNUYWJsZS50YWJsZUFyblxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIF1cbiAgICAgICAgfSksXG4gICAgICAgIENvZ25pdG9BY2Nlc3M6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdjb2duaXRvLWlkcDpBZG1pbkNyZWF0ZVVzZXInLFxuICAgICAgICAgICAgICAgICdjb2duaXRvLWlkcDpBZG1pblNldFVzZXJQYXNzd29yZCcsXG4gICAgICAgICAgICAgICAgJ2NvZ25pdG8taWRwOkFkbWluSW5pdGlhdGVBdXRoJyxcbiAgICAgICAgICAgICAgICAnY29nbml0by1pZHA6QWRtaW5HZXRVc2VyJyxcbiAgICAgICAgICAgICAgICAnY29nbml0by1pZHA6QWRtaW5VcGRhdGVVc2VyQXR0cmlidXRlcydcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbdXNlclBvb2wudXNlclBvb2xBcm5dXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIF1cbiAgICAgICAgfSksXG4gICAgICAgIEJlZHJvY2tBY2Nlc3M6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgYWN0aW9uczogWydiZWRyb2NrOkludm9rZU1vZGVsJywgJ2JlZHJvY2s6SW52b2tlTW9kZWxXaXRoUmVzcG9uc2VTdHJlYW0nXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgJ2Fybjphd3M6YmVkcm9jazp1cy1lYXN0LTE6OmZvdW5kYXRpb24tbW9kZWwvYW1hem9uLnRpdGFuLWltYWdlLWdlbmVyYXRvci12MScsXG4gICAgICAgICAgICAgICAgJ2Fybjphd3M6YmVkcm9jazp1cy1lYXN0LTE6OmZvdW5kYXRpb24tbW9kZWwvc3RhYmlsaXR5LnN0YWJsZS1kaWZmdXNpb24teGwtdjEnLFxuICAgICAgICAgICAgICAgICdhcm46YXdzOmJlZHJvY2s6dXMtZWFzdC0xOjpmb3VuZGF0aW9uLW1vZGVsL2FtYXpvbi5ub3ZhLWNhbnZhcy12MTowJ1xuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIF1cbiAgICAgICAgfSksXG4gICAgICAgIFMzQWNjZXNzOiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGFjdGlvbnM6IFsnczM6UHV0T2JqZWN0JywgJ3MzOkdldE9iamVjdCddLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtpbWFnZXNCdWNrZXQuYnVja2V0QXJuICsgJy8qJ11cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgXVxuICAgICAgICB9KSxcbiAgICAgICAgQ2xvdWRXYXRjaE1ldHJpY3M6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgYWN0aW9uczogWydjbG91ZHdhdGNoOlB1dE1ldHJpY0RhdGEnXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICBdXG4gICAgICAgIH0pLFxuICAgICAgICBTZWNyZXRzTWFuYWdlckFjY2VzczogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBhY3Rpb25zOiBbJ3NlY3JldHNtYW5hZ2VyOkdldFNlY3JldFZhbHVlJ10sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW3ZucGF5U2VjcmV0LnNlY3JldEFybl1cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgXVxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIEZ1bmN0aW9ucyB3aXRoIGNvc3Qgb3B0aW1pemF0aW9uXG4gICAgY29uc3QgYXV0aExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0F1dGhGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzEwLFxuICAgICAgaGFuZGxlcjogJ2F1dGguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYScpLFxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgIG1lbW9yeVNpemU6IDEwMjQsICAvLyBIaWdoZXIgbWVtb3J5ID0gZmFzdGVyIGV4ZWN1dGlvbiA9IGxvd2VyIGNvc3QgcGVyIHJlcXVlc3RcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDE1KSwgIC8vIFNob3J0ZXIgdGltZW91dFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVVNFUlNfVEFCTEU6IHVzZXJzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBVU0VSX1BPT0xfSUQ6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICAgIFVTRVJfUE9PTF9DTElFTlRfSUQ6IHVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWRcbiAgICAgIH0sXG4gICAgICAvLyBFbmFibGUgQVJNNjQgZm9yIGJldHRlciBwcmljZS9wZXJmb3JtYW5jZVxuICAgICAgYXJjaGl0ZWN0dXJlOiBsYW1iZGEuQXJjaGl0ZWN0dXJlLkFSTV82NFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIG1pbmltYWwgcHJvdmlzaW9uZWQgY29uY3VycmVuY3kgKGNvc3Qtb3B0aW1pemVkKVxuICAgIGNvbnN0IGF1dGhBbGlhcyA9IG5ldyBsYW1iZGEuQWxpYXModGhpcywgJ0F1dGhMYW1iZGFBbGlhcycsIHtcbiAgICAgIGFsaWFzTmFtZTogJ2xpdmUnLFxuICAgICAgdmVyc2lvbjogYXV0aExhbWJkYS5jdXJyZW50VmVyc2lvblxuICAgIH0pO1xuXG4gICAgYXV0aEFsaWFzLmFkZEF1dG9TY2FsaW5nKHtcbiAgICAgIG1pbkNhcGFjaXR5OiAxLFxuICAgICAgbWF4Q2FwYWNpdHk6IDJcbiAgICB9KTtcblxuICAgIGNvbnN0IGltYWdlR2VuTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnSW1hZ2VHZW5GdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzEwLFxuICAgICAgaGFuZGxlcjogJ2ltYWdlX2dlbi5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhJyksXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBJTUFHRVNfVEFCTEU6IGltYWdlc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgSU1BR0VTX0JVQ0tFVDogaW1hZ2VzQnVja2V0LmJ1Y2tldE5hbWVcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IHBheW1lbnRMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdQYXltZW50RnVuY3Rpb24nLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMCxcbiAgICAgIGhhbmRsZXI6ICdwYXltZW50LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEnKSxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBVU0VSU19UQUJMRTogdXNlcnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIFZOUEFZX1NFQ1JFVF9BUk46IHZucGF5U2VjcmV0LnNlY3JldEFyblxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQVBJIEdhdGV3YXkgd2l0aCBjYWNoaW5nXG4gICAgY29uc3QgYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnSW1hZ2lmeUFwaScsIHtcbiAgICAgIHJlc3RBcGlOYW1lOiAnSW1hZ2lmeSBBUEknLFxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgIGFsbG93T3JpZ2luczogW1xuICAgICAgICAgICdodHRwczovL2ltYWdpZnkuY29tJyxcbiAgICAgICAgICAnaHR0cHM6Ly93d3cuaW1hZ2lmeS5jb20nLFxuICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OionXG4gICAgICAgIF0sXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFsnQ29udGVudC1UeXBlJywgJ0F1dGhvcml6YXRpb24nXVxuICAgICAgfSxcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgY2FjaGluZ0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIGNhY2hlQ2x1c3RlckVuYWJsZWQ6IHRydWUsXG4gICAgICAgIGNhY2hlQ2x1c3RlclNpemU6ICcwLjUnLCAgLy8gU21hbGxlc3QgY2FjaGUgc2l6ZSBmb3IgY29zdCBvcHRpbWl6YXRpb25cbiAgICAgICAgY2FjaGVUdGw6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpICAvLyA1IG1pbnV0ZSBjYWNoZVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ29nbml0byBBdXRob3JpemVyIHdpdGggb3B0aW1pemVkIGNhY2hpbmdcbiAgICBjb25zdCBhdXRob3JpemVyID0gbmV3IGFwaWdhdGV3YXkuQ29nbml0b1VzZXJQb29sc0F1dGhvcml6ZXIodGhpcywgJ0NvZ25pdG9BdXRob3JpemVyJywge1xuICAgICAgY29nbml0b1VzZXJQb29sczogW3VzZXJQb29sXSxcbiAgICAgIGlkZW50aXR5U291cmNlOiAnbWV0aG9kLnJlcXVlc3QuaGVhZGVyLkF1dGhvcml6YXRpb24nLFxuICAgICAgcmVzdWx0c0NhY2hlVHRsOiBjZGsuRHVyYXRpb24ubWludXRlcygxNSkgLy8gUmVkdWNlIGZyb20gNjAgdG8gMTUgbWluIGZvciBmYXN0ZXIgdXBkYXRlc1xuICAgIH0pO1xuXG4gICAgLy8gQVBJIFJvdXRlc1xuICAgIGNvbnN0IGF1dGggPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnYXV0aCcpO1xuICAgIGF1dGguYWRkUmVzb3VyY2UoJ3JlZ2lzdGVyJykuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYXV0aExhbWJkYSkpO1xuICAgIGF1dGguYWRkUmVzb3VyY2UoJ2xvZ2luJykuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYXV0aExhbWJkYSkpO1xuXG4gICAgY29uc3QgdXNlciA9IGFwaS5yb290LmFkZFJlc291cmNlKCd1c2VyJyk7XG4gICAgdXNlci5hZGRSZXNvdXJjZSgnY3JlZGl0cycpLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYXV0aExhbWJkYSksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LmhlYWRlci5BdXRob3JpemF0aW9uJzogdHJ1ZVxuICAgICAgfSxcbiAgICAgIG1ldGhvZFJlc3BvbnNlczogW3tcbiAgICAgICAgc3RhdHVzQ29kZTogJzIwMCcsXG4gICAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xuICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkNhY2hlLUNvbnRyb2wnOiB0cnVlXG4gICAgICAgIH1cbiAgICAgIH1dXG4gICAgfSk7XG5cbiAgICBjb25zdCBpbWFnZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdpbWFnZScpO1xuICAgIGltYWdlLmFkZFJlc291cmNlKCdnZW5lcmF0ZScpLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGltYWdlR2VuTGFtYmRhKSwge1xuICAgICAgYXV0aG9yaXplcjogYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE9cbiAgICB9KTtcblxuICAgIGNvbnN0IHBheW1lbnQgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgncGF5bWVudCcpO1xuICAgIHBheW1lbnQuYWRkUmVzb3VyY2UoJ3ZucGF5JykuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocGF5bWVudExhbWJkYSksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPXG4gICAgfSk7XG4gICAgcGF5bWVudC5hZGRSZXNvdXJjZSgnY2FsbGJhY2snKS5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHBheW1lbnRMYW1iZGEpKTtcblxuICAgIC8vIFdBRiB2MiBmb3IgQVBJIEdhdGV3YXkgcHJvdGVjdGlvblxuICAgIGNvbnN0IHdlYkFjbCA9IG5ldyB3YWZ2Mi5DZm5XZWJBQ0wodGhpcywgJ0ltYWdpZnlXZWJBQ0wnLCB7XG4gICAgICBzY29wZTogJ1JFR0lPTkFMJyxcbiAgICAgIGRlZmF1bHRBY3Rpb246IHsgYWxsb3c6IHt9IH0sXG4gICAgICBydWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogJ1JhdGVMaW1pdFJ1bGUnLFxuICAgICAgICAgIHByaW9yaXR5OiAxLFxuICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgcmF0ZUJhc2VkU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgIGxpbWl0OiAyMDAwLFxuICAgICAgICAgICAgICBhZ2dyZWdhdGVLZXlUeXBlOiAnSVAnXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBhY3Rpb246IHsgYmxvY2s6IHt9IH0sXG4gICAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIG1ldHJpY05hbWU6ICdSYXRlTGltaXRSdWxlJ1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6ICdBV1NNYW5hZ2VkUnVsZXNDb21tb25SdWxlU2V0JyxcbiAgICAgICAgICBwcmlvcml0eTogMixcbiAgICAgICAgICBvdmVycmlkZUFjdGlvbjogeyBub25lOiB7fSB9LFxuICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgbWFuYWdlZFJ1bGVHcm91cFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICB2ZW5kb3JOYW1lOiAnQVdTJyxcbiAgICAgICAgICAgICAgbmFtZTogJ0FXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXQnXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogJ0NvbW1vblJ1bGVTZXRNZXRyaWMnXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICBdLFxuICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIG1ldHJpY05hbWU6ICdJbWFnaWZ5V2ViQUNMJ1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQXNzb2NpYXRlIFdBRiB3aXRoIEFQSSBHYXRld2F5XG4gICAgbmV3IHdhZnYyLkNmbldlYkFDTEFzc29jaWF0aW9uKHRoaXMsICdXZWJBQ0xBc3NvY2lhdGlvbicsIHtcbiAgICAgIHJlc291cmNlQXJuOiBgYXJuOmF3czphcGlnYXRld2F5OiR7dGhpcy5yZWdpb259OjovcmVzdGFwaXMvJHthcGkucmVzdEFwaUlkfS9zdGFnZXMvJHthcGkuZGVwbG95bWVudFN0YWdlLnN0YWdlTmFtZX1gLFxuICAgICAgd2ViQWNsQXJuOiB3ZWJBY2wuYXR0ckFyblxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gd2l0aCBvcHRpbWl6ZWQgc3RhdGljIGFzc2V0IGNhY2hpbmdcbiAgICBjb25zdCBkaXN0cmlidXRpb24gPSBuZXcgY2xvdWRmcm9udC5DbG91ZEZyb250V2ViRGlzdHJpYnV0aW9uKHRoaXMsICdEaXN0cmlidXRpb24nLCB7XG4gICAgICBvcmlnaW5Db25maWdzOiBbXG4gICAgICAgIC8vIFN0YXRpYyBhc3NldHMgZnJvbSBTMyAocHJpbWFyeSkgLSBvcHRpbWl6ZWQgY2FjaGluZ1xuICAgICAgICB7XG4gICAgICAgICAgczNPcmlnaW5Tb3VyY2U6IHtcbiAgICAgICAgICAgIHMzQnVja2V0U291cmNlOiBmcm9udGVuZEJ1Y2tldFxuICAgICAgICAgIH0sXG4gICAgICAgICAgYmVoYXZpb3JzOiBbe1xuICAgICAgICAgICAgaXNEZWZhdWx0QmVoYXZpb3I6IHRydWUsXG4gICAgICAgICAgICBhbGxvd2VkTWV0aG9kczogY2xvdWRmcm9udC5DbG91ZEZyb250QWxsb3dlZE1ldGhvZHMuR0VUX0hFQURfT1BUSU9OUyxcbiAgICAgICAgICAgIGNhY2hlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQ2xvdWRGcm9udEFsbG93ZWRDYWNoZWRNZXRob2RzLkdFVF9IRUFEX09QVElPTlMsXG4gICAgICAgICAgICBjb21wcmVzczogdHJ1ZSxcbiAgICAgICAgICAgIGRlZmF1bHRUdGw6IGNkay5EdXJhdGlvbi5kYXlzKDMwKSwgLy8gTG9uZyBjYWNoZSBmb3Igc3RhdGljIGFzc2V0c1xuICAgICAgICAgICAgbWF4VHRsOiBjZGsuRHVyYXRpb24uZGF5cygzNjUpLFxuICAgICAgICAgICAgbWluVHRsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygwKSxcbiAgICAgICAgICAgIGZvcndhcmRlZFZhbHVlczoge1xuICAgICAgICAgICAgICBxdWVyeVN0cmluZzogZmFsc2UsXG4gICAgICAgICAgICAgIGhlYWRlcnM6IFsnT3JpZ2luJywgJ0FjY2Vzcy1Db250cm9sLVJlcXVlc3QtTWV0aG9kJywgJ0FjY2Vzcy1Db250cm9sLVJlcXVlc3QtSGVhZGVycyddXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfV1cbiAgICAgICAgfSxcbiAgICAgICAgLy8gQVBJIEdhdGV3YXkgKHNlY29uZGFyeSkgLSBzZWxlY3RpdmUgY2FjaGluZ1xuICAgICAgICB7XG4gICAgICAgICAgY3VzdG9tT3JpZ2luU291cmNlOiB7XG4gICAgICAgICAgICBkb21haW5OYW1lOiBhcGkucmVzdEFwaUlkICsgJy5leGVjdXRlLWFwaS4nICsgdGhpcy5yZWdpb24gKyAnLmFtYXpvbmF3cy5jb20nLFxuICAgICAgICAgICAgaHR0cFBvcnQ6IDQ0MyxcbiAgICAgICAgICAgIG9yaWdpblByb3RvY29sUG9saWN5OiBjbG91ZGZyb250Lk9yaWdpblByb3RvY29sUG9saWN5LkhUVFBTX09OTFlcbiAgICAgICAgICB9LFxuICAgICAgICAgIGJlaGF2aW9yczogW1xuICAgICAgICAgICAgLy8gQ2FjaGUgdXNlciBjcmVkaXRzIGVuZHBvaW50XG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHBhdGhQYXR0ZXJuOiAnL3Byb2QvdXNlci9jcmVkaXRzJyxcbiAgICAgICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQ2xvdWRGcm9udEFsbG93ZWRNZXRob2RzLkdFVF9IRUFEX09QVElPTlMsXG4gICAgICAgICAgICAgIGNhY2hlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQ2xvdWRGcm9udEFsbG93ZWRDYWNoZWRNZXRob2RzLkdFVF9IRUFEX09QVElPTlMsXG4gICAgICAgICAgICAgIGNvbXByZXNzOiB0cnVlLFxuICAgICAgICAgICAgICBkZWZhdWx0VHRsOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgICAgICAgICAgbWF4VHRsOiBjZGsuRHVyYXRpb24ubWludXRlcygxMCksXG4gICAgICAgICAgICAgIG1pblR0bDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMCksXG4gICAgICAgICAgICAgIGZvcndhcmRlZFZhbHVlczoge1xuICAgICAgICAgICAgICAgIHF1ZXJ5U3RyaW5nOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBoZWFkZXJzOiBbJ0F1dGhvcml6YXRpb24nLCAnT3JpZ2luJywgJ0FjY2Vzcy1Db250cm9sLVJlcXVlc3QtTWV0aG9kJ11cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIC8vIE5vIGNhY2hlIGZvciBkeW5hbWljIGVuZHBvaW50c1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBwYXRoUGF0dGVybjogJy9wcm9kLyonLFxuICAgICAgICAgICAgICBhbGxvd2VkTWV0aG9kczogY2xvdWRmcm9udC5DbG91ZEZyb250QWxsb3dlZE1ldGhvZHMuQUxMLFxuICAgICAgICAgICAgICBkZWZhdWx0VHRsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygwKSxcbiAgICAgICAgICAgICAgbWF4VHRsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygwKSxcbiAgICAgICAgICAgICAgbWluVHRsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygwKSxcbiAgICAgICAgICAgICAgZm9yd2FyZGVkVmFsdWVzOiB7XG4gICAgICAgICAgICAgICAgcXVlcnlTdHJpbmc6IHRydWUsXG4gICAgICAgICAgICAgICAgaGVhZGVyczogWycqJ11cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgICAgXSxcbiAgICAgIC8vIFBlcmZvcm1hbmNlIG9wdGltaXphdGlvbnNcbiAgICAgIHByaWNlQ2xhc3M6IGNsb3VkZnJvbnQuUHJpY2VDbGFzcy5QUklDRV9DTEFTU18xMDAsIC8vIFVTLCBDYW5hZGEsIEV1cm9wZVxuICAgICAgZ2VvUmVzdHJpY3Rpb246IGNsb3VkZnJvbnQuR2VvUmVzdHJpY3Rpb24uYWxsb3dsaXN0KCdVUycsICdDQScsICdWTicsICdTRycsICdKUCcpLFxuICAgICAgZXJyb3JDb25maWd1cmF0aW9uczogW3tcbiAgICAgICAgZXJyb3JDb2RlOiA0MDQsXG4gICAgICAgIHJlc3BvbnNlQ29kZTogMjAwLFxuICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiAnL2luZGV4Lmh0bWwnLFxuICAgICAgICBlcnJvckNhY2hpbmdNaW5UdGw6IDMwMFxuICAgICAgfV1cbiAgICB9KTtcblxuICAgIC8vIE91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpVXJsJywgeyB2YWx1ZTogYXBpLnVybCB9KTtcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGlzdHJpYnV0aW9uVXJsJywgeyB2YWx1ZTogZGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWUgfSk7XG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sSWQnLCB7IHZhbHVlOiB1c2VyUG9vbC51c2VyUG9vbElkIH0pO1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbENsaWVudElkJywgeyB2YWx1ZTogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCB9KTtcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVm5wYXlTZWNyZXRBcm4nLCB7IHZhbHVlOiB2bnBheVNlY3JldC5zZWNyZXRBcm4gfSk7XG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dlYkFjbEFybicsIHsgdmFsdWU6IHdlYkFjbC5hdHRyQXJuIH0pO1xuXG4gICAgLy8gQ3JlYXRlIE1vbml0b3JpbmcgU3RhY2tcbiAgICBuZXcgTW9uaXRvcmluZ1N0YWNrKHNjb3BlLCAnSW1hZ2lmeU1vbml0b3JpbmcnLCBbYXV0aExhbWJkYSwgaW1hZ2VHZW5MYW1iZGEsIHBheW1lbnRMYW1iZGFdLCBwcm9wcyk7XG4gIH1cbn1cbiJdfQ==