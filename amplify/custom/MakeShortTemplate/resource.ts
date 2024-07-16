import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Duration } from 'aws-cdk-lib/core';

type MakeShortTemplateProps = {
};

export class MakeShortTemplate extends Construct {
  public readonly handler: Function;
  constructor(scope: Construct, id: string, props: MakeShortTemplateProps) {
    super(scope, id);

    // cdk consturct to create lambda function
    this.handler = new Function(this, 'MakeShortTemplate', {
      runtime: Runtime.PYTHON_3_12,
      code: Code.fromAsset('amplify/custom/lambda-functions/make-short-template'),
      handler: 'lambda_function.lambda_handler',
      timeout: Duration.seconds(60),
    });
  
  }
}