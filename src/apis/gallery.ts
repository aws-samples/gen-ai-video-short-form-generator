import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

export const client = generateClient<Schema>({authMode: 'userPool'});

export type Gallery = Schema["Gallery"]["type"];


export const fetchGallery = async (token?: string|null) => {
  const { data: galleries, nextToken } = await client.models.Gallery.listGalleryByTypeAndCreatedAt(
    {
      type: 'gallery',
    },
    {
      sortDirection: "DESC",
      nextToken: token,
      limit: 3,
    }
);

  var hasMorePage = false;

  if (nextToken) {
    hasMorePage = true;
  }

  return {
    nextToken: nextToken,
    hasMorePage: hasMorePage,
    galleries: galleries
  }
};


export const deleteGallery = async (id:string) => {
  const { data: Gallery } = await client.models.Gallery.delete({id});

  return Gallery;
}
