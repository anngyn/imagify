"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringStack = void 0;
const cdk = require("aws-cdk-lib");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const cloudwatchActions = require("aws-cdk-lib/aws-cloudwatch-actions");
const sns = require("aws-cdk-lib/aws-sns");
const subscriptions = require("aws-cdk-lib/aws-sns-subscriptions");
class MonitoringStack extends cdk.Stack {
    constructor(scope, id, lambdaFunctions, props) {
        super(scope, id, props);
        // SNS Topic for alerts
        const alertTopic = new sns.Topic(this, 'ImagifyAlerts', {
            displayName: 'Imagify Monitoring Alerts'
        });
        // Email subscription
        alertTopic.addSubscription(new subscriptions.EmailSubscription(process.env.ALERT_EMAIL || 'admin@imagify.com'));
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
                threshold: 30000,
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
            threshold: 100,
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
exports.MonitoringStack = MonitoringStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uaXRvcmluZy1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1vbml0b3Jpbmctc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBQ25DLHlEQUF5RDtBQUN6RCx3RUFBd0U7QUFDeEUsMkNBQTJDO0FBQzNDLG1FQUFtRTtBQUluRSxNQUFhLGVBQWdCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDNUMsWUFBWSxLQUFjLEVBQUUsRUFBVSxFQUFFLGVBQWtDLEVBQUUsS0FBc0I7UUFDaEcsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsdUJBQXVCO1FBQ3ZCLE1BQU0sVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ3RELFdBQVcsRUFBRSwyQkFBMkI7U0FDekMsQ0FBQyxDQUFDO1FBRUgscUJBQXFCO1FBQ3JCLFVBQVUsQ0FBQyxlQUFlLENBQ3hCLElBQUksYUFBYSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxJQUFJLG1CQUFtQixDQUFDLENBQ3BGLENBQUM7UUFFRiwyQkFBMkI7UUFDM0IsTUFBTSxhQUFhLEdBQUcsQ0FBQyxNQUFNLEVBQUUsVUFBVSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3RELGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDdEMsTUFBTSxRQUFRLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLFdBQVcsS0FBSyxFQUFFLENBQUM7WUFFNUQsbUJBQW1CO1lBQ25CLElBQUksVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsR0FBRyxRQUFRLFlBQVksRUFBRTtnQkFDbEQsTUFBTSxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUM7b0JBQ3hCLE1BQU0sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9B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b3J0ICogYXMgY2xvdWR3YXRjaCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaCc7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoQWN0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaC1hY3Rpb25zJztcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcbmltcG9ydCAqIGFzIHN1YnNjcmlwdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucy1zdWJzY3JpcHRpb25zJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuXG5leHBvcnQgY2xhc3MgTW9uaXRvcmluZ1N0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IGNkay5BcHAsIGlkOiBzdHJpbmcsIGxhbWJkYUZ1bmN0aW9uczogbGFtYmRhLkZ1bmN0aW9uW10sIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIFNOUyBUb3BpYyBmb3IgYWxlcnRzXG4gICAgY29uc3QgYWxlcnRUb3BpYyA9IG5ldyBzbnMuVG9waWModGhpcywgJ0ltYWdpZnlBbGVydHMnLCB7XG4gICAgICBkaXNwbGF5TmFtZTogJ0ltYWdpZnkgTW9uaXRvcmluZyBBbGVydHMnXG4gICAgfSk7XG5cbiAgICAvLyBFbWFpbCBzdWJzY3JpcHRpb25cbiAgICBhbGVydFRvcGljLmFkZFN1YnNjcmlwdGlvbihcbiAgICAgIG5ldyBzdWJzY3JpcHRpb25zLkVtYWlsU3Vic2NyaXB0aW9uKHByb2Nlc3MuZW52LkFMRVJUX0VNQUlMIHx8ICdhZG1pbkBpbWFnaWZ5LmNvbScpXG4gICAgKTtcblxuICAgIC8vIExhbWJkYSBFcnJvciBSYXRlIEFsYXJtc1xuICAgIGNvbnN0IGZ1bmN0aW9uTmFtZXMgPSBbJ0F1dGgnLCAnSW1hZ2VHZW4nLCAnUGF5bWVudCddO1xuICAgIGxhbWJkYUZ1bmN0aW9ucy5mb3JFYWNoKChmdW5jLCBpbmRleCkgPT4ge1xuICAgICAgY29uc3QgZnVuY05hbWUgPSBmdW5jdGlvbk5hbWVzW2luZGV4XSB8fCBgRnVuY3Rpb24ke2luZGV4fWA7XG4gICAgICBcbiAgICAgIC8vIEVycm9yIFJhdGUgQWxhcm1cbiAgICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIGAke2Z1bmNOYW1lfUVycm9yQWxhcm1gLCB7XG4gICAgICAgIG1ldHJpYzogZnVuYy5tZXRyaWNFcnJvcnMoe1xuICAgICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSlcbiAgICAgICAgfSksXG4gICAgICAgIHRocmVzaG9sZDogNSxcbiAgICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXG4gICAgICAgIGFsYXJtRGVzY3JpcHRpb246IGBIaWdoIGVycm9yIHJhdGUgZm9yICR7ZnVuY05hbWV9YCxcbiAgICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkdcbiAgICAgIH0pLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24oYWxlcnRUb3BpYykpO1xuXG4gICAgICAvLyBEdXJhdGlvbiBBbGFybVxuICAgICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgYCR7ZnVuY05hbWV9RHVyYXRpb25BbGFybWAsIHtcbiAgICAgICAgbWV0cmljOiBmdW5jLm1ldHJpY0R1cmF0aW9uKHtcbiAgICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpXG4gICAgICAgIH0pLFxuICAgICAgICB0aHJlc2hvbGQ6IDMwMDAwLCAvLyAzMCBzZWNvbmRzXG4gICAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAzLFxuICAgICAgICBhbGFybURlc2NyaXB0aW9uOiBgSGlnaCBkdXJhdGlvbiBmb3IgJHtmdW5jTmFtZX1gXG4gICAgICB9KS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKGFsZXJ0VG9waWMpKTtcbiAgICB9KTtcblxuICAgIC8vIENvc3QgQWxhcm1cbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnQ29zdEFsYXJtJywge1xuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6ICdBV1MvQmlsbGluZycsXG4gICAgICAgIG1ldHJpY05hbWU6ICdFc3RpbWF0ZWRDaGFyZ2VzJyxcbiAgICAgICAgZGltZW5zaW9uc01hcDoge1xuICAgICAgICAgIEN1cnJlbmN5OiAnVVNEJ1xuICAgICAgICB9LFxuICAgICAgICBzdGF0aXN0aWM6ICdNYXhpbXVtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24uaG91cnMoNilcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxMDAsIC8vICQxMDBcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ01vbnRobHkgY29zdCBleGNlZWRzICQxMDAnXG4gICAgfSkuYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbihhbGVydFRvcGljKSk7XG5cbiAgICAvLyBDdXN0b20gRGFzaGJvYXJkXG4gICAgY29uc3QgZGFzaGJvYXJkID0gbmV3IGNsb3Vkd2F0Y2guRGFzaGJvYXJkKHRoaXMsICdJbWFnaWZ5RGFzaGJvYXJkJywge1xuICAgICAgZGFzaGJvYXJkTmFtZTogJ0ltYWdpZnktTW9uaXRvcmluZydcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBtZXRyaWNzIHdpZGdldHNcbiAgICBjb25zdCBsYW1iZGFXaWRnZXRzID0gbGFtYmRhRnVuY3Rpb25zLm1hcCgoZnVuYywgaW5kZXgpID0+IHtcbiAgICAgIGNvbnN0IGZ1bmNOYW1lID0gZnVuY3Rpb25OYW1lc1tpbmRleF0gfHwgYEZ1bmN0aW9uJHtpbmRleH1gO1xuICAgICAgcmV0dXJuIG5ldyBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0KHtcbiAgICAgICAgdGl0bGU6IGAke2Z1bmNOYW1lfSBNZXRyaWNzYCxcbiAgICAgICAgbGVmdDogW1xuICAgICAgICAgIGZ1bmMubWV0cmljSW52b2NhdGlvbnMoKSxcbiAgICAgICAgICBmdW5jLm1ldHJpY0Vycm9ycygpLFxuICAgICAgICAgIGZ1bmMubWV0cmljRHVyYXRpb24oKVxuICAgICAgICBdLFxuICAgICAgICB3aWR0aDogMTIsXG4gICAgICAgIGhlaWdodDogNlxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBkYXNoYm9hcmQuYWRkV2lkZ2V0cyguLi5sYW1iZGFXaWRnZXRzKTtcblxuICAgIC8vIE91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGFzaGJvYXJkVXJsJywge1xuICAgICAgdmFsdWU6IGBodHRwczovL2NvbnNvbGUuYXdzLmFtYXpvbi5jb20vY2xvdWR3YXRjaC9ob21lP3JlZ2lvbj0ke3RoaXMucmVnaW9ufSNkYXNoYm9hcmRzOm5hbWU9JHtkYXNoYm9hcmQuZGFzaGJvYXJkTmFtZX1gXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==