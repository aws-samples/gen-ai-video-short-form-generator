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
    You are an AI assistant extracting sections from video scripts. Your two primary objectives are:

    FIND THE RIGHT SECTION:

    Carefully read the entire <script> {script} </script>.
    Understand the given <Topic> {topic} </Topic>.
    Identify the specific part that BEST covers the <Topic>.
    This section MUST be the most relevant to the topic, even if not perfect.


    NEVER CHANGE ANYTHING:

    CRITICAL: Copy the identified section EXACTLY as it appears.
    DO NOT modify, correct, or alter the text in ANY way.
    This includes preserving all spelling errors, grammatical mistakes, and formatting.
    The extracted text must be found word-for-word in the original script.

    Additional Instructions:

    Limit the extracted section to 200 words or less.
    Create a title for the video in the script's language (keep proper nouns in English).
    Present your results in this format:
    <JSON>
    {{
    "VideoTitle": "[Created title]",
    "text": "[Extracted section - UNCHANGED from original]"
    }}
    </JSON>

    Before the JSON, explain your process in a <thought> tag:

    Why you chose that specific section
    How you ensured you didn't change anything
    Any challenges in finding the right section or keeping it unaltered

    Final Reminder: The accuracy of selecting the right section and preserving the original text exactly is paramount. Double-check these aspects before submitting.
    EXAMPLES:
    Example 1:
    <script>
    Welcome to our video on climate change. Today, we'll discuss the causes, affects, and potential solutions to this global issue. Climate change refers to long- tomm shifts in temrature and weather patterns. While these changes can occur naturally, human activities have been the main driver of climate change since the 1800s, primly due to the burning of fossil fuels like coal, oil, and gas.This process releases greenhouse gases into Earth's atmosphere, trapping heat and raising global temperatures. The affects of climate change are far-reaching,including more frequent and severe weather events, rising sea levels, and disruptions to ecosystems. However, there are solutions we can implement to mitigate these affects, such as transitioning to renewable energy sources, improving energy efficiency, and adopting sustainable practices in agriculture and industry.
    </script>
    <Topic>Causes of climate change</Topic>
    <JSON>
    {{
    "VideoTitle": "The Primary Causes of Climate Change",
    "text": "Climate change refers to long- tomm shifts in temrature and weather patterns. While these changes can occur naturally, human activities have been the main driver of climate change since the 1800s, primly due to the burning of fossil fuels like coal, oil, and gas.This process releases greenhouse gases into Earth's atmosphere, trapping heat and raising global temperatures."
    }}
    </JSON>
    Example 2:
    <script>
    안녕하세요, 오늘은 한국의 대중문화, 특히 K-pop에 대해 얘기해볼껀데요. K-pop은 요즘 전세계적으로 인기를 끌고 있죠. BTS, BLACKPINK 같은 그룹들이 빌보드 차트에서 큰 성공을 거두면서 한국 음악의 위상이 높아졌어요. K-pop의 특징으로는 화려한 퍼포먼스, 중독성있는 멜로디, 그리고 아이돌들의 완벽한 외모가 있습니다. 아이돌 그 룹 은 데뷔 전에 몇년 안연습생 생활을 하면서춤과 노래를 연습하죠. 이런 시스템이 K pop의 뛰어난 퀄리티를 만들어내는 거에요. K-pop은 음악뿐만 아니라 패션, 뷰티 트렌드에도 큰 영향을 미치고 있어요. 팬들은 아이돌들의 스타일을 따라하려고 하죠. 요즘엔 K-pop 아이돌들이 글로벌 브랜드의 앰배서더로 활동하는 경우도 많아요. 이런 현상을 통해 한국 문화가 세계로 전파되고 있다고 할 수 있쥬? K-pop은 이제 한국을 대표하는 문화 콘텐츠로 자리잡았습니다.
    </script>
    <Topic>K-pop 아이돌 트레이닝</Topic>
    <JSON>
    {{
    "VideoTitle": "K-pop 아이돌의 성공 비결: 철저한 트레이닝 시스템",
    "text": "아이돌 그 룹 은 데뷔 전에 몇년 안연습생 생활을 하면서춤과 노래를 연습하죠. 이런 시스템이 K pop의 뛰어난 퀄리티를 만들어내는 거에요."
    }}
    </JSON>
    Example 3:
    <script>
    Today we're going to talk about the water cycle, also known as the hydrologic cycle. This is the continuous movement of water within the Earth and atmosphere. It's a complex system that includes many different processes. Lets start with evaporation. This occurs when the sun heats up water in rivers, lakes, and oceans. The water turns into vapor or steam and rises up into the atmosphere. As the water vapor rises,it cools and condenses to form clouds. This process is called condensation. When the water droplets in clouds become to heavy, they fall back to Earth as precipitation. This can be in the form of rain, snow, sleet, or hail. Some of this water flows into rivers, lakes, and oceans. This is called surface runoff. Some of it soaks into the ground, which we call infiltration. This water can be taken up by plants, flow underground, or stay stored as groundwater. The cycle then repeats itself, with water continuously moving through these different stages.
    </script>
    <Topic>Condensation in the water cycle</Topic>
    <JSON>
    {{
    "VideoTitle": "Condensation: A Key Step in the Water Cycle",
    "text": "As the water vapor rises,it cools and condenses to form clouds. This process is called condensation. When the water droplets in clouds become to heavy, they fall back to Earth as precipitation."
    }}
    
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