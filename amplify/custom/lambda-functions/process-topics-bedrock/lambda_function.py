import datetime
import json
import boto3
import botocore
import os

dynamodb = boto3.resource('dynamodb')
bedrock = boto3.client(
    service_name='bedrock-runtime',
    region_name='us-west-2',
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
        FIND THE MOST RELEVANT CONTENT:

        Carefully read the entire <script> {script} </script>.
        Understand the given <Topic> {topic} </Topic>.

    <instructions>
    1. Read the given <script></script> carefully.
    2. Select the most relevant sentences or parts(consisted of sentences) that would come together and act as a separate script, best explaining the <topic></topic>.
    3. Use [...] to indicate omitted text between non-consecutive selections.
    4. Maintain the original language, including any errors.
    5. Try to keep it less than 200 words. Not a must.
    6. Format your response as follows:
    <thought>
    Briefly explain:
    - Your selection process
    - How you preserved the original text
    - Any challenges faced
    - Reasons for non-consecutive selections (if applicable)
    </thought>
    <Topic>Brief topic description</Topic>
    <JSON>
    {{
    "VideoTitle": "Concise title summarizing the content",
    "text": "Your selection of relevant sentences, preserving original text exactly"
    }}
    </JSON>
    6. Double-check for accuracy and format adherence.
    </instructions>
    <important_notes>

    Prioritize relevance and preservation of original text.
    Match the output language to the input script.
    Do not correct any errors in the original text.
    Maintain the exact format, including double curly braces in JSON.
    Try to keep the selection total in less than 200 words. 
    Use [...] for non-consecutive selections.
    </important_notes>

    <examples>
    Example 1 (English):
    <script>
    The pyramids of Egypt are ancient monumental structures. Most were built during the Old and Middle Kingdom periods. The most famous Egyptian pyramids are those found at Giza, on the outskirts of Cairo. Several of the Giza pyramids are counted among the largest structures ever built. The Pyramid of Khufu is the largest Egyptian pyramid. It is the only one to remain largely intact. Egyptologists believe that the pyramids were built as tombs for the country's pharaohs and their consorts during the Old and Middle Kingdom periods.
    </script>
    <Topic>Egyptian Pyramids</Topic>
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
    <JSON>
    {{
    "VideoTitle": "Photosynthesis: Nature's Way of Harnessing Light",
    "text": "Photosynthesis is a process used by plants and other organisms to convert light energy into chemical energy. This chemical energy is stored in carbohydrate molecules, such as sugars, which are synthesized from carbon dioxide and water. Oxygen is released as a byproduct. [...] Photosynthesis occurs in the chloroplasts, specifically using chlorophyll, the green pigment involved in photosynthesis. The process has two stages: light-dependent reactions and light-independent reactions, also known as the Calvin cycle."
    }}
    </JSON>
    Example 4 (English):
    <script>
    The Rennaisance was a period of cultural, artistic, political, and economic revival following the Middle Ages. It began in Italy in the 14th century and lasted until the 17th century, marking the transition between Medieval and Early Modern Europe. The term 'Renaissance' is derived from the French word for 'rebirth'. This period was characterized by a renewed interest in ancient Greek and Roman texts and a shift towards humanism. Notable Rennaisance figures include Leonardo da Vinci, Michelangelo, and Raphael. The invention of the printing press in the 15th century greatly facilitated the spread of new ideas.
    </script>
    <Topic>The Renaissance Period</Topic>
    <JSON>
    {{
    "VideoTitle": "The Renaissance: Europe's Age of Rebirth",
    "text": "The Rennaisance was a period of cultural, artistic, political, and economic revival following the Middle Ages. It began in Italy in the 14th century and lasted until the 17th century, marking the transition between Medieval and Early Modern Europe. [...] This period was characterized by a renewed interest in ancient Greek and Roman texts and a shift towards humanism. Notable Rennaisance figures include Leonardo da Vinci, Michelangelo, and Raphael. The invention of the printing press in the 15th century greatly facilitated the spread of new ideas."
    }}
    </JSON>
    Example 5 (Korean):
    <script>
    한글은 세종대왕이 1443년에 창제한 한국의 고유 문자입니다. 한글은 표음문자로, 자음과 모음을 조합하여 글자를 만듭니다. 처음에는 28자였지만, 현재는 24자를 사용합니다. 한글의 제작 원리는 과학적이고 체계적입니다. 자음은 발음 기관의 모양을, 모음은 하늘, 땅, 사람을 본떠 만들었습니다. 한글은 배우기 쉽고 사용하기 편리하여 문맹 퇴치에 크게 기여했습니다. 오늘날 한글은 세계에서 가장 과학적인 문자 중 하나로 인정받고 있습니다.
    </script>
    <Topic>한글의 특징과 역사</Topic>
    <JSON>
    {{
    "VideoTitle": "한글: 세종대왕의 위대한 창조",
    "text": "한글은 세종대왕이 1443년에 창제한 한국의 고유 문자입니다. 한글은 표음문자로, 자음과 모음을 조합하여 글자를 만듭니다. [...] 한글의 제작 원리는 과학적이고 체계적입니다. 자음은 발음 기관의 모양을, 모음은 하늘, 땅, 사람을 본떠 만들었습니다. [...] 오늘날 한글은 세계에서 가장 과학적인 문자 중 하나로 인정받고 있습니다."
    }}
    </JSON>
    </examples>
    
    \n\nAssistant:
    """

    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 4096,
        "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
        "temperature": 0,
        "top_p": 0
    })

    #for test purposes

    response = bedrock.invoke_model(body=body, accept='*/*', contentType='application/json', modelId=modelID)

    response_body = json.loads(response['body'].read())
    
    response_text = response_body['content'][0]['text']
    
    print(response_text)

    firstIndex = int(response_text.find('{'))
    endIndex = int(response_text.rfind('}'))
    
    chunk = json.loads(response_text[firstIndex:endIndex+1])
    
    return chunk['text']