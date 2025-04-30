import { IBucket } from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions'
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks'
import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib/core';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Role, ServicePrincipal, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam'

import { UnifiedReasoning } from '../resource';

type UnifiedReasoningStateMachineProps = {
  bucket: IBucket,
  historyTable: ITable,
  highlightTable: ITable
};

export class UnifiedReasoningStateMachine extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: UnifiedReasoningStateMachineProps) {
    super(scope, id);

    // IAM Role for MediaConvert
    const mediaConvertRole = new Role(this, 'MediaConvertRole', {
      assumedBy: new ServicePrincipal('mediaconvert.amazonaws.com'),
    });
    mediaConvertRole.addManagedPolicy({
      managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonAPIGatewayInvokeFullAccess'
    });
    mediaConvertRole.addManagedPolicy({
      managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonS3FullAccess'
    });

    // Lambda functions
    const unifiedReasoning = new UnifiedReasoning(this, "UnifiedReasoningFunc", {
      bucket: props.bucket,
      highlightTable: props.highlightTable,
      historyTable: props.historyTable
    });

    // Helper functions
    const updateDDB = (stage: number) => {
      return new tasks.DynamoUpdateItem(this, `UpdateDDBStage${stage}`, {
        table: props.historyTable,
        key: { id: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt("$.uuid")) },
        updateExpression: "SET stage = :val",
        expressionAttributeValues: { ":val": tasks.DynamoAttributeValue.fromNumber(stage) },
        resultPath: sfn.JsonPath.DISCARD 
      });
    };

    const updateEvent = (stage: number) => {
      return new tasks.EventBridgePutEvents(this, `UpdateEventStage${stage}`, {
        entries: [{
          detail: sfn.TaskInput.fromObject({
            "videoId": sfn.JsonPath.stringAt("$.uuid"),
            "stage": stage
          }),
          detailType: "StageChanged",
          source: "custom.aws-shorts"
        }],
        resultPath: sfn.JsonPath.DISCARD
      });
    };

    // Step Functions definition
    const prepareParameters = new sfn.Pass(this, 'PrepareParameters', {
      parameters: {
        "uuid.$": "$.uuid",
        "bucket_name.$": "$.bucket_name",
        "TranscriptionJobName.$": "States.Format('{}_stepFunction', $.uuid)",
        "raw_file_uri.$": "States.Format('s3://{}/videos/{}/RAW.mp4', $.bucket_name, $.uuid)",
        "OutputKey.$": "States.Format('videos/{}/Transcript.json', $.uuid)"
      }
    });

    const checkSubtitles = new tasks.CallAwsService(this, 'CheckSubtitles', {
      service: 's3',
      action: 'headObject',
      iamAction: 's3:HeadObject',
      iamResources: ['*'],
      parameters: {
        "Bucket.$": "$.bucket_name",
        "Key.$": "States.Format('videos/{}/Transcript.vtt', $.uuid)"  // Check for English VTT
      },
      resultPath: sfn.JsonPath.DISCARD,
    });

    const startTranscriptionJob = new tasks.CallAwsService(this, 'StartTranscriptionJob', {
      service: 'transcribe',
      action: 'startTranscriptionJob',
      iamAction: 'transcribe:StartTranscriptionJob',
      iamResources: ['*'],
      parameters: {
        "TranscriptionJobName.$": "$.TranscriptionJobName",
        "Media": { "MediaFileUri.$": "$.raw_file_uri" },
        "OutputBucketName.$": "$.bucket_name",
        "OutputKey.$": "$.OutputKey",
        "LanguageOptions": ["en-US", "ko-KR"],
        "IdentifyLanguage": true,
        "Subtitles": {
          "Formats": ["vtt"],
          "OutputStartIndex": 1
        },
        "Settings": {
          "ShowSpeakerLabels": true,
          "MaxSpeakerLabels": 10
        }
      },
      resultPath: sfn.JsonPath.DISCARD
    });

    const waitForTranscriptionJob = new sfn.Wait(this, 'WaitForTranscriptionJob', {
      time: sfn.WaitTime.duration(Duration.seconds(5))
    });

    const getTranscriptionJobStatus = new tasks.CallAwsService(this, 'GetTranscriptionJobStatus', {
      service: 'transcribe',
      action: 'getTranscriptionJob',
      iamAction: 'transcribe:GetTranscriptionJob',
      iamResources: ['*'],
      parameters: { "TranscriptionJobName.$": "$.TranscriptionJobName" },
      resultPath: "$.jobStatus"
    });

    const checkTranscriptionJobStatus = new sfn.Choice(this, 'CheckTranscriptionJobStatus');

    const unifiedReasoningTask = new tasks.LambdaInvoke(this, 'UnifiedReasoning', {
      lambdaFunction: unifiedReasoning.handler,
      payload: sfn.TaskInput.fromJsonPathAt("$"),
      resultPath: "$.reasoningResult"
    });

    const highlightProcessMap = new sfn.Map(this, 'HighlightProcessMap', {
      itemsPath: "$.reasoningResult.Payload.body",
      parameters: {
        "highlight.$": "$$.Map.Item.Value",
        "uuid.$": "$.uuid",
        "bucket_name.$": "$.bucket_name",
        "raw_file_path.$": "States.Format('s3://{}/videos/{}/RAW.mp4', $.bucket_name, $.uuid)",
        "output_destination.$": "States.Format('s3://{}/videos/{}/FHD/{}-FHD', $.bucket_name, $.uuid, $$.Map.Item.Value.index)"
      },
      resultPath: sfn.JsonPath.DISCARD
    });

    const mediaConvertExtractJob = new tasks.MediaConvertCreateJob(this, 'MediaConvertExtractJob', {
      createJobRequest: {
        "Role": mediaConvertRole.roleArn,
        "Settings": {
          "TimecodeConfig": {
            "Source": "ZEROBASED"
          },
          "Inputs": [
            {
              "FileInput.$": "$.raw_file_path",
              "AudioSelectors": {
                "Audio Selector 1": {
                  "DefaultSelection": "DEFAULT"
                }
              },
              "VideoSelector": {},
              "TimecodeSource": "ZEROBASED",
              "InputClippings.$": "$.highlight.timeframes"
            }
          ],
          "OutputGroups": [ 
            {
              "Name": "FileGroup",
              "Outputs": [
                {
                  "ContainerSettings": {
                    "Container": "MP4",
                    "Mp4Settings": {}
                  },
                  "VideoDescription": {
                    "Width": 1920,
                    "ScalingBehavior": "FIT",
                    "Height": 1080,
                    "CodecSettings": {
                      "Codec": "H_264",
                      "H264Settings": {
                        "FramerateDenominator": 1,
                        "MaxBitrate": 5000000,
                        "FramerateControl": "SPECIFIED",
                        "RateControlMode": "QVBR",
                        "FramerateNumerator": 25,
                        "SceneChangeDetect": "TRANSITION_DETECTION"
                      }
                    }
                  },
                  "AudioDescriptions": [
                    {
                      "CodecSettings": {
                        "Codec": "AAC",
                        "AacSettings": {
                          "Bitrate": 96000,
                          "CodingMode": "CODING_MODE_2_0",
                          "SampleRate": 48000
                        }
                      }
                    }
                  ]
                }
              ],
              "OutputGroupSettings": {
                "Type": "FILE_GROUP_SETTINGS",
                "FileGroupSettings": {
                  "Destination.$": "$.output_destination"
                }
              }
            }
          ]
        }
      },
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      resultPath: sfn.JsonPath.DISCARD
    });

    const mediaConvertExtractJobParam = new sfn.Pass(this, 'MediaConvertExtractJobParam', {
      parameters: {
        "FHD_Jobname.$": "States.Format('{}_FHD_{}', $.uuid, $.highlight.index)",
        "FHD_SourceKey.$": "States.Format('{}.mp4', $.output_destination)",
        "FHD_OutputKey.$": "States.Format('videos/{}/ShortsTranscript/{}-TranscriptShorts.json', $.uuid, $.highlight.index)"
      },
      resultPath: "$.FHD_Job"
    });

    const startHighlightTranscriptionJob = new tasks.CallAwsService(this, 'StartHighlightTranscriptionJob', {
      service: 'transcribe',
      action: 'startTranscriptionJob',
      iamAction: 'transcribe:StartTranscriptionJob',
      iamResources: ['*'],
      parameters: {
        "TranscriptionJobName.$": "$.FHD_Job.FHD_Jobname",
        "MediaFormat": "mp4",
        "Media": { "MediaFileUri.$": "$.FHD_Job.FHD_SourceKey" },
        "OutputBucketName.$": "$.bucket_name",
        "OutputKey.$": "$.FHD_Job.FHD_OutputKey",
        "LanguageOptions": ["en-US", "ko-KR"],
        "IdentifyLanguage": true,
        "Subtitles": {
          "Formats": ["vtt"],
          "OutputStartIndex": 1
        }
      },
      resultPath: sfn.JsonPath.DISCARD
    }).addRetry({ maxAttempts: 3, interval: Duration.seconds(5) });

    const waitForHighlightTranscriptionJob = new sfn.Wait(this, 'WaitForHighlightTranscriptionJob', {
      time: sfn.WaitTime.duration(Duration.seconds(5))
    });

    const getHighlightTranscriptionJobStatus = new tasks.CallAwsService(this, 'GetHighlightTranscriptionJobStatus', {
      service: 'transcribe',
      action: 'getTranscriptionJob',
      iamAction: 'transcribe:GetTranscriptionJob',
      iamResources: ['*'],
      parameters: { "TranscriptionJobName.$": "$.FHD_Job.FHD_Jobname" },
      resultPath: "$.highlightJobStatus"
    });

    const checkHighlightTranscriptionJobStatus = new sfn.Choice(this, 'CheckHighlightTranscriptionJobStatus');

    const sharedUpdateDDB1 = updateDDB(1);

    // Definition body
    const definitionBody = prepareParameters
      .next(checkSubtitles
        .addCatch(startTranscriptionJob
          .next(waitForTranscriptionJob)
          .next(getTranscriptionJobStatus)
          .next(checkTranscriptionJobStatus
            .when(sfn.Condition.stringEquals("$.jobStatus.TranscriptionJob.TranscriptionJobStatus", "COMPLETED"), sharedUpdateDDB1)
            .when(sfn.Condition.stringEquals("$.jobStatus.TranscriptionJob.TranscriptionJobStatus", "FAILED"),
                new sfn.Fail(this, 'TranscriptionJobFailed', {
                  cause: "Transcription job failed",
                  error: "TranscriptionJobFailed"
                })
              )
            .otherwise(waitForTranscriptionJob)
          ), {
            resultPath: sfn.JsonPath.DISCARD,
            errors: ["States.ALL"]  // Catch all errors from checkSubtitles
          }
        )
      )
      .next(sharedUpdateDDB1)
      .next(updateEvent(1))
      .next(unifiedReasoningTask)
      .next(updateDDB(2))
      .next(updateEvent(2))
      .next(highlightProcessMap.itemProcessor(
        new sfn.Pass(this, 'ParseTimeframes', {
          parameters: {
            "highlight": {
              "index.$": "$.highlight.index",
              "timeframes.$": "$.highlight.timeframes"
            },
            "uuid.$": "$.uuid",
            "bucket_name.$": "$.bucket_name",
            "raw_file_path.$": "$.raw_file_path",
            "output_destination.$": "$.output_destination"
          }
        })
        .next(mediaConvertExtractJob)
        .next(mediaConvertExtractJobParam)
        .next(startHighlightTranscriptionJob)
        .next(waitForHighlightTranscriptionJob)
        .next(getHighlightTranscriptionJobStatus)
        .next(checkHighlightTranscriptionJobStatus
          .when(sfn.Condition.stringEquals("$.highlightJobStatus.TranscriptionJob.TranscriptionJobStatus", "COMPLETED"),
            new sfn.Succeed(this, 'HighlightTranscriptionSucceeded')
          )
          .when(sfn.Condition.stringEquals("$.highlightJobStatus.TranscriptionJob.TranscriptionJobStatus", "FAILED"),
            new sfn.Fail(this, 'HighlightTranscriptionFailed', {
              cause: "Highlight transcription job failed",
              error: "HighlightTranscriptionJobFailed"
            })
          )
          .otherwise(waitForHighlightTranscriptionJob)
        )
      ))
      .next(updateDDB(3))
      .next(updateEvent(3));

    // Create role for the state machine
    const stateMachineRole = new Role(this, 'UnifiedReasoningStateMachineRole', {
      assumedBy: new ServicePrincipal('states.amazonaws.com'),
      inlinePolicies: {
        'StateMachineExecutionPolicy': new PolicyDocument({
          statements: [
            // DynamoDB permissions
            new PolicyStatement({
              actions: ['dynamodb:GetItem', 'dynamodb:UpdateItem'],
              resources: [props.historyTable.tableArn, props.highlightTable.tableArn]
            }),
            // S3 permissions
            new PolicyStatement({
              actions: ['s3:GetObject', 's3:PutObject', 's3:HeadObject'],
              resources: [
                `${props.bucket.bucketArn}/*`,
                props.bucket.bucketArn
              ]
            }),
            // Transcribe permissions
            new PolicyStatement({
              actions: [
                'transcribe:StartTranscriptionJob',
                'transcribe:GetTranscriptionJob'
              ],
              resources: ['*']
            }),
            // EventBridge permissions
            new PolicyStatement({
              actions: ['events:PutEvents'],
              resources: ['*']
            }),
            // Lambda permissions
            new PolicyStatement({
              actions: ['lambda:InvokeFunction'],
              resources: ['*']
            }),
            // MediaConvert permissions
            new PolicyStatement({
              actions: ['mediaconvert:CreateJob'],
              resources: ['*']
            })
          ]
        })
      }
    });

    this.stateMachine = new sfn.StateMachine(this, 'UnifiedReasoningStateMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(definitionBody),
      comment: "A Step Function to process video using unified reasoning",
      role: stateMachineRole
    });
  }
}
