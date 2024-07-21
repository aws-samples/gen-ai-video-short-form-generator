import datetime
import json
import boto3
import botocore
import os

dynamodb = boto3.resource('dynamodb')
bedrock = boto3.client(
    service_name='bedrock-runtime',
    region_name='us-east-1',
    config=botocore.config.Config(connect_timeout=1000, read_timeout=1000)
)

def lambda_handler(event, context):

    topic = event['topic']
    uuid = event['uuid']
    modelID = event['modelID']
    owner = event['owner']
    index = event['index']
    script = event['script']  # You'll need to pass the script from the first Lambda

    extracted_highlight = process_topic(topic, script, uuid, modelID, owner, index)

    return { 
        'statusCode': 200,
        'processed_topic': extracted_highlight,
        'body': json.dumps('Finished Highlight Extraction!')
    }

def process_topic(topic, script, uuid, modelID, owner, index):
    shorts = dynamodb.Table(os.environ["HIGHLIGHT_TABLE_NAME"])
    
    section_text = extract_and_process_section(topic, script, modelID)
    
    timestamp = datetime.datetime.now(datetime.UTC).isoformat()[:-6]+"Z"
    
    highlight = {
        "Text": section_text,
        "Question": topic,
        "Index": str(index),
        "VideoName": uuid,
        "createdAt": timestamp,
        "updatedAt": timestamp,
        "owner": owner
    }
    
    shorts.put_item(Item=highlight)
    
    payload = {
        "uuid": uuid,
        "index": str(index),
        "question": topic
    }
    
    return payload

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
            From the part that you have found in <Step 2>, extract and chunk out a pat of the script that best explains the specified topic. The part should be less than 300 words, 
            While doing so, just copy the whole string. Never, in any case, fix, modify, rephrase, summarize, correct, skip, or change anything from the original <script>. This includes everything from punctuation, spelling, grammatical errors, and spacing.
        </Step 3>
        <Step 4>
            Check again the section you chose above. It should not have changed a single letter. We should be able to find the exact pharse from the <script>. It should be less than 300 words but can be shorter to only hold the neccessary part.
        </Step 4>
        <Step 5>
            Provide a fitting video title in the scripts language for this part, ensuring that proper nouns and AWS service names are kept in their correct English format. Use AWS and Amazon appropriately in service names. 한국어로 쓰세요. 
        </Step 5>
    </Instructions>
    
    Output only the extracted section as below: 
    
    <JSON>
    {{
        "VideoTitle": "[Korean video title with proper nouns/AWS services in English]",
        "text": "[Extracted relevant section from the original transcript <= 300 words]"
    }}
    </JSON>
    
    Write after <JSON> and only 
    
    \n\nAssistant:<JSON> 
    """

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