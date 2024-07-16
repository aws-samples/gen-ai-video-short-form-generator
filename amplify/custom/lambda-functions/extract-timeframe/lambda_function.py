import boto3
from datetime import datetime
import json
import os

s3 = boto3.client('s3')
mediaconvert = boto3.client('mediaconvert', endpoint_url='https://lxlxpswfb.mediaconvert.us-east-1.amazonaws.com')
bucket_name = os.environ["BUCKET_NAME"]
highlight_table = os.environ["HIGHLIGHT_TABLE_NAME"]

def duration_in_milliseconds(start_time, end_time):
    start_time_obj = datetime.strptime(start_time, "%H:%M:%S:%f")
    end_time_obj = datetime.strptime(end_time, "%H:%M:%S:%f")
    duration = end_time_obj - start_time_obj
    duration_ms = int(duration.total_seconds() * 1000)
    return duration_ms

def find_timeframes_for_script(highlight_script, words_with_timestamp):
    initial_script = highlight_script
    highlight = highlight_script
    short_start = -1
    short_end = -1
    started = False
    full_highlight_found = False

    for item in words_with_timestamp:
        word = item["alternatives"][0]["content"]
        if not full_highlight_found and highlight.strip().startswith(word):
            started = True
            word = word.lstrip()
            highlight = highlight[len(word):].lstrip()
        
            if item["type"] == "pronunciation":
                if short_start == -1:
                    short_start = item["start_time"]
                short_end = item["end_time"]
                
            if not highlight.strip():
                full_highlight_found = True
        
        else:
            highlight = initial_script
            started = False
            short_start = -1
            short_end = -1
        
        if full_highlight_found:
            short_end = str(short_end)
            break
    
    return [short_start, short_end]

def extract_scripts_with_timestamps(uuid):
    json_object = s3.get_object(Bucket=bucket_name, Key=f'videos/{uuid}/Transcript.json')
    json_content = json.load(json_object['Body'])
    words_with_timestamp = json_content["results"]["items"]
    
    return words_with_timestamp

def convert_seconds_to_timecode(seconds):
    seconds = float(seconds)
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    remaining_seconds = int(seconds % 60)
    frames = int((seconds - int(seconds)) * 25)  # Assuming 25 frames per second, adjust if needed

    return "{:02d}:{:02d}:{:02d}:{:02d}".format(hours, minutes, remaining_seconds, frames)

def create_new_video(uuid, section_index, timeframes):
    if len(timeframes) != 2:
        raise ValueError("Invalid timeframes format. Expected [start_time, end_time].")
    
    start_time_sec, end_time_sec = timeframes
    start_time_convert = convert_seconds_to_timecode(start_time_sec)
    end_time_convert = convert_seconds_to_timecode(end_time_sec)
    duration = duration_in_milliseconds(start_time_convert, end_time_convert)
    
    video_dict = {}
    
    video_dict["duration"] = duration
    video_dict["start_time_convert"] = start_time_convert
    video_dict["end_time_convert"] = end_time_convert
    
    '''
    response = mediaconvert.create_job(
        Role='arn:aws:iam::939021814303:role/service-role/MediaConvert_Default_Role',
        JobTemplate='toFHD',  # Replace 'Template' with your MediaConvert job template ARN
        Settings={
            'Inputs': [
                {
                    'FileInput': f's3://{bucket_name}/videos/{input_file}',
                    'InputClippings': [
                        {
                            'StartTimecode': start_time_convert,
                            'EndTimecode': end_time_convert
                        }
                    ]
                }
            ],
            'OutputGroups': [
                {
                    'OutputGroupSettings': {
                        'FileGroupSettings': {
                            'Destination': f's3://{bucket_name}/videos/{uuid}/FHD/{section_index}-FHD'
                        }
                    }
                }
            ]
        },
        UserMetadata={
            'Type': 'FHD',
            'UUID': uuid,
            'Index': section_index
        }
    )
    '''

    return video_dict

def lambda_handler(event, context):
    
    uuid = event['uuid'] 
    index = event['index']
    
    dynamodb = boto3.resource('dynamodb')
    eventbridge = boto3.client('events')
    raw_file_path = f's3://{bucket_name}/videos/{uuid}/RAW.mp4'
    
    shorts_table = dynamodb.Table(highlight_table)

    response = shorts_table.get_item(
        Key={
            'VideoName': uuid,
            'Index': index
        }
    )

    item = response.get('Item', None)
    if not item:
        raise ValueError("Item not found in DynamoDB")

    highlight_script = item.get("Text", "")
    higlight_hook = item.get("Question", "")
    
    words_with_timestamp = extract_scripts_with_timestamps(uuid)
    timeframe = find_timeframes_for_script(highlight_script, words_with_timestamp)
    video_dict = {}
    output_destination = f's3://{bucket_name}/videos/{uuid}/FHD/{index}-FHD' 
    
    print(highlight_script)
    print(timeframe)
    
    if float(timeframe[0]) < 0.0 or float(timeframe[1]) < 0.0 :
        
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
    
    else:
        video_dict = create_new_video(uuid, index, timeframe)
        duration = video_dict["duration"]
        start_timecode = video_dict["start_time_convert"]
        end_timecode = video_dict["end_time_convert"]
    
        shorts_table.update_item(
            Key={
                'VideoName': uuid,
                'Index': index
            },
            UpdateExpression='SET #dur = :durVal',
            ExpressionAttributeNames={
                '#dur': 'duration'  # Replace 'duration' with your attribute name
            },
            ExpressionAttributeValues={
                ':durVal': duration
            }
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
 