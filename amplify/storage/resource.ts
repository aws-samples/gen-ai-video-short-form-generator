import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'aws-shorts',
  access: (allow) => ({
    'videos/*': [
      allow.entity('identity').to(['read', 'write', 'delete'])
    ],
  }),
});