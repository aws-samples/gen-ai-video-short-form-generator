import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

export const client = generateClient<Schema>({authMode: 'userPool'});
export type Highlight = Schema["Highlight"]["type"];


export const fetchHighlight = async () => {
  const { data: histories } = await client.models.Highlight.list();

  return histories;
};

export const readHighlight = async (VideoName:string) => {
  const { data: highlight } = await client.models.Highlight.list({
    VideoName: VideoName,
  });

  highlight.sort((a, b) => {
    return parseInt(a.Index) - parseInt(b.Index);
  })

  return highlight;
}

export const updateHighlight = async (VideoName: string, Index: string, Question: string) => {
  const updated = await client.models.Highlight.update({VideoName, Index, Question});
  return updated;
};

