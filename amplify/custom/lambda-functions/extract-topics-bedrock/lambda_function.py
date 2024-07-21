import json
import boto3
import botocore
import os

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
bedrock = boto3.client(
    service_name='bedrock-runtime',
    region_name='us-east-1',
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
    Below is a transcript of a video about Amazon Web Services.
    <script> {script} </script>

    Find the agenda in the order of the script. Be specific and extract 9 topics. 
    Topics should be explanatory of something about the whole video's topic. Only give the topics in the scripts Language, less than 8 words. Keep proper nouns in its original language.
    Topic should be written like a video title. 
    Give it to me in well-formated JSON structure: <JSON> {{"Topics": ["Topic1","Topic2","Topic3","Topic4","Topic5"]}}
    
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