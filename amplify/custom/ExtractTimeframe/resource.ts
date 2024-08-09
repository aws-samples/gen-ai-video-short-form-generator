import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Duration } from 'aws-cdk-lib/core';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

type ExtractTimeframeProps = {
  bucket: IBucket,
  highlightTable: ITable,
};

export class ExtractTimeframe extends Construct {
  public readonly handler: Function;
  constructor(scope: Construct, id: string, props: ExtractTimeframeProps) {
    super(scope, id);

    // cdk consturct to create lambda function
    this.handler = new Function(this, 'ExtractTimeframe', {
      runtime: Runtime.PYTHON_3_12,
      code: Code.fromAsset('amplify/custom/lambda-functions/extract-timeframe'),
      handler: 'lambda_function.lambda_handler',
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        HIGHLIGHT_TABLE_NAME: props.highlightTable.tableName,
      },
      timeout: Duration.seconds(600),
    });

    props.bucket.grantReadWrite(this.handler);
    props.highlightTable.grantReadWriteData(this.handler);
    this.handler.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        resources: ["*"],
        actions: [
          "mediaconvert:*",
        ],
      })
    )
  
  }
}