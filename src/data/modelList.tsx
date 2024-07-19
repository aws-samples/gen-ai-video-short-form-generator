// modelList.tsx

export interface ModelOption {
  name: string;
  logo: string;
  modelId: string;
  provider: string;
}

export const modelOptions: ModelOption[] = [
  // {
  //   name: "Claude 3.0 Opus",
  //   logo: "logos/anthropic-logo.png",
  //   modelId: "anthropic.claude-3-opus-20240229-v1:0",
  //   provider: "Anthropic"
  // },
  {
    name: "Claude 3.5 Sonnet",
    logo: "logos/anthropic-logo.png",
    modelId: "anthropic.claude-3-5-sonnet-20240620-v1:0",
    provider: "Anthropic"
  },
  {
    name: "Claude 3.0 Sonnet",
    logo: "logos/anthropic-logo.png",
    modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
    provider: "Anthropic"
  },
  {
    name: "Claude 3.0 Haiku",
    logo: "logos/anthropic-logo.png",
    modelId: "anthropic.claude-3-haiku-20240307-v1:0",
    provider: "Anthropic"
  },
  // {
  //   name: "Llama 3 70b Instruct",
  //   logo: "logos/meta-logo.png",
  //   modelId: "meta.llama3-70b-instruct-v1:0",
  //   provider: "Meta"
  // },
  // {
  //   name: "Titan Text Premier",
  //   logo: "logos/amazon-logo.png",
  //   modelId: "amazon.titan-text-premier-v1:0",
  //   provider: "Amazon"
  // },
  // Add more models as needed
];