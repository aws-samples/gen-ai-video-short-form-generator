import { IBucket } from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions'
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks'
import { Construct } from 'constructs';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { MakeShortTemplate, CreateBackground } from '../resource';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';


type GenerateShortStateMachineProps = {
  bucket: IBucket,
  historyTable: ITable,
  highlightTable: ITable
};

export class GenerateShortStateMachine extends Construct {
  public readonly stateMachine: sfn.StateMachine;
  constructor(scope: Construct, id: string, props: GenerateShortStateMachineProps) {
      super(scope, id);

      const mediaConvertRole = new Role(this, 'MediaConvertRole', {
        assumedBy: new ServicePrincipal('mediaconvert.amazonaws.com'),
      });
      mediaConvertRole.addManagedPolicy({
        managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonAPIGatewayInvokeFullAccess'
      });
      mediaConvertRole.addManagedPolicy({
        managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonS3FullAccess'
      });

      // lambda
      const createBackgroundFunc = new CreateBackground(this, "CreateBackgroundFunc", {bucket: props.bucket})
      const mediaConvertTemplateFunc = new MakeShortTemplate(this, "MediaConvertTemplateFunc", {})

      // definition

      const prepareParameters = new sfn.Pass(this, 'PrepareParameters', {
        parameters: {
          "inputs.$": "States.StringToJson($.inputs)",
          "videoId.$": "$.videoId",
          "highlight.$": "$.highlight",
          "bucket_name.$": "$.bucket_name",
          "question.$": "$.question",
        },
      });

      const createBackground = new tasks.LambdaInvoke(this, 'CreateBackground', {
        lambdaFunction: createBackgroundFunc.handler,
        payload: sfn.TaskInput.fromJsonPathAt("$"),
        resultPath: sfn.JsonPath.DISCARD
      });

      const mediaConvertTemplate = new tasks.LambdaInvoke(this, 'MediaConvertTemplate', {
        lambdaFunction: mediaConvertTemplateFunc.handler,
        payload: sfn.TaskInput.fromJsonPathAt("$"),
        resultSelector: {
          "template.$": "States.StringToJson($.Payload.body)",
        },
        resultPath: "$.result"
      });
      const mediaConvertFinalJob = new tasks.MediaConvertCreateJob(this, 'MediaConvertFinalJob', {
        createJobRequest: {
          "Role": mediaConvertRole.roleArn,
          "Settings": {
            "Inputs.$": "$.result.template.inputTemplate",
            "OutputGroups.$": "$.result.template.outputTemplate",
            "TimecodeConfig": {
              "Source": "ZEROBASED"
            }
          },
        },
        resultPath: sfn.JsonPath.DISCARD,
      })

      const definitionBody = prepareParameters
        .next(createBackground)
        .next(mediaConvertTemplate)
        .next(mediaConvertFinalJob)


      // state machine
        
      this.stateMachine = new sfn.StateMachine(this, 'GenerateShortStateMachine', {
        comment: "A Step Function to generate short form video",
        definitionBody: sfn.DefinitionBody.fromChainable(definitionBody)
      });

  }
}