import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

export const client = generateClient<Schema>({authMode: 'userPool'});

export type History = Schema["History"]["type"];

export const enum STAGE {
  START,
  UPLOADED,
  TRANSCRIBED,
  HIGHLIGHTED,
  SHORTIFIED
};

export const stageToString = ["Uploaded", "Transcribed", "Highlighting", "Shortifying", "Done"]

export const fetchHistory = async () => {
  const { data: histories } = await client.models.History.list();

  return histories;
};

export const createHistory = async (videoName:string, modelID:string) => {

  const { data: newHistory } = await client.models.History.create({ videoName: videoName, modelID: modelID, shortified:false, stage: 0 });

  return newHistory;
}

export const updateHistory = async (id:string, stage:number) => {

  await client.models.History.update({id, stage});
}

export const readHistory = async (id:string) => {
  const { data: history } = await client.models.History.get({id});

  return history;
}

export const subscribeHistory = async (id:string) => {
  return client.models.History.observeQuery({
    filter:{
      id: {
        eq: id
      }
    }
  });

}
