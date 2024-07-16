import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../../amplify/data/resource'

export const client = generateClient<Schema>({authMode: 'userPool'});

export const subscribe = (id: string) => {
  return client.subscriptions.receive({videoId: id})

}

export const generateShort = async (inputs: string, videoId: string, highlight: number, question:string) => {
  return await client.queries.generateShort({inputs, videoId, highlight, question})
}