import datetime
import json
import boto3
import botocore
import os
import time

dynamodb = boto3.resource('dynamodb')
bedrock = boto3.client(
    service_name='bedrock-runtime',
    region_name='us-west-2',
    config=botocore.config.Config(connect_timeout=1000, read_timeout=1000)
)

def lambda_handler(event, context):
    topic = event['topic']
    topics = event['topics']
    uuid = event['uuid']
    modelID = event['modelID']
    owner = event['owner']
    index = event['index']
    script = event['script']

    # Get video parameters from DynamoDB
    history_table = dynamodb.Table(os.environ["HISTORY_TABLE_NAME"])
    video_history = history_table.get_item(Key={'id': uuid})
    theme = video_history['Item'].get('theme', 'general')
    video_length = video_history['Item'].get('videoLength', 60)

    extracted_highlight = process_topic(topic, topics, script, uuid, modelID, owner, index, theme, video_length)

    return { 
        'statusCode': 200,
        'processed_topic': extracted_highlight,
        'body': json.dumps('Finished Highlight Extraction!')
    }

def process_topic(topic, topics, script, uuid, modelID, owner, index, theme, video_length):
    shorts = dynamodb.Table(os.environ["HIGHLIGHT_TABLE_NAME"])
    
    section_text = extract_and_process_section(topic, topics, script, modelID, theme, video_length)
    
    timestamp = datetime.datetime.now(datetime.UTC).isoformat()[:-6]+"Z"
    
    highlight = {
        "Text": section_text,
        "Question": topic,
        "Index": str(index),
        "VideoName": uuid,
        "createdAt": timestamp,
        "updatedAt": timestamp,
        "owner": owner,
        "duration": video_length
    }
    
    shorts.put_item(Item=highlight)
    
    payload = {
        "uuid": uuid,
        "index": str(index),
        "question": topic
    }
    
    return payload

def extract_and_process_section(topic, topics, script, modelID, theme, video_length):
    # Calculate word count range based on video length (assuming ~2 words per second)
    min_words = max(20, int(float(video_length) * 1.5))  # Minimum 20 words
    max_words = int(float(video_length) * 2.5)  # Allow for natural speech variations

    prompt = f"""
INPUT FORMAT:
Original video script: <script> {script} </script>
Available topics: <agendas> {topics} </agendas>
Target topic: <Topic> {topic} </Topic>
Theme focus: <Theme> {theme} </Theme>
Target duration: {video_length} seconds

TASK:
Extract sentences from the script that best represent the target topic, suitable for a short-form video clip.
Focus on content that aligns with the specified theme: {theme}

CONSTRAINTS:
1. Length: Select content that would take {video_length} seconds to speak (approximately {min_words}-{max_words} words)
2. Theme Alignment: Content should strongly relate to the {theme} theme when possible
3. Relevance: Content must directly relate to the target topic
4. Coherence: Selections must make sense as a standalone clip
5. Uniqueness: Content should not overlap with other topics in <agendas>
6. Authenticity: Preserve exact original text, including errors or informal language
7. Language: Maintain the original language (English/Korean/Japanese/etc.)

OUTPUT FORMAT:
<thought>
- Selection rationale and theme alignment
- Coherence verification
- Overlap check with other topics
- Estimated speaking duration
- Theme relevance analysis
</thought>

<JSON>
{{
"VideoTitle": "Clear, engaging title (max 8 words)",
"text": "Selected content with [...] indicating cuts"
}}
</JSON>

EXAMPLES:
Example 1 (English):
<script>
The pyramids of Egypt are ancient monumental structures. Most were built during the Old and Middle Kingdom periods. The most famous Egyptian pyramids are those found at Giza, on the outskirts of Cairo. Several of the Giza pyramids are counted among the largest structures ever built. The Pyramid of Khufu is the largest Egyptian pyramid. It is the only one to remain largely intact. Egyptologists believe that the pyramids were built as tombs for the country's pharaohs and their consorts during the Old and Middle Kingdom periods.
</script>
<Topic>Egyptian Pyramids</Topic>
<Theme>historical</Theme>
<thought>
- Selected key historical information about pyramids
- Content forms coherent narrative about basic pyramid facts
- Avoids overlap with specific pharaoh histories
- Estimated duration: 25 seconds (50 words)
- Strong alignment with historical theme
</thought>
<JSON>
{{
"VideoTitle": "The Magnificent Pyramids of Ancient Egypt",
"text": "The pyramids of Egypt are ancient monumental structures. Most were built during the Old and Middle Kingdom periods. [...] The Pyramid of Khufu is the largest Egyptian pyramid. It is the only one to remain largely intact. Egyptologists believe that the pyramids were built as tombs for the country's pharaohs and their consorts during the Old and Middle Kingdom periods."
}}
</JSON>

IMPORTANT:
- Always preserve exact wording for timestamp matching
- Use [...] only between non-consecutive selections
- Don't correct or modify original text
- Ensure selections can stand alone without context
- Keep natural speech patterns intact
- Prioritize content that aligns with the specified theme
"""

    # 메시지 구조 설정
    messages = [
        {
            "role": "user",
            "content": [{"text": prompt}]
        }
    ]

    # 시스템 프롬프트 설정
    system_prompts = [{"text": f"You are an AI assistant that extracts {theme}-focused sections from video transcripts."}]

    # inference 설정
    inference_config = {
        "temperature": 0,
        "maxTokens": 4096,
        "topP": 0
    }

    try:
        response = bedrock.converse(
            modelId=modelID,
            messages=messages,
            system=system_prompts,
            inferenceConfig=inference_config
        )

        if modelID == "anthropic.claude-3-sonnet-20240229-v1:0":
            time.sleep(60)
        
        response_text = response['output']['message']['content'][0]['text']
        
        print(response_text)

        firstIndex = response_text.find('{')
        endIndex = response_text.rfind('}')
        
        chunk = json.loads(response_text[firstIndex:endIndex+1])
        
        return chunk['text']
    
    except Exception as e:
        print(f"Error in extract_and_process_section: {str(e)}")
        return ""
