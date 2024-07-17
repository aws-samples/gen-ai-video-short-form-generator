import datetime
import json
import boto3
import botocore
import os

# Initialize boto3 clients
s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
eventbridge = boto3.client('events') 
bedrock = boto3.client(
    service_name='bedrock-runtime',
    region_name='us-east-1',
    config=botocore.config.Config(connect_timeout=1000, read_timeout=1000)
)

# Lambda handler function
def lambda_handler(event, context):
    
    bucket_name = os.environ["BUCKET_NAME"]
    table_name = os.environ["HISTORY_TABLE_NAME"]

    uuid = event['uuid']
    source_file_key = "videos/" + uuid + "/Transcript.json"

    history = dynamodb.Table(table_name)
    video_history = history.get_item(
        Key={
            'id': uuid
        }
    )
    modelID = video_history['Item']['modelID']
    owner = video_history["Item"]["owner"]
    
    # Fetch the transcript from S3
    response = s3.get_object(Bucket=bucket_name, Key=source_file_key)
    transcript_json = json.load(response['Body'])
    script = transcript_json['results']['transcripts'][0]['transcript']

    # Process the transcript through the bedrock model to extract topics
    topics = get_topics_from_transcript(script, modelID)
    video_array = process_topics(topics, script, uuid, modelID, owner)

    return {
        'statusCode': 200,
        'video_array': video_array,
        'body': json.dumps('Finished Highlight Extraction!')
    }

def get_topics_from_transcript(script, modelID):
    prompt = f"""
    Human:
    Below is a transcript of a video about Amazon Web Services.
    <script> {script} </script>

    Find the agenda in the order of the script. Be specific and extract 9 topics. 
    Topics should be explanatory of something about the whole video's topic. Only give the topics in Korean, less than 8 words. Keep proper nouns in its original language.
    Topic should be written like a video title. 
    Give it to me in well-formated JSON structure: <JSON> {{"Topics": ["Topic1","Topic2","Topic3","Topic4","Topic5"]}}
    
    \n\nAssistant: <JSON>
    """

    '''' # for later use (Converse API) 
    messages = [] 
    messages.append({"role": "user", "content": prompt})
    temperature = 0.5
    top_p = 0.9
    maxTokens = 4096
    inference_config = {"temperature": 0.4, "topP": top_p, "maxTokens": maxTokens}
    response = bedrock.converse(modelId=modelID, messages=messages, inference_config=inference_config)
    response_body = json.loads(response['output'].read())
    rawTopics = response_body['message']['content'][0]['text']
    '''

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

def process_topics(topics, script, uuid, modelID, owner):
    shorts = dynamodb.Table(os.environ["HIGHLIGHT_TABLE_NAME"])
    video_array = []
    for i, topic in enumerate(topics):
        section_text = extract_and_process_section(topic, script, modelID)
        timestamp = datetime.datetime.now(datetime.UTC).isoformat()[:-6]+"Z"
        highlight = {
            "Text": section_text,
            "Question": topic,
            "Index": str(i + 1),
            "VideoName": uuid,
            "createdAt": timestamp,
            "updatedAt": timestamp,
            "owner": owner
        }
        shorts.put_item(Item=highlight)
        
        payload = {
            "uuid": uuid,
            "index": str(i + 1),
            "question": topic
        }
        
        index = str(i)
        video_array.append(payload)
    
    return video_array
        
def extract_and_process_section(topic, script, modelID):
    prompt = f"""
    Human: 
    This is a <script> of a video about Amazon Web Services.
    
    <script> {script} </script> 
    
    Extract and Chunk out one part of the <script> that best explains or cover about the <topic> below. 
    <Topic> {topic} </Topic>

    Follow <Instructions> and think step by step to do this. 
    
    <Instructions>
        <Step 1>
            Go through the whole script and understand the whole video.
        </Step 1>
        <Step 2>
            Now from the script, find out the part where the <Topic> is being covered.
        </Step 2>
        <Step 3>
            From the part that you have found in <Step 2>, extract and chunk out a pat of the script that best explains the specified topic. The part should be less than 400 words, 
            While doing so, just copy the whole string. Never, in any case, fix, modify, rephrase, summarize, correct, skip, or change anything from the original <script>. This includes everything from punctuation, spelling, grammatical errors, and spacing.
        </Step 3>
        <Step 4>
            Check again the section you chose above. It should not have changed a single letter. We should be able to find the exact pharse from the <script>. It should be less than 300 words but can be shorter to only hold the neccessary part.
        </Step 4>
        <Step 5>
            Provide a fitting video title in Korean for this part, ensuring that proper nouns and AWS service names are kept in their correct English format. Use AWS and Amazon appropriately in service names. 한국어로 쓰세요. 
        </Step 5>
    </Instructions>
    
    Output only the extracted section as below: 
    
    <JSON>
    {{
        "VideoTitle": "[Korean video title with proper nouns/AWS services in English]",
        "text": "[Extracted relevant section from the original transcript <= 400 words]"
    }}
    </JSON>
    
    Write after <JSON> and only 
    
    \n\nAssistant:<JSON> 
    """

    '''
    messages = [] 
    messages.append({"role": "user", "content": prompt})

    temperature = 0.5
    top_p = 0.9
    maxTokens = 4096
    inference_config = {"temperature": 0.4, "topP": top_p, "maxTokens": maxTokens}

    response = bedrock.converse(modelId=modelID, messages=messages, inference_config=inference_config)

    response_body = json.loads(response['output'].read())
    
    response_text = response_body['message']['content'][0]['text']
    
    print(response_text)
    '''

    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 4096,
        "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
        "temperature": 0,
        "top_p": 0
    })
    response = bedrock.invoke_model(body=body, accept='*/*', contentType='application/json', modelId=modelID)
    response_body = json.loads(response['body'].read())
    response_text = response_body['content'][0]['text']

    firstIndex = int(response_text.find('{'))
    endIndex = int(response_text.rfind('}'))
    
    chunk = json.loads(response_text[firstIndex:endIndex+1])
    
    return chunk['text']
