import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';

export class MonitoringStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, lambdaFunctions: lambda.Function[], props?: cdk.StackProps) {
    super(scope, id, props);

    // SNS Topic for alerts
    const alertTopic = new sns.Topic(this, 'ImagifyAlerts', {
      displayName: 'Imagify Monitoring Alerts'
    });

    // Email subscription
    alertTopic.addSubscription(
      new subscriptions.EmailSubscription(process.env.ALERT_EMAIL || 'admin@imagify.com')
    );

    // Lambda Error Rate Alarms
    const functionNames = ['Auth', 'ImageGen', 'Payment'];
    lambdaFunctions.forEach((func, index) => {
      const funcName = functionNames[index] || `Function${index}`;
      
      // Error Rate Alarm
      new cloudwatch.Alarm(this, `${funcName}ErrorAlarm`, {
        metric: func.metricErrors({
          period: cdk.Duration.minutes(5)
        }),
        threshold: 5,
        evaluationPeriods: 2,
        alarmDescription: `High error rate for ${funcName}`,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
      }).addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

      // Duration Alarm
      new cloudwatch.Alarm(this, `${funcName}DurationAlarm`, {
        metric: func.metricDuration({
          period: cdk.Duration.minutes(5)
        }),
        threshold: 30000, // 30 seconds
        evaluationPeriods: 3,
        alarmDescription: `High duration for ${funcName}`
      }).addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
    });

    // Cost Alarm
    new cloudwatch.Alarm(this, 'CostAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Billing',
        metricName: 'EstimatedCharges',
        dimensionsMap: {
          Currency: 'USD'
        },
        statistic: 'Maximum',
        period: cdk.Duration.hours(6)
      }),
      threshold: 100, // $100
      evaluationPeriods: 1,
      alarmDescription: 'Monthly cost exceeds $100'
    }).addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    // Custom Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'ImagifyDashboard', {
      dashboardName: 'Imagify-Monitoring'
    });

    // Lambda metrics widgets
    const lambdaWidgets = lambdaFunctions.map((func, index) => {
      const funcName = functionNames[index] || `Function${index}`;
      return new cloudwatch.GraphWidget({
        title: `${funcName} Metrics`,
        left: [
          func.metricInvocations(),
          func.metricErrors(),
          func.metricDuration()
        ],
        width: 12,
        height: 6
      });
    });

    dashboard.addWidgets(...lambdaWidgets);

    // Outputs
    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${dashboard.dashboardName}`
    });
  }
}
