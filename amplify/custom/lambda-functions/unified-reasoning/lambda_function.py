import json
import boto3
import botocore
import os
import datetime
from decimal import Decimal
from datetime import datetime

# Initialize AWS clients
s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
bedrock_runtime = boto3.client(
    service_name='bedrock-runtime',
    region_name='us-west-2',
    config=botocore.config.Config(connect_timeout=1000, read_timeout=1000)
)

def lambda_handler(event, context):
    bucket_name = os.environ["BUCKET_NAME"]
    history_table_name = os.environ["HISTORY_TABLE_NAME"]
    highlight_table_name = os.environ["HIGHLIGHT_TABLE_NAME"]

    uuid = event['uuid']
    source_file_key = f"videos/{uuid}/Transcript.vtt"  # Try English VTT first

    history = dynamodb.Table(history_table_name)
    video_history = history.get_item(Key={'id': uuid})
    modelID = video_history['Item']['modelID']
    owner = video_history['Item']['owner']
    theme = video_history['Item'].get('theme', 'general')
    num_videos = int(video_history['Item'].get('numberOfVideos', 5))
    video_length = video_history['Item'].get('videoLength', 60)
    
    # Try to get VTT file (first try English, then Korean)
    response = s3.get_object(Bucket=bucket_name, Key=source_file_key)

    vtt_content = response['Body'].read().decode('utf-8')
    script, vtt_segments = parse_vtt(vtt_content)

    # Unified reasoning 수행
    highlights = unified_reasoning(script, modelID, vtt_segments, theme, num_videos, video_length)

    # 하이라이트 저장
    results = []
    timestamp = datetime.now().isoformat()[:-6]+"Z"
    shorts = dynamodb.Table(highlight_table_name)

    for idx, highlight in enumerate(highlights):
        # Calculate duration and format timeframes
        total_duration = Decimal(str(sum(end - start for start, end in highlight['timeframes'])))
        formatted_timeframes = [
            {
                "StartTimecode": convert_seconds_to_timecode(start),
                "EndTimecode": convert_seconds_to_timecode(end)
            }
            for start, end in highlight['timeframes']
        ]

        # Save highlight
        highlight_item = {
            "Text": highlight['text'],
            "Question": highlight['title'],
            "Index": str(idx),
            "VideoName": uuid,
            "createdAt": timestamp,
            "updatedAt": timestamp,
            "owner": owner,
            "duration": total_duration,
            "timeframes": str(formatted_timeframes),
            "theme": theme
        }
        shorts.put_item(Item=highlight_item)

        results.append({
            'index': str(idx),
            'title': highlight['title'],
            'duration': total_duration,
            'timeframes': formatted_timeframes
        })

    return {
        'statusCode': 200,
        'body': results
    }

