import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { storage } from './storage/resource';
import { data, generateShortFunction } from './data/resource'

// import { TranscriptUploadHandler, VideoUploadHandler, InvokeBedrock } from './custom/resource';
import { GenerateShortStateMachine, VideoUploadStateMachine } from './custom/resource';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { CfnBucket } from 'aws-cdk-lib/aws-s3';
import { EventBus, CfnRule } from 'aws-cdk-lib/aws-events'
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Stack } from 'aws-cdk-lib/core';

const backend = defineBackend({
  auth,
  storage,
  data,
  generateShortFunction
});

const s3Bucket = backend.storage.resources.bucket;
const cfnBucket = s3Bucket.node.defaultChild as CfnBucket;
cfnBucket.accelerateConfiguration = {
  accelerationStatus: "Enabled" 
};
cfnBucket.notificationConfiguration = {
  eventBridgeConfiguration: {
    eventBridgeEnabled: true,
  },
}

new BucketDeployment(Stack.of(s3Bucket), "UploadBackgroundImage", {
  sources: [Source.asset("./amplify/assets")],
  destinationBucket: s3Bucket,
  destinationKeyPrefix: "assets"
})

const highlightTable = backend.data.resources.tables["Highlight"]
const historyTable = backend.data.resources.tables["History"]

// eventbridge for subscription
const eventStack = backend.createStack("EventBridgeStack");
const eventBus = EventBus.fromEventBusName(
  eventStack,
  "EventBus",
  "default"
);

backend.data.addEventBridgeDataSource("EventBridgeDataSource", eventBus);

const eventBusRole = new Role(eventStack, "AppSyncInvokeRole", {
  assumedBy: new ServicePrincipal("events.amazonaws.com"),
  inlinePolicies: {
    PolicyStatement: new PolicyDocument({
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["appsync:GraphQL"],
          resources: [`${backend.data.resources.graphqlApi.arn}/types/Mutation/*`],
        }),
      ],
    }),
  },
});

const rule = new CfnRule(eventStack, "AppSyncRule", {
  eventBusName: eventBus.eventBusName,
  eventPattern: {
    ["detail-type"]: ["StageChanged"],
  },
  targets: [
    {
      arn: backend.data.resources.cfnResources.cfnGraphqlApi.attrGraphQlEndpointArn,
      id: "stageChangeReceiver",
      roleArn: eventBusRole.roleArn,
      appSyncParameters: {
        graphQlOperation: `
        mutation Publish($videoId: String!, $stage: Int!) {
          publish(videoId: $videoId, stage: $stage) {
            videoId
            stage
          }
        }`,
      },
      inputTransformer: {
        inputPathsMap: {
          videoId: "$.detail.videoId",
          stage: "$.detail.stage",
        },
        inputTemplate: `{"videoId": "<videoId>", "stage": <stage>}`,
      },  
    },
  ],
});

// step function
const stepfunctionStack = backend.createStack("StepFunctionStack");
const videoUploadStateMachine = new VideoUploadStateMachine(
  stepfunctionStack,
  "VideoUploadStateMachine",
  {
    bucket: s3Bucket,
    historyTable: historyTable,
    highlightTable: highlightTable
  }
)

s3Bucket.grantReadWrite(videoUploadStateMachine.stateMachine);

// handling video upload event
const videoUploadStateMachineRole = new Role(stepfunctionStack, "VideoUploadStateMachineExecuteRole", {
  assumedBy: new ServicePrincipal("events.amazonaws.com"),
  inlinePolicies: {
    PolicyStatement: new PolicyDocument({
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["states:StartExecution"],
          resources: ["*"],
        }),
      ],
    }),
  },
});

const videoUploadstateMachineRule = new CfnRule(
  stepfunctionStack,
  "VideoUploadStateMachineRule",
  {
    eventPattern: {
      source: ["aws.s3"],
      ["detail-type"]: ["Object Created"],
      detail: {
        bucket: {
          name: [s3Bucket.bucketName],
        },
        object: {
          key: [{ wildcard: "*/RAW.mp4" }],
        },
      },
    },
    targets: [
      {
        arn: videoUploadStateMachine.stateMachine.stateMachineArn,
        id: "videoUploadStateMachine",
        roleArn: videoUploadStateMachineRole.roleArn,
      },
    ],
  }
);

// generate short video
const generateShortStack = backend.createStack("GenerateShortStack");
const generateShortStateMachine = new GenerateShortStateMachine(
  generateShortStack,
  "GenerateShortStateMachine",
  {
    bucket: s3Bucket,
    historyTable: historyTable,
    highlightTable: highlightTable
  }
)

const generateShortFunc = backend.generateShortFunction.resources;

generateShortFunc.lambda.addToRolePolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["states:StartExecution"],
      resources: ["*"],
    }),
)

generateShortFunc.cfnResources.cfnFunction.environment = {
  variables: {
    STATE_MACHINE: generateShortStateMachine.stateMachine.stateMachineArn,
    BUCKET_NAME: s3Bucket.bucketName,
  }
}