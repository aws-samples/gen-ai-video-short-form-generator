import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Duration } from 'aws-cdk-lib/core';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

type ExtractTopicsProps = {
  bucket: IBucket,
  historyTable: ITable,
  highlightTable: ITable,
};

export class ExtractTopics extends Construct {
  public readonly handler: Function;
  constructor(scope: Construct, id: string, props: ExtractTopicsProps) {
    super(scope, id);

    // cdk consturct to create lambda function
    this.handler = new Function(this, 'ExtractTopicsBedrock', {
      runtime: Runtime.PYTHON_3_12,
      code: Code.fromAsset('amplify/custom/lambda-functions/extract-topics-bedrock'),
      handler: 'lambda_function.lambda_handler',
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        HISTORY_TABLE_NAME: props.historyTable.tableName,
        HIGHLIGHT_TABLE_NAME: props.highlightTable.tableName,

      },
      timeout: Duration.seconds(600),
      memorySize: 512
    });

    props.bucket.grantReadWrite(this.handler);
    props.historyTable.grantReadWriteData(this.handler);
    props.highlightTable.grantReadWriteData(this.handler);
    this.handler.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        resources: ["*"],
        actions: [
          "bedrock:InvokeModel",
        ],
      })
    )
  
  }
}