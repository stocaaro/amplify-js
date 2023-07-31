import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Alarm, ComparisonOperator, Metric, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { SIMTicketAlarmAction, Severity } from "@amzn/sim-ticket-cdk-constructs";
import { CTI_GROUP, GHWorkflowsAccount, BUILD_AND_RUNTIME_TEST_FAILURE_DEF, StageName } from "./data/constants"; // add stuff into a ./data?

export function createBuildAndRuntimeTestFailureWidgets(scope: Construct, stage: StageName) {
  const buildAndRuntimeTestFailureMetric = new Metric({
    metricName: "CanaryTestFailure",
    namespace: "AmplifyJsCanaries", 
    statistic: "Max",
    period: Duration.seconds(1200),
  });

  const buildAndRuntimeTestFailureAlarm = new Alarm(scope, `github-canary-test-failure-alarm-${stage}`, {
    alarmName: "Github Canary Test Failure Alarm",
    alarmDescription: `${BUILD_AND_RUNTIME_TEST_FAILURE_DEF}`,
    metric: buildAndRuntimeTestFailureMetric,
    threshold: 0,
    evaluationPeriods: 3,
    datapointsToAlarm: 3,
    comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
    actionsEnabled: GHWorkflowsAccount[stage].ticketActionEnabled,
    treatMissingData: TreatMissingData.MISSING,
  });

  const severity = Severity.SEV2_5;

  buildAndRuntimeTestFailureAlarm.addAlarmAction(new SIMTicketAlarmAction({
    severity,
    dedupe: `github-build-and-runtime-test-failure-alarm-${stage}`,
    summary: "There's a failure on Github Actions when running 'callable-canary-e2e' workflow.",
    details: "Check what failed -> https://github.com/aws-amplify/amplify-js/actions/workflows/callable-canary-e2e.yml",
    ...CTI_GROUP
  }));
}
