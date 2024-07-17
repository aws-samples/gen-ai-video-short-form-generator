import { Code, Function, Runtime, LayerVersion } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib/core';
import { IBucket } from 'aws-cdk-lib/aws-s3';

type CreateBackgroundProps = {
  bucket: IBucket
};

export class CreateBackground extends Construct {
  public readonly handler: Function;
  constructor(scope: Construct, id: string, props: CreateBackgroundProps) {
    super(scope, id);

    const pilLayer = new LayerVersion(this, 'PilLayer', {
      code: Code.fromAsset('amplify/custom/lambda-layers/pillow'),
      compatibleRuntimes: [Runtime.PYTHON_3_12],
      description: 'A layer to access the PIL library',
    });

    // cdk consturct to create lambda function
    this.handler = new Function(this, 'CreateBackground', {
      runtime: Runtime.PYTHON_3_12,
      code: Code.fromAsset('amplify/custom/lambda-functions/create-background'),
      handler: 'lambda_function.lambda_handler',
      timeout: Duration.seconds(60),
      layers: [pilLayer],
    });

    props.bucket.grantReadWrite(this.handler);
  
  }
}
