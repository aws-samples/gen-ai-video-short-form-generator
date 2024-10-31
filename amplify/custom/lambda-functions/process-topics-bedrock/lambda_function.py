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
    script = event['script']  # You'll need to pass the script from the first Lambda

    extracted_highlight = process_topic(topic, topics, script, uuid, modelID, owner, index)

    return { 
        'statusCode': 200,
        'processed_topic': extracted_highlight,
        'body': json.dumps('Finished Highlight Extraction!')
    }

def process_topic(topic, topics, script, uuid, modelID, owner, index):
    shorts = dynamodb.Table(os.environ["HIGHLIGHT_TABLE_NAME"])
    
    section_text = extract_and_process_section(topic, topics, script, modelID)
    
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

def extract_and_process_section(topic, topics, script, modelID):
       
    prompt = f"""
INPUT FORMAT:
Original video script: <script> {script} </script>
Available topics: <agendas> {topics} </agendas>
Target topic: <Topic> {topic} </Topic>

TASK:
Extract sentences from the script that best represent the target topic, suitable for a short-form video clip.

CONSTRAINTS:
1. Length: Select content that would take 10-50 seconds to speak (approximately 20-100 words)
2. Relevance: Content must directly relate to the target topic
3. Coherence: Selections must make sense as a standalone clip
4. Uniqueness: Content should not overlap with other topics in <agendas>
5. Authenticity: Preserve exact original text, including errors or informal language
6. Language: Maintain the original language (English/Korean/Japanese/etc.)

OUTPUT FORMAT:
<thought>
- Selection rationale
- Coherence verification
- Overlap check with other topics
- Estimated speaking duration
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
<thought>
- Selected key information about pyramids' origin and significance
- Content forms coherent narrative about basic pyramid facts
- Avoids overlap with specific pharaoh histories
- Estimated duration: 25 seconds (50 words)
</thought>
<JSON>
{{
"VideoTitle": "The Magnificent Pyramids of Ancient Egypt",
"text": "The pyramids of Egypt are ancient monumental structures. Most were built during the Old and Middle Kingdom periods. [...] The Pyramid of Khufu is the largest Egyptian pyramid. It is the only one to remain largely intact. Egyptologists believe that the pyramids were built as tombs for the country's pharaohs and their consorts during the Old and Middle Kingdom periods."
}}
</JSON>

Example 2 (Korean):
<script>
김치는 한국의 대표적인 발효 음식입니다. 주로 배추와 무를 사용하며, 고춧가루, 마늘, 생강 등의 양념을 넣어 만듭니다. 김치는 비타민과 미네랄이 풍부하며, 유산균도 많이 함유되어 있습니다. 지역과 계절에 따라 다양한 종류의 김치가 있습니다. 김치는 이제 세계적으로 인정받는 건강식품이 되었습니다.
</script>
<Topic>김치의 특징과 영양</Topic>
<thought>
- Selected content focusing on kimchi's characteristics and nutrition
- Creates complete narrative about kimchi's health benefits
- Avoids overlap with regional varieties topic
- Estimated duration: 20 seconds (40 words)
</thought>
<JSON>
{{
"VideoTitle": "김치: 한국의 전통 발효 음식",
"text": "김치는 한국의 대표적인 발효 음식입니다. 주로 배추와 무를 사용하며, 고춧가루, 마늘, 생강 등의 양념을 넣어 만듭니다. 김치는 비타민과 미네랄이 풍부하며, 유산균도 많이 함유되어 있습니다. [...] 김치는 이제 세계적으로 인정받는 건강식품이 되었습니다."
}}
</JSON>

Example 3 (English):
<script>
Photosynthesis is a process used by plants and other organisms to convert light energy into chemical energy. This chemical energy is stored in carbohydrate molecules, such as sugars, which are synthesized from carbon dioxide and water. Oxygen is released as a byproduct. This process is crucial for life on Earth as it provides the oxygen we breath and the food we eat. Photosynthesis occurs in the chloroplasts, specifically using chlorophyll, the green pigment involved in photosynthesis. The process has two stages: light-dependent reactions and light-independent reactions, also known as the Calvin cycle.
</script>
<Topic>Process of Photosynthesis</Topic>
<thought>
- Selected core explanation of photosynthesis process
- Maintains scientific accuracy while being accessible
- Avoids overlap with cellular structure topics
- Estimated duration: 35 seconds (70 words)
</thought>
<JSON>
{{
"VideoTitle": "Photosynthesis: Nature's Way of Harnessing Light",
"text": "Photosynthesis is a process used by plants and other organisms to convert light energy into chemical energy. This chemical energy is stored in carbohydrate molecules, such as sugars, which are synthesized from carbon dioxide and water. Oxygen is released as a byproduct. [...] Photosynthesis occurs in the chloroplasts, specifically using chlorophyll, the green pigment involved in photosynthesis. The process has two stages: light-dependent reactions and light-independent reactions, also known as the Calvin cycle."
}}
</JSON>

IMPORTANT:
- Always preserve exact wording for timestamp matching
- Use [...] only between non-consecutive selections
- Don't correct or modify original text
- Ensure selections can stand alone without context
- Keep natural speech patterns intact
    \n\nAssistant:
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
    
    print(response_text)

    firstIndex = int(response_text.find('{'))
    endIndex = int(response_text.rfind('}'))
    
    chunk = json.loads(response_text[firstIndex:endIndex+1])
    
    return chunk['text']