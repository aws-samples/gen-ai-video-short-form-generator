import type { Schema } from "./resource";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import {v4 as uuidv4} from 'uuid';

const sfnClient = new SFNClient();

export const handler: Schema["generateShort"]["functionHandler"] = async (
  event,
  context
) => {
  // User prompt
  const {inputs, videoId, highlight, question} = event.arguments;
  
  // Use the GenerateShortStateMachine
  const stateMachineArn = process.env.STATE_MACHINE;
  const videoName = uuidv4()
  try {
    const input = JSON.stringify({
      inputs, videoId, highlight, question, bucket_name: process.env.BUCKET_NAME, videoName: videoName
    });

    const command = new StartExecutionCommand({
      stateMachineArn: stateMachineArn,
      input: input
    });

    const result = await sfnClient.send(command);

    return JSON.stringify({
      statusCode: 200,
      body: {
        videoName: videoName
      }
    })

  } catch (error) {

    return JSON.stringify({
      statusCode: 500,
      body: error
    })

  }

};
