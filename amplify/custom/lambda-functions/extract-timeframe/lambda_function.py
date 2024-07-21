import boto3
from datetime import datetime
import json
import os

s3 = boto3.client('s3')
bucket_name = os.environ["BUCKET_NAME"]
highlight_table = os.environ["HIGHLIGHT_TABLE_NAME"]

def duration_in_milliseconds(start_time, end_time):
    start_time_obj = datetime.strptime(start_time, "%H:%M:%S:%f")
    end_time_obj = datetime.strptime(end_time, "%H:%M:%S:%f")
    duration = end_time_obj - start_time_obj
    return int(duration.total_seconds() * 1000)

def find_timeframes_for_script(highlight_script, words_with_timestamp):
    highlight = highlight_script
    short_start = -1
    short_end = -1

    for item in words_with_timestamp:
        word = item["alternatives"][0]["content"]
        if highlight.strip().startswith(word):
            word = word.lstrip()
            highlight = highlight[len(word):].lstrip()
        
            if item["type"] == "pronunciation":
                if short_start == -1:
                    short_start = item["start_time"]
                short_end = item["end_time"]
                
            if not highlight.strip():
                return [short_start, str(short_end)]
        
        else:
            highlight = highlight_script
            short_start = -1
            short_end = -1
    
    return [short_start, short_end]

def extract_scripts_with_timestamps(uuid):
    json_object = s3.get_object(Bucket=bucket_name, Key=f'videos/{uuid}/Transcript.json')
    json_content = json.load(json_object['Body'])
    return json_content["results"]["items"]

def convert_seconds_to_timecode(seconds):
    seconds = float(seconds)
    hours, seconds = divmod(seconds, 3600)
    minutes, seconds = divmod(seconds, 60)
    frames = int((seconds - int(seconds)) * 25)
    return "{:02d}:{:02d}:{:02d}:{:02d}".format(int(hours), int(minutes), int(seconds), frames)

def new_video(timeframes):
    start_time_sec, end_time_sec = timeframes
    start_time_convert = convert_seconds_to_timecode(start_time_sec)
    end_time_convert = convert_seconds_to_timecode(end_time_sec)
    duration = duration_in_milliseconds(start_time_convert, end_time_convert)
    
    return {
        "duration": duration,
        "start_time_convert": start_time_convert,
        "end_time_convert": end_time_convert
    }

def lambda_handler(event, context):
    uuid = event['uuid'] 
    index = str(event['index'])
    
    dynamodb = boto3.resource('dynamodb')
    shorts_table = dynamodb.Table(highlight_table)

    raw_file_path = f's3://{bucket_name}/videos/{uuid}/RAW.mp4'
    output_destination = f's3://{bucket_name}/videos/{uuid}/FHD/{index}-FHD' 

    response = shorts_table.get_item(Key={'VideoName': uuid, 'Index': index})
    item = response.get('Item')
    if not item:
        raise ValueError("Item not found in DynamoDB")

    highlight_script = item.get("Text", "")
    words_with_timestamp = extract_scripts_with_timestamps(uuid)
    timeframe = find_timeframes_for_script(highlight_script, words_with_timestamp)
    
    if float(timeframe[0]) < 0.0 or float(timeframe[1]) < 0.0:
        return {
            'statusCode': 400,
            'body': 'Error on extracting timeframe',
            'success': 'false',
            'index': index,
            'duration': 0,
            'start_timecode': -1,
            'end_timecode': -1,
            'raw_file_path': raw_file_path,
            'output_destination': output_destination, 
            'uuid': uuid
        }
    
    video_dict = new_video(timeframe)
    duration = video_dict["duration"]
    start_timecode = video_dict["start_time_convert"]
    end_timecode = video_dict["end_time_convert"]

    shorts_table.update_item(
        Key={'VideoName': uuid, 'Index': index},
        UpdateExpression='SET #dur = :durVal',
        ExpressionAttributeNames={'#dur': 'duration'},
        ExpressionAttributeValues={':durVal': duration}
    )

    return {
        'statusCode': 200,
        'body': 'Extracted Timeline',
        'success': 'true',
        'index': index,
        'duration': duration,
        'uuid': uuid,
        'start_timecode': start_timecode,
        'end_timecode': end_timecode,
        'output_destination': output_destination,
        'raw_file_path': raw_file_path
    }