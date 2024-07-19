import { IBucket } from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions'
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks'
import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib/core';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { CfnJobTemplate } from 'aws-cdk-lib/aws-mediaconvert';

import { InvokeBedrock } from '../resource';
import { ExtractTimeframe } from '../resource';

type VideoUploadStateMachineProps = {
  bucket: IBucket,
  historyTable: ITable,
  highlightTable: ITable
};

export class VideoUploadStateMachine extends Construct {
  public readonly stateMachine: sfn.StateMachine;
  constructor(scope: Construct, id: string, props: VideoUploadStateMachineProps) {
      super(scope, id);

      // IAM Role
      const mediaConvertRole = new Role(this, 'MediaConvertRole', {
        assumedBy: new ServicePrincipal('mediaconvert.amazonaws.com'),
      });
      mediaConvertRole.addManagedPolicy({
        managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonAPIGatewayInvokeFullAccess'
      })
      mediaConvertRole.addManagedPolicy({
        managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonS3FullAccess'
      })

      // Lambda functions

      const invokeBedrock = new InvokeBedrock(this, "InvokeBedrockFunc", {
        bucket: props.bucket,
        historyTable: props.historyTable,
        highlightTable: props.highlightTable
      });

      const extractTimeframe = new ExtractTimeframe(this, "ExtractTimeframeFunc", {
        bucket: props.bucket,
        highlightTable: props.highlightTable
      });

      // helper function

      const updateDDB = (stage: number) => {
        return new tasks.DynamoUpdateItem(this, `UpdateDDBStage${stage}`, {
          table: props.historyTable,
          key: {
            id: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt("$.uuid"))
          },
          updateExpression: "SET stage = :val",
          expressionAttributeValues: {
            ":val": tasks.DynamoAttributeValue.fromNumber(stage)
          },
          resultPath: sfn.JsonPath.DISCARD 
        })
      };

      const updateEvent = (stage:number) => {
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
        })
      };

      // MediaConvert Job Template
      const jobTemplate = new CfnJobTemplate(this, 'FHDJobTemplate', {
        settingsJson: {
          "Description": "Make all video 1920x1080",
          "Settings": {
            "TimecodeConfig": {
              "Source": "ZEROBASED"
            },
            "OutputGroups": [
              {
                "Name": "File Group",
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
              }
            ],
            "Inputs": [
              {
                "AudioSelectors": {
                  "Audio Selector 1": {
                    "DefaultSelection": "DEFAULT"
                  }
                },
                "VideoSelector": {},
                "TimecodeSource": "ZEROBASED"
              }
            ]
          },
          "AccelerationSettings": {
            "Mode": "DISABLED"
          },
          "StatusUpdateInterval": "SECONDS_60",
          "Priority": 0,
          "HopDestinations": []
        },
      });

      // Step functions

      const prepareParameters = new sfn.Pass(this, 'PrepareParameters', {
        parameters : {
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
          "Media": {
            "MediaFileUri.$": "$.raw_file_uri"
          },
          "OutputBucketName.$": "$.bucket_name",
          "OutputKey.$": "$.OutputKey",
          "LanguageOptions": [
            "en-US",
            "ko-KR"
          ],
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
        parameters: {
          "TranscriptionJobName.$": "$.TranscriptionJobName"
        },
        resultPath: "$.jobStatus"
      });

      const checkTranscriptionJobStatus = new sfn.Choice(this, 'CheckTranscriptionJobStatus');
      const updateTranscriptionJobDDB = updateDDB(1);
      const updateTranscriptionJobEvent = updateEvent(1);

      const extractHighlight = new tasks.LambdaInvoke(this, 'ExtractHighlight', {
        lambdaFunction: invokeBedrock.handler,
        payload: sfn.TaskInput.fromJsonPathAt("$"),
        retryOnServiceExceptions:true,
        resultSelector: {
          "video_array.$": "$.Payload.video_array",
          "statusCode.$": "$.Payload.statusCode"
        },
        resultPath: "$.Highlights"
      })

      const updateExtractHighlightDDB = updateDDB(2);
      const updateExtractHighlightEvent = updateEvent(2);

      // Extract Timeframe Map
      const extractTimeframeMap = new sfn.Map(this, 'ExtractTimeFrameMap', {
        //maxConcurrency: 100,
        itemsPath: "$.Highlights.video_array",
        parameters: {
          "uuid.$": "$$.Map.Item.Value.uuid",
          "index.$": "$$.Map.Item.Value.index",
          "question.$": "$$.Map.Item.Value.question",
          "bucket_name.$": "$.bucket_name"
        },
        resultPath: sfn.JsonPath.DISCARD
      });

      const extractTimeframeFunc = new tasks.LambdaInvoke(this, 'ExtractTimeframe', {
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
          "JobTemplate": jobTemplate.attrArn,
          "Settings": {
            "Inputs": [
              {
                "FileInput.$": "$.timeframe_extracted.raw_file_path",
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
      })

      const highlightTranscriptionJob = new tasks.CallAwsService(this, 'StartHighlightTranscriptionJob', {
        service: 'transcribe',
        action: 'startTranscriptionJob',
        iamAction: 'transcribe:StartTranscriptionJob',
        iamResources: ['*'],
        parameters: {
          "TranscriptionJobName.$": "$.FHD_Job.FHD_Jobname",
          "MediaFormat": "mp4",
          "Media": {
            "MediaFileUri.$": "$.FHD_Job.FHD_SourceKey"
          },
          "OutputBucketName.$": "$.bucket_name",
          "OutputKey.$": "$.FHD_Job.FHD_OutputKey",
          "LanguageOptions": [
            "en-US",
            "ko-KR"
          ],
          "IdentifyLanguage": true,
          "Subtitles": {
            "Formats": [
              "vtt"
            ],
            "OutputStartIndex": 1
          }
        },
        resultPath: sfn.JsonPath.DISCARD,
        
      });

      highlightTranscriptionJob.addRetry({
        maxAttempts:3,
        interval: Duration.seconds(5),
      })

      const waitForHighlightTranscriptionJob = new sfn.Wait(this, 'WaitForHighlightTranscriptionJob', {
        time: sfn.WaitTime.duration(Duration.seconds(5))
      });

      const getHighlightTranscriptionJobStatus = new tasks.CallAwsService(this, 'GetHighlightTranscriptionJobStatus', {
        service: 'transcribe',
        action: 'getTranscriptionJob',
        iamAction: 'transcribe:GetTranscriptionJob',
        iamResources: ['*'],
        parameters: {
          "TranscriptionJobName.$": "$.FHD_Job.FHD_Jobname"
        },
        resultPath: "$.highlightJobStatus"
      });

      const checkHighlightTranscriptionJobStatus = new sfn.Choice(this, 'CheckHighlightTranscriptionJobStatus');
      const updateHighlightTranscriptionJobDDB = updateDDB(3);
      const updateHighlightTranscriptionJobEvent = updateEvent(3);


      // Map definition body
      const mapDefinitionBody = extractTimeframeFunc
        .next(checkExtractionJobStatus
          .when(
            sfn.Condition.numberEquals("$.timeframe_extracted.statusCode", 200),
            mediaConvertExtractJob
            .next(mediaConvertExtractJobParam)
            .next(highlightTranscriptionJob)
            .next(waitForHighlightTranscriptionJob)
            .next(getHighlightTranscriptionJobStatus)
            .next(checkHighlightTranscriptionJobStatus
              .when(
                sfn.Condition.stringEquals("$.highlightJobStatus.TranscriptionJob.TranscriptionJobStatus", "COMPLETED"),
                new sfn.Pass(this, 'Success', {})
              )
              .when(
                sfn.Condition.stringEquals("$.highlightJobStatus.TranscriptionJob.TranscriptionJobStatus", "FAILED"),
                new sfn.Pass(this, 'TranscriptionJobFailed', {})
              )
              .otherwise(waitForHighlightTranscriptionJob)
            )
          )
          .otherwise(new sfn.Pass(this, 'ExtractionJobFailed', {}))
        )

      // Definition body
      const definitionBody = prepareParameters
        .next(startTranscriptionJob)
        .next(waitForTranscriptionJob)
        .next(getTranscriptionJobStatus)
        .next(checkTranscriptionJobStatus
          .when(
            sfn.Condition.stringEquals("$.jobStatus.TranscriptionJob.TranscriptionJobStatus", "COMPLETED"),
            updateTranscriptionJobDDB
              .next(updateTranscriptionJobEvent)
              .next(extractHighlight)
              .next(updateExtractHighlightDDB)
              .next(updateExtractHighlightEvent)
              .next(extractTimeframeMap.itemProcessor(mapDefinitionBody))
              .next(updateHighlightTranscriptionJobDDB)
              .next(updateHighlightTranscriptionJobEvent)
          )
          .when(
            sfn.Condition.stringEquals("$.jobStatus.TranscriptionJob.TranscriptionJobStatus", "FAILED"),
            new sfn.Fail(this, 'HighlightTranscriptionJobFailed', {
              error: "TranscriptionJobFailed",
              cause: "TranscriptionJob failed"
            })
          )
          .otherwise(waitForTranscriptionJob)
        )
      

      this.stateMachine = new sfn.StateMachine(this, 'VideoUploadStateMachine', {
        comment: "A Step Function to transcribe video using Amazon Transcribe",
        definitionBody: sfn.DefinitionBody.fromChainable(definitionBody)
      });

      
  }
}