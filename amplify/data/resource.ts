import { type ClientSchema, a, defineData, defineFunction } from '@aws-amplify/backend';

const publishHandler = defineFunction({
  entry: "./publish.js"
})

export const generateShortFunction = defineFunction({
  entry: "./generateShort.ts",
});

const schema = a.schema({
  History: a
    .model({
      videoName: a.string().required(),
      modelID: a.string().required(),
      shortified: a.boolean().required(),
      stage: a.integer().required(),
    })
    .authorization((allow) => [allow.owner()]),

  Highlight: a.model({
    VideoName: a.string().required(),
    Index: a.string().required(),
    duration: a.integer(),
    Question: a.string(),
    Text: a.string(),
  })
  .identifier(['VideoName', "Index"])
  .authorization((allow) => [allow.owner()]),
  
  StageChanged: a.customType({
    videoId: a.string().required(),
    stage: a.integer().required(),
  }),

  publish: a.mutation()
    .arguments({
      videoId: a.string().required(),
      stage: a.integer().required()
    })
    .returns(a.ref("StageChanged"))
    .authorization((allow) => [allow.authenticated(), allow.guest()])
    .handler(a.handler.function(publishHandler)),

  receive: a.subscription()
    .for(a.ref('publish'))
    .arguments({
      videoId: a.string().required(),
    })
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.custom({entry: './receive.js'})),

  ShortsInput: a.customType({
    CropHeight: a.integer(),
    CropWidth: a.integer(),
    SectionDuration: a.float(),
    Xoffset: a.float(),
    Yoffset: a.float(),
  }),

  generateShort: a.query()
    .arguments({
      inputs: a.string().required(),
      videoId: a.string().required(),
      highlight: a.integer().required(),
      question: a.string().required(),
    })
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(generateShortFunction)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  name: "AWS-Shorts",
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});