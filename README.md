# GenAI Video Short-form Generator

This repository is sample generative AI video short-form generator application using Amazon Bedrock and AWS serverless services.

## Deployment

### Prerequisites

1. Install [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) & Set up [AWS credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html)

2. Install [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html#getting_started_install) & CDK [Bootstrap](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-env.html#bootstrapping-howto) (for the first time)

3. [Manage Model Access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)

> [!IMPORTANT]
> The application uses Amazon Bedrock in the **us-east-1** region. Please allow model access in **us-east-1**.

> [!IMPORTANT]
> The application only supports models from Anthropic Claude 3.0 and above **(3.0 Haiku, 3.0 Sonnet, 3.5 Sonnet)**.

### Sandbox Deployment

1. Clone repository

```sh
git clone https://github.com/aws-samples/gen-ai-video-short-form-generator.git
```

2. Install dependency

```sh
cd gen-ai-video-short-form-generator
npm install
```

3. Deploy cloud sandbox

```sh
npx ampx sandbox
```

4. Run frontend app

```sh
npm run dev
```

### Amplify Deployment

Create your own repository and follow [Amplify deployment steps](https://docs.amplify.aws/react/start/quickstart/#2-deploy-the-starter-app)

## Clean Up

### Sandbox Environment

```sh
npx ampx sandbox delete
```

### Amplify Development

To delete an Amplify project that has been deployed from the Amplify Development Step, 

1. Go to your Amplify project console
2. Navigate to `App Settings > General Settings > Delete app`

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## Contacts

- [Kihoon Kwon](https://github.com/kyoonkwon)
- [Sukwon Lee](https://github.com/ltrain81)


## License

This library is licensed under the MIT-0 License. See the [LICENSE](LICENSE) file.

## Open Source Library

For detailed information about the open source libraries used in this application, please refer to the [ATTRIBUTION](ATTRIBUTION.md) file.
