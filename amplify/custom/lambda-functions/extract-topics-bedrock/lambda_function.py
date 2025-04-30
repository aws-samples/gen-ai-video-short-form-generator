import json
import boto3
import botocore
import os
import time

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
    theme = video_history['Item'].get('theme', 'general')
    num_videos = video_history['Item'].get('numberOfVideos', 5)
    
    response = s3.get_object(Bucket=bucket_name, Key=source_file_key)
    transcript_json = json.load(response['Body'])
    script = transcript_json['results']['transcripts'][0]['transcript']

    topics = get_topics_from_transcript(script, modelID, theme, num_videos)

    return {
        'statusCode': 200,
        'topics': topics,
        'uuid': uuid,
        'modelID': modelID,
        'owner': video_history["Item"]["owner"],
        'script': script
    }

def get_topics_from_transcript(script, modelID, theme='general', num_videos=5):
    prompt = f"""
    Below is a transcript of a video.
    <script> {script} </script>

    Extract distinct segments/topics that could work as standalone short-form content from the script, focusing on the theme: {theme}. Follow these guidelines:

    1. Aim for exactly {num_videos} topics that best match the {theme} theme. If not enough content matches the theme, provide as many as possible.
    2. Each topic should be:
    - Self-contained (can be understood without full context)
    - Engaging as a standalone clip
    - Have a clear focus/message
    - Not overlap significantly with other topics
    - Strongly relate to the {theme} theme when possible

    3. Express each topic in the script's original language.
    4. Keep proper nouns in their original language (typically English, but can be in Korean, Japanese, or other).
    5. Format each topic like a concise video title, using 8 words or less.
    6. Topics must follow the video's chronological order.
    7. If the theme is 'general', extract diverse topics covering different aspects.

    Present the extracted topics in this JSON format:
    <JSON>
    {{
    "Topics": [
        "Topic1",
        "Topic2",
        ...
        "Topic{num_videos}",
    ]
    }}
    </JSON>
    Respond only with the JSON structure above, filled with the extracted topics.
    """

    # 메시지 구조 설정
    messages = [
        {
            "role": "user",
            "content": [{"text": prompt}]
        }
    ]

    # 시스템 프롬프트 설정 (필요한 경우)
    system_prompts = [{"text": f"You are an AI assistant that extracts {theme}-focused topics from video transcripts."}]

    # inference 설정
    inference_config = {
        "temperature": 0.5,
        "maxTokens": 4096,
        "topP": 0.9
    }

    try:
        # Bedrock API 호출
        response = bedrock.converse(
            modelId=modelID,
            messages=messages,
            system=system_prompts,
            inferenceConfig=inference_config
        )

        # 응답에서 텍스트 추출
        rawTopics = response['output']['message']['content'][0]['text']

        # JSON 부분만 추출
        firstIndex = rawTopics.find('{')
        endIndex = rawTopics.rfind('}')
        
        topics = json.loads(rawTopics[firstIndex:endIndex+1])
        return topics["Topics"]
    
    except Exception as e:
        print(f"Error in get_topics_from_transcript: {str(e)}")
        raise e
