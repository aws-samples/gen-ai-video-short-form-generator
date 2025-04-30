import { Duration } from 'aws-cdk-lib/core';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import path from 'path';
import { fileURLToPath } from 'url';

type DetectShotChangesProps = {
  bucket: IBucket;
  historyTable: ITable;
};

export class DetectShotChanges extends Construct {
  public readonly handler: Function;

  constructor(scope: Construct, id: string, props: DetectShotChangesProps) {
    super(scope, id);

    this.handler = new Function(this, 'DetectShotChanges', {
      code: Code.fromAsset(path.join(path.dirname(fileURLToPath(import.meta.url)), '../lambda-functions/detect-shot-changes')),
      handler: 'index.handler',
      runtime: Runtime.NODEJS_18_X,
      timeout: Duration.minutes(15),
      environment: {
        HISTORY_TABLE: props.historyTable.tableName,
      },
      memorySize: 1024,
    });

    // Grant permissions to access S3
    props.bucket.grantRead(this.handler);

    // Grant permissions to update DynamoDB
    props.historyTable.grantWriteData(this.handler);

    // Add permissions for Rekognition
    this.handler.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'rekognition:StartSegmentDetection',
          'rekognition:GetSegmentDetection'
        ],
        resources: ['*'],
      })
    );
  }
}