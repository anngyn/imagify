import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
export declare class MonitoringStack extends cdk.Stack {
    constructor(scope: cdk.App, id: string, lambdaFunctions: lambda.Function[], props?: cdk.StackProps);
}
