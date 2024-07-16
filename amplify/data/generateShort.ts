import type { Schema } from "./resource";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";

const sfnClient = new SFNClient(); 

export const handler: Schema["generateShort"]["functionHandler"] = async (
  event,
  context
) => {
  // User prompt
  const {inputs, videoId, highlight, question} = event.arguments;

  const stateMachineArn = process.env.STATE_MACHINE;
  
  try {
    const input = JSON.stringify({
      inputs, videoId, highlight, question, bucket_name: process.env.BUCKET_NAME
    });

    const command = new StartExecutionCommand({
      stateMachineArn: stateMachineArn,
      input: input
    });

    const result = await sfnClient.send(command);
    console.log(result)

    return JSON.stringify({
      statusCode: 200,
      body: "success"
    })

  } catch (error) {

    return JSON.stringify({
      statusCode: 500,
      body: error
    })

  }

};