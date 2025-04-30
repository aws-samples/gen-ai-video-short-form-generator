import { RekognitionClient, GetSegmentDetectionCommand, StartSegmentDetectionCommand } from "@aws-sdk/client-rekognition";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const rekognitionClient = new RekognitionClient();
const dynamoClient = new DynamoDBClient();


export const handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  try {
    const { uuid, bucket_name } = event;
    const videoKey = `videos/${uuid}/${uuid}.mp4`;
    
    // S3 객체 존재 여부 먼저 확인
    try {
      await s3Client.headObject({
        Bucket: bucket_name,
        Key: videoKey
      }).promise();
    } catch (error) {
      console.error('Error checking S3 object:', error);
      throw new Error(`Video file not found in S3: ${videoKey}`);
    }
    
    // Start segment detection job
    const startParams = {
      Video: {
        S3Object: {
          Bucket: bucket_name,
          Name: videoKey
        }
      },
      SegmentTypes: ["SHOT"],
      JobTag: `shotdetection-${uuid}`
    };
    
    const startResponse = await rekognitionClient.send(
      new StartSegmentDetectionCommand(startParams)
    );
    
    const jobId = startResponse.JobId;
    console.log(`Started Rekognition segment detection job: ${jobId}`);
    
    // Poll for job completion
    let jobComplete = false;
    let maxAttempts = 60; // 5 minutes with 5 second intervals
    let shotChanges = [];
    
    while (!jobComplete && maxAttempts > 0) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      const getResultsParams = { JobId: jobId };
      const getResultsResponse = await rekognitionClient.send(
        new GetSegmentDetectionCommand(getResultsParams)
      );
      
      if (getResultsResponse.JobStatus === 'SUCCEEDED') {
        jobComplete = true;
        
        // Process segments
        if (getResultsResponse.Segments) {
          shotChanges = getResultsResponse.Segments
            .filter(segment => segment.Type === 'SHOT')
            .map(segment => ({
              startTimecodeSMPTE: segment.StartTimecodeSMPTE,
              endTimecodeSMPTE: segment.EndTimecodeSMPTE,
              startTimestampMillis: segment.StartTimestampMillis,
              endTimestampMillis: segment.EndTimestampMillis,
              durationMillis: segment.DurationMillis,
              confidence: segment.ShotSegment.Confidence
            }));
        }
      } else if (getResultsResponse.JobStatus === 'FAILED') {
        throw new Error(`Segment detection job failed: ${JSON.stringify(getResultsResponse)}`);
      }
      
      maxAttempts--;
    }
    
    if (!jobComplete) {
      throw new Error('Segment detection job did not complete within the timeout period');
    }
    
    // Update DynamoDB with shot changes
    const updateParams = {
      TableName: process.env.HISTORY_TABLE,
      Key: { "id": { S: uuid } },
      UpdateExpression: "SET shotChanges = :shotChanges",
      ExpressionAttributeValues: marshall({
        ":shotChanges": shotChanges
      })
    };
    
    await dynamoClient.send(new UpdateItemCommand(updateParams));
    
    return {
      statusCode: 200,
      uuid,
      shotChanges,
      message: `Successfully detected ${shotChanges.length} shot changes`
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      error: error.message
    };
  }
};