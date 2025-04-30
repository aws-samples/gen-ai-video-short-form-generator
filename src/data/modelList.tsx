// modelList.tsx

export interface ModelOption {
  name: string;
  logo: string;
  modelId: string;
  provider: string;
  disabled?: boolean;
  disabledReason?: string;
}

export const modelOptions: ModelOption[] = [
  {
    name: "Nova Lite",
    logo: "logos/anthropic-logo.png",
    modelId: "us.amazon.nova-lite-v1:0",
    provider: "Amazon"
  },
  {
    name: "Nova Pro",
    logo: "logos/anthropic-logo.png",
    modelId: "us.amazon.nova-pro-v1:0",
    provider: "Amazon"
  },
  {
    name: "Claude 3.7 Sonnet",
    logo: "logos/anthropic-logo.png",
    modelId: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
    provider: "Anthropic"
  },
  {
    name: "Claude 3.5 Sonnet v2",
    logo: "logos/anthropic-logo.png",
    modelId: "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
    provider: "Anthropic"
  },
  {
    name: "Claude 3.5 Sonnet v1",
    logo: "logos/anthropic-logo.png",
    modelId: "us.anthropic.claude-3-5-sonnet-20240620-v1:0",
    provider: "Anthropic"
  },
  {
    name: "Claude 3.5 Haiku",
    logo: "logos/anthropic-logo.png",
    modelId: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
    provider: "Anthropic"
  },
  {
    name: "DeepSeek R1",
    logo: "logos/deepseek-logo.png",
    modelId: "us.deepseek.r1-v1:0",
    provider: "DeepSeek"
  },
  // Add more models as needed
];