def unified_reasoning(script, modelID, vtt_segments, theme, num_videos, video_length):
    # Create a mapping of text to timestamps
    text_to_segments = {}
    for segment in vtt_segments:
        text = " ".join(segment['text'])
        if text:
            text_to_segments[text] = (segment['start'], segment['end'])

    # Calculate word count range based on video length
    min_words = max(20, int(float(video_length) * 1.5))  # Minimum 20 words
    max_words = int(float(video_length) * 2.5)  # Allow for natural speech variations

    prompt = f"""
INPUT FORMAT:
Video transcript with timestamps:
{json.dumps(vtt_segments, indent=2)}

Theme focus: {theme}
Number of videos to create: {num_videos}
Target video length: {video_length} seconds

TASK:
Extract exactly {num_videos} engaging segments from the transcript that would work well as standalone short-form content.
Focus on content that aligns with the specified theme: {theme}
For each segment, identify the exact VTT segments that contain the content to preserve timestamps.
Always go for the best short-form content. Revise your work. Think step by step. 

CONSTRAINTS:
1. Content Requirements:
   - Extract exactly {num_videos} distinct segments that best match the {theme} theme
   - Each segment must be self-contained and strongly relate to the {theme} theme
   - Focus on high-engagement content (key insights, interesting stories, memorable moments)
   - Content must make sense without external context
   - If theme is 'general', select diverse engaging content

2. Length and Format:
   - Target duration: {video_length} seconds when spoken (approximately {min_words}-{max_words} words)
   - Prefer segments that naturally fit the target duration
   - Use [...] to mark non-consecutive content
   - Preserve EXACT original wording for timestamp matching

3. Title Creation:
   - Maximum 8 words
   - Capture main point or hook
   - Use engaging, descriptive language. Title should be written in the language of the script
   - Include theme-relevant keywords when possible

4. Technical Requirements:
   - Keep exact transcript wording for accurate timestamp matching
   - Include complete sentences/thoughts
   - Maintain chronological order
   - Start and end at natural break points
   - Include start and end timestamps for each segment

OUTPUT FORMAT:
<thought>
- Analyze each selected segment for:
  * Theme alignment and relevance
  * Coherence and standalone value
  * Engagement potential
  * Appropriate length ({video_length} seconds target)
  * Natural break points
</thought>

<JSON>
{{
  "highlights": [
    {{
      "title": "Clear, engaging title",
      "text": "Exact text from transcript [...] with proper cuts marked",
      "timeframes": [[start_time1, end_time1], [start_time2, end_time2], ...]
    }},
    ...
  ]
}}
</JSON>

CRITICAL NOTES:
- DO NOT modify any words from the original transcript
- DO NOT correct grammar or improve phrasing
- DO NOT combine distant segments without [...] markers
- DO NOT include segments requiring external context
- DO ensure each segment has clear beginning and end
- DO include accurate timestamps for each segment
- DO prioritize content that aligns with the {theme} theme
- Always revise if you have the right timestamps
- Quality and theme alignment of each highlight is important
"""

    messages = [
        {
            "role": "user",
            "content": [{"text": prompt}]
        }
    ]

    # Add system prompt
    system_prompts = [{"text": f"You are an AI assistant that extracts {theme}-focused segments from video transcripts for short-form content."}]

    try:
        if modelID == 'us.anthropic.claude-3-7-sonnet-20250219-v1:0':
            config = {
                "max_tokens": 64000,
                "thinking": {
                    "type": "enabled",
                    "budget_tokens": 60000
                }
            }
            response = bedrock_runtime.converse(
                modelId=modelID,
                messages=messages,
                additionalModelRequestFields=config
            )

            print(response)
            content_blocks = response["output"]["message"]["content"]

            reasoning = ''
            text = ''

            print(content_blocks)
            
            for chunk in content_blocks:
                if "text" in chunk:
                    text = chunk["text"]

            print(f"Response text: {text}")

        elif modelID == "us.deepseek.r1-v1:0":
            config = {
                "temperature": 0,
                "maxTokens": 32768
            }
            response = bedrock_runtime.converse(
                modelId=modelID,
                messages=messages,
                system=system_prompts,
                inferenceConfig=config
            )

            content_blocks = response['output']["message"]["content"]

            reasoning = ''
            text = ''
            
            for chunk in content_blocks:
                if "text" in chunk:
                    text = chunk["text"]
                elif "reasoningContent" in chunk:
                    reasoning = chunk["reasoningContent"]["reasoningText"]

            print(f"Response text: {text}")
            print(f"Reasoning: {reasoning}")

        # Extract JSON from the response text
        start_idx = text.find('{')
        end_idx = text.rfind('}')
        if start_idx != -1 and end_idx != -1:
            json_str = text[start_idx:end_idx+1]
            try:
                result = json.loads(json_str)
                # Sort timeframes for each highlight
                for highlight in result['highlights']:
                    highlight['timeframes'].sort(key=lambda x: x[0])  # Sort by start time
                return result['highlights'][:num_videos]  # Ensure we only return the requested number of videos
            except json.JSONDecodeError as e:
                print(f"Failed to parse JSON from response: {json_str}")
                raise Exception(f"JSON parsing error: {str(e)}")
        else:
            print(f"No JSON found in response: {text}")
            raise Exception("No valid JSON found in model response")

    except Exception as e:
        print(f"Error in unified_reasoning: {str(e)}")
        raise

def parse_vtt(vtt_content):
    """VTT 파일을 파싱하여 전체 스크립트와 타임스탬프가 있는 세그먼트 목록을 반환합니다."""
    lines = vtt_content.split('\n')
    segments = []
    full_script = []
    current_segment = None
    
    for line in lines:
        line = line.strip()
        if not line or line == 'WEBVTT':
            continue
            
        # 타임스탬프 라인 체크 (00:00:00.000 --> 00:00:00.000)
        if ' --> ' in line:
            if current_segment:
                segments.append(current_segment)
            start, end = line.split(' --> ')
            current_segment = {
                'start': convert_timestamp_to_seconds(start),
                'end': convert_timestamp_to_seconds(end),
                'text': []
            }
        elif current_segment is not None:
            current_segment['text'].append(line)
            full_script.append(line)
    
    if current_segment:
        segments.append(current_segment)
    
    return ' '.join(full_script), segments

def convert_timestamp_to_seconds(timestamp):
    """VTT 타임스탬프를 초 단위로 변환합니다."""
    # 00:00:00.000 형식의 타임스탬프를 파싱
    h, m, s = timestamp.split(':')
    seconds = float(h) * 3600 + float(m) * 60 + float(s)
    return seconds

def convert_seconds_to_timecode(seconds):
    """초 단위 시간을 타임코드 형식으로 변환합니다."""
    hours, remainder = divmod(float(seconds), 3600)
    minutes, seconds = divmod(remainder, 60)
    frames = int((seconds - int(seconds)) * 25)  # 25 fps
    return f"{int(hours):02d}:{int(minutes):02d}:{int(seconds):02d}:{frames:02d}"
