import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Duration } from 'aws-cdk-lib/core';

type UnifiedReasoningProps = {
  bucket: IBucket;
  historyTable: ITable;
  highlightTable: ITable;
};

export class UnifiedReasoning extends Construct {
  public readonly handler: lambda.Function;

  constructor(scope: Construct, id: string, props: UnifiedReasoningProps) {
    super(scope, id);

    // Create Lambda function
    this.handler = new lambda.Function(this, 'UnifiedReasoningFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'lambda_function.lambda_handler',
      code: lambda.Code.fromAsset('amplify/custom/lambda-functions/unified-reasoning'),
      timeout: Duration.minutes(15),
      memorySize: 1024,
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        HISTORY_TABLE_NAME: props.historyTable.tableName,
        HIGHLIGHT_TABLE_NAME: props.highlightTable.tableName
      }
    });

    // Add permissions
    props.bucket.grantReadWrite(this.handler);
    props.historyTable.grantReadWriteData(this.handler);
    props.highlightTable.grantReadWriteData(this.handler);

    // Add Bedrock permissions
    this.handler.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
        'bedrock:Converse'
      ],
      resources: ['*']
    }));
  }
}
