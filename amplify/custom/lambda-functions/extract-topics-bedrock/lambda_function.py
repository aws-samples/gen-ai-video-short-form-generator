import json
import boto3
import botocore
import os

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
bedrock = boto3.client(
    service_name='bedrock-runtime',
    region_name='us-west-2',
    config=botocore.config.Config(connect_timeout=1000, read_timeout=1000)
)

def lambda_handler(event, context):
    bucket_name = os.environ["BUCKET_NAME"]
    table_name = os.environ["HISTORY_TABLE_NAME"]

    uuid = event['uuid']
    source_file_key = f"videos/{uuid}/Transcript.json"

    history = dynamodb.Table(table_name)
    video_history = history.get_item(Key={'id': uuid})
    modelID = video_history['Item']['modelID']
    
    response = s3.get_object(Bucket=bucket_name, Key=source_file_key)
    transcript_json = json.load(response['Body'])
    script = transcript_json['results']['transcripts'][0]['transcript']

    topics = get_topics_from_transcript(script, modelID)

    return {
        'statusCode': 200,
        'topics': topics,
        'uuid': uuid,
        'modelID': modelID,
        'owner': video_history["Item"]["owner"],
        'script': script
    }

def get_topics_from_transcript(script, modelID):
    prompt = f"""
    Human:
    Below is a transcript of a video.
    <script> {script} </script>
    Extract the agenda items from the script in the order they appear. Follow these guidelines:

    1. Aim for at least 15 topics. If the video is short, provide as many as possible.
    2. Topics should be specific and explanatory of the video's overall content.
    3. Express each topic in the script's original language.
    4. Keep proper nouns in their original language (typically English, but can be in Korean, Japanese, or other).
    5. Format each topic like a concise video title, using 8 words or less.
    6. Ensure topics follow the video's chronological order.

    Present the extracted agenda in this JSON format:
    <JSON>
    {{
    "Topics": [
        "Topic1",
        "Topic2",
        "Topic3",
        ...
        "Topic9"
    ]
    }}
    </JSON>
    Respond only with the JSON structure above, filled with the extracted topics.
        
    \n\nAssistant: <JSON>
    """

    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 4096,
        "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
        "temperature": 0.5,
        "top_p": 0.9
    })
    response = bedrock.invoke_model(body=body, accept='*/*', contentType='application/json', modelId=modelID)
    response_body = json.loads(response['body'].read())
    rawTopics = response_body['content'][0]['text']

    firstIndex = rawTopics.find('{')
    endIndex = rawTopics.rfind('}')
    
    topics = json.loads(rawTopics[firstIndex:endIndex+1])
    return topics["Topics"]