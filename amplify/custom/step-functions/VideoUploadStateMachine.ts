import { IBucket } from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions'
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks'
import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib/core';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'

import { ExtractTopics, ProcessTopics, ExtractTimeframe } from '../resource';

type VideoUploadStateMachineProps = {
  bucket: IBucket,
  historyTable: ITable,
  highlightTable: ITable
};

export class VideoUploadStateMachine extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: VideoUploadStateMachineProps) {
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
    const extractTopics = new ExtractTopics(this, "ExtractTopicsFunc", {
      bucket: props.bucket,
      highlightTable: props.highlightTable,
      historyTable: props.historyTable
    });

    const processTopic = new ProcessTopics(this, "ProcessTopicFunc", {
      bucket: props.bucket,
      highlightTable: props.highlightTable,
      historyTable: props.historyTable
    });

    const extractTimeframe = new ExtractTimeframe(this, "ExtractTimeframeFunc", {
      bucket: props.bucket,
      highlightTable: props.highlightTable
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
        "uuid.$": "States.Format('{}', States.ArrayGetItem(States.StringSplit($.detail.object.key, '/'), 1))",
        "TranscriptionJobName.$": "States.Format('{}_stepFunction', States.ArrayGetItem(States.StringSplit($.detail.object.key, '/'), 1))",
        "raw_file_uri.$": "States.Format('s3://{}/{}', $.detail.bucket.name, $.detail.object.key)",
        "bucket_name.$": "$.detail.bucket.name",
        "OutputKey.$": "States.Format('videos/{}/Transcript.json', States.ArrayGetItem(States.StringSplit($.detail.object.key, '/'), 1))"
      }
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
        "IdentifyLanguage": true
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

    const extractTopicsTask = new tasks.LambdaInvoke(this, 'ExtractTopics', {
      lambdaFunction: extractTopics.handler,
      payload: sfn.TaskInput.fromJsonPathAt("$"),
      resultPath: "$.TopicsResult"
    });

    const processTopicsMap = new sfn.Map(this, 'ProcessTopicsMap', {
      itemsPath: "$.TopicsResult.Payload.topics",
      parameters: {
        "topic.$": "$$.Map.Item.Value",
        "uuid.$": "$.uuid",
        "index.$": "$$.Map.Item.Index",
        "script.$": "$.TopicsResult.Payload.script",
        "modelID.$": "$.TopicsResult.Payload.modelID",
        "owner.$": "$.TopicsResult.Payload.owner",
        "bucket_name.$": "$.bucket_name",
      },
      resultPath: sfn.JsonPath.DISCARD
    });

    const processTopicTask = new tasks.LambdaInvoke(this, 'ProcessTopic', {
      lambdaFunction: processTopic.handler,
      payload: sfn.TaskInput.fromJsonPathAt("$"),
      resultPath: sfn.JsonPath.DISCARD
    });

    const highlightExtractMap = new sfn.Map(this, 'HighlightExtractMap', {
      itemsPath: "$.TopicsResult.Payload.topics",
      parameters: {
        "topic.$": "$$.Map.Item.Value",
        "uuid.$": "$.uuid",
        "index.$": "$$.Map.Item.Index",
        "bucket_name.$": "$.bucket_name",
      },
      resultPath: sfn.JsonPath.DISCARD
    });

    const extractTimeframeTask = new tasks.LambdaInvoke(this, 'ExtractTimeframe', {
      lambdaFunction: extractTimeframe.handler,
      payload: sfn.TaskInput.fromJsonPathAt("$"),
      resultSelector: {
        "statusCode.$": "$.Payload.statusCode",
        "duration.$": "$.Payload.duration",
        "index.$": "$.Payload.index",
        "uuid.$": "$.Payload.uuid",
        "raw_file_path.$": "$.Payload.raw_file_path",
        "start_timecode.$": "$.Payload.start_timecode",
        "end_timecode.$": "$.Payload.end_timecode",
        "output_destination.$": "$.Payload.output_destination"
      },
      resultPath: "$.timeframe_extracted"
    });

    const checkExtractionJobStatus = new sfn.Choice(this, 'CheckExtractionJobStatus');

    const mediaConvertExtractJob = new tasks.MediaConvertCreateJob(this, 'MediaConvertExtractJob', {
      createJobRequest: {
        "Role": mediaConvertRole.roleArn,
        "Settings": {
          "TimecodeConfig": {
            "Source": "ZEROBASED"
          },
          "Inputs": [
            {
              "FileInput.$": "$.timeframe_extracted.raw_file_path",
              "AudioSelectors": {
                "Audio Selector 1": {
                  "DefaultSelection": "DEFAULT"
                }
              },
              "VideoSelector": {},
              "TimecodeSource": "ZEROBASED",
              "InputClippings": [
                {
                  "StartTimecode.$": "$.timeframe_extracted.start_timecode",
                  "EndTimecode.$": "$.timeframe_extracted.end_timecode"
                }
              ]
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
                  "Destination.$": "$.timeframe_extracted.output_destination"
                }
              }
            }
          ]
        }
      },
      resultPath: sfn.JsonPath.DISCARD
    })


    const mediaConvertExtractJobParam = new sfn.Pass(this, 'MediaConvertExtractJobParam', {
      parameters: {
        "FHD_Jobname.$": "States.Format('{}_FHD_{}', $.timeframe_extracted.uuid, $.timeframe_extracted.index)",
        "FHD_SourceKey.$": "States.Format('{}.mp4', $.timeframe_extracted.output_destination)",
        "FHD_OutputKey.$": "States.Format('videos/{}/ShortsTranscript/{}-TranscriptShorts.json', $.timeframe_extracted.uuid, $.timeframe_extracted.index)"
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

    // Definition body
    const definitionBody = prepareParameters
      .next(startTranscriptionJob)
      .next(waitForTranscriptionJob)
      .next(getTranscriptionJobStatus)
      .next(checkTranscriptionJobStatus
        .when(sfn.Condition.stringEquals("$.jobStatus.TranscriptionJob.TranscriptionJobStatus", "COMPLETED"),
          updateDDB(1)
            .next(updateEvent(1))
            .next(extractTopicsTask)
            .next(processTopicsMap
              .itemProcessor(processTopicTask)
            )
            .next(updateDDB(2))
            .next(updateEvent(2))
            .next(highlightExtractMap
              .itemProcessor(extractTimeframeTask
                .next(checkExtractionJobStatus
                  .when(sfn.Condition.numberEquals("$.timeframe_extracted.statusCode", 200),
                    mediaConvertExtractJob
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
                  )
                  .otherwise(new sfn.Pass(this, 'ExtractionFailed', {}))
                )
              )
            )
            .next(updateDDB(3))
            .next(updateEvent(3))
        )
        .when(sfn.Condition.stringEquals("$.jobStatus.TranscriptionJob.TranscriptionJobStatus", "FAILED"),
          new sfn.Fail(this, 'TranscriptionJobFailed', {
            cause: "Transcription job failed",
            error: "TranscriptionJobFailed"
          })
        )
        .otherwise(waitForTranscriptionJob)
      );

    this.stateMachine = new sfn.StateMachine(this, 'VideoUploadStateMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(definitionBody),
      comment: "A Step Function to transcribe video using Amazon Transcribe"
    });
  }
}