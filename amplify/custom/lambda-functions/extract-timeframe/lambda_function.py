import boto3
import json
import os
import logging
from datetime import datetime
import difflib

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.DEBUG)  # Set to DEBUG for more detailed logfs

# Initialize AWS clients
s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

# Get environment variables
BUCKET_NAME = os.environ["BUCKET_NAME"]
HIGHLIGHT_TABLE_NAME = os.environ["HIGHLIGHT_TABLE_NAME"]

import difflib

def string_similarity(s1, s2):
    # Keep spaces, only lowercase
    s1 = s1.lower().strip()
    s2 = s2.lower().strip()
    
    # Use more sophisticated tokenization
    words1 = s1.split()
    words2 = s2.split()
    
    # Use sequence matcher on words
    matcher = difflib.SequenceMatcher(None, words1, words2)
    return matcher.ratio()

def extract_full_transcript(json_content):
    return " ".join([item['alternatives'][0]['content'] for item in json_content['results']['items'] if item['type'] == 'pronunciation'])

def extract_words_with_timestamp(json_content):
    return json_content['results']['items']

def find_timeframes_for_script(highlight_script, json_content):
    logger.debug("Starting find_timeframes_for_script")
    logger.debug(f"Input highlight script: {highlight_script}")
    
    words_with_timestamp = json_content['results']['items']
    logger.debug(f"Total words in transcript: {len(words_with_timestamp)}")
    
    segments = [seg.strip() for seg in highlight_script.split("[...]") if seg.strip()]
    logger.debug(f"Split segments: {segments}")
    logger.debug(f"Number of segments: {len(segments)}")
    
    timeframes = []

    for i, segment in enumerate(segments):
        logger.debug(f"\nProcessing segment {i+1}/{len(segments)}: {segment}")
        cleaned_segment = segment.lower()
        best_match_ratio = 0
        best_match_start = 0
        best_match_end = 0
        best_matching_window = ""

        # Calculate window size and convert to integer
        base_window_size = len(cleaned_segment.split())
        window_size = min(int(base_window_size * 1.4), len(words_with_timestamp))
        logger.debug(f"Base window size: {base_window_size}, Adjusted window size: {window_size}")

        for j in range(len(words_with_timestamp)):
            # Ensure we don't exceed array bounds
            current_window_size = min(window_size, len(words_with_timestamp) - j)
            
            window = ' '.join(item['alternatives'][0]['content'] 
                            for item in words_with_timestamp[j:j+current_window_size] 
                            if item['type'] == 'pronunciation')
            
            match_ratio = string_similarity(cleaned_segment, window)
            
            if match_ratio > best_match_ratio:
                best_match_ratio = match_ratio
                best_match_start = j
                best_match_end = j + current_window_size
                best_matching_window = window
                logger.debug(f"New best match found at position {j}:")
                logger.debug(f"Window: {window}")
                logger.debug(f"Match ratio: {match_ratio}")

        logger.debug(f"\nFinal best match for segment {i+1}:")
        logger.debug(f"Original segment: {cleaned_segment}")
        logger.debug(f"Best matching window: {best_matching_window}")
        logger.debug(f"Best match ratio: {best_match_ratio}")
        logger.debug(f"Best match indices: {best_match_start} to {best_match_end}")

        if best_match_ratio > 0.70:
            start_index = best_match_start
            end_index = best_match_end - 1 

            # Debug original indices
            logger.debug(f"Initial indices - start: {start_index}, end: {end_index}")

            while start_index < end_index and words_with_timestamp[start_index]['type'] != 'pronunciation':
                start_index += 1
                logger.debug(f"Adjusted start index to: {start_index}")
            
            while end_index > start_index and words_with_timestamp[end_index]['type'] != 'pronunciation':
                end_index -= 1
                logger.debug(f"Adjusted end index to: {end_index}")
            
            start_time = float(words_with_timestamp[start_index]['start_time'])
            end_time = float(words_with_timestamp[end_index]['end_time'])
            
            timeframes.append((start_time, end_time, i))
            
            logger.debug(f"Final timeframe for segment {i+1}:")
            logger.debug(f"Start time: {start_time}")
            logger.debug(f"End time: {end_time}")
            logger.debug(f"Start word: {words_with_timestamp[start_index]['alternatives'][0]['content']}")
            logger.debug(f"End word: {words_with_timestamp[end_index]['alternatives'][0]['content']}")
        else:
            logger.warning(f"No good match found for segment {i+1}")
            logger.warning(f"Segment text: {cleaned_segment}")
            logger.warning(f"Best match ratio found: {best_match_ratio}")
            logger.warning(f"Best matching window: {best_matching_window}")

    logger.debug("\nAll timeframes before sorting:")
    logger.debug(timeframes)

    # Sort timeframes based on start time
    sorted_timeframes = sorted(timeframes, key=lambda x: (x[0]))
    logger.debug("\nSorted timeframes:")
    logger.debug(sorted_timeframes)

    merged_timeframes = []
    for start, end, index in sorted_timeframes:
        if not merged_timeframes or start > merged_timeframes[-1][1]:
            merged_timeframes.append([start, end, index])
            logger.debug(f"Added new timeframe: {[start, end, index]}")
        else:
            merged_timeframes[-1][1] = max(merged_timeframes[-1][1], end)
            merged_timeframes[-1][2] = min(merged_timeframes[-1][2], index)
            logger.debug(f"Merged with previous timeframe: {merged_timeframes[-1]}")

    logger.debug("\nMerged timeframes:")
    logger.debug(merged_timeframes)

    # Check ordering
    if [t[2] for t in merged_timeframes] != sorted([t[2] for t in merged_timeframes]):
        logger.warning("WARNING: Final timeframes are not in original segment order")
        logger.warning(f"Original order indices: {[t[2] for t in merged_timeframes]}")
        logger.warning(f"Sorted order indices: {sorted([t[2] for t in merged_timeframes])}")

    # Remove the segment index from the final output
    final_timeframes = [(start, end) for start, end, _ in merged_timeframes]
    logger.debug("\nFinal output timeframes:")
    logger.debug(final_timeframes)

    return final_timeframes

def preprocess_text(text):
    return ' '.join(text.lower().split())

def extract_scripts_with_timestamps(uuid):
    try:
        json_object = s3.get_object(Bucket=BUCKET_NAME, Key=f'videos/{uuid}/Transcript.json')
        json_content = json.load(json_object['Body'])
        return json_content
    except KeyError as e:
        logger.error(f"Unexpected JSON structure in transcript for UUID {uuid}: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Error extracting scripts with timestamps for UUID {uuid}: {str(e)}")
        raise

def convert_seconds_to_timecode(seconds):
    seconds = float(seconds)
    hours, seconds = divmod(seconds, 3600)
    minutes, seconds = divmod(seconds, 60)
    frames = int((seconds - int(seconds)) * 25)  # Assuming 25 fps
    return "{:02d}:{:02d}:{:02d}:{:02d}".format(int(hours), int(minutes), int(seconds), frames)

def preprocess_highlight_script(highlight_script):
    highlight_script = ' '.join(highlight_script.split())
    highlight_script = highlight_script.replace('[...]', ' [...] ')
    chunks = [chunk.strip() for chunk in highlight_script.split("[...]") if chunk.strip()]
    return " [...] ".join(chunks)

def lambda_handler(event, context):
    try:
        uuid = event['uuid']
        index = str(event['index'])
        
        logger.info(f"Processing request for UUID: {uuid}, Index: {index}")

        shorts_table = dynamodb.Table(HIGHLIGHT_TABLE_NAME)

        raw_file_path = f's3://{BUCKET_NAME}/videos/{uuid}/RAW.mp4'
        output_destination = f's3://{BUCKET_NAME}/videos/{uuid}/FHD/{index}-FHD'

        response = shorts_table.get_item(Key={'VideoName': uuid, 'Index': index})
        item = response.get('Item')
        if not item:
            logger.error(f"Item not found in DynamoDB for UUID: {uuid}, Index: {index}")
            raise ValueError("Item not found in DynamoDB")

        highlight_script = preprocess_highlight_script(item.get("Text", ""))
        logger.debug(f"Preprocessed highlight script: {highlight_script}")

        json_content = extract_scripts_with_timestamps(uuid)
        logger.debug(f"Extracted transcript content for UUID: {uuid}")

        timeframes = find_timeframes_for_script(highlight_script, json_content)
        logger.info(f"Found {len(timeframes)} timeframes for UUID: {uuid}, Index: {index}")
        
        if not timeframes:
            logger.warning(f"No timeframes found for UUID: {uuid}, Index: {index}")
            return {
                'statusCode': 400,
                'body': 'Error on extracting timeframe',
                'success': 'false',
                'index': index,
                'duration': 0,
                'timeframes': [],
                'raw_file_path': raw_file_path,
                'output_destination': output_destination, 
                'uuid': uuid
            }
        
        total_duration = int((sum(end - start for start, end in timeframes)))
        
        formatted_timeframes = [
            {
                "StartTimecode": convert_seconds_to_timecode(start),
                "EndTimecode": convert_seconds_to_timecode(end)
            }
            for start, end in timeframes
        ]

        logger.info(f"Formatted timeframes for UUID: {uuid}, Index: {index}: {formatted_timeframes}, Duration: {total_duration}")

        shorts_table.update_item(
            Key={'VideoName': uuid, 'Index': index},
            UpdateExpression='SET #dur = :durVal, #tf = :tfVal',
            ExpressionAttributeNames={'#dur': 'duration', '#tf': 'timeframes'},
            ExpressionAttributeValues={':durVal': total_duration, ':tfVal': str(formatted_timeframes)}
        )

        logger.info(f"Successfully processed request for UUID: {uuid}, Index: {index}")

        return {
            'statusCode': 200,
            'body': 'Extracted Timeline',
            'success': 'true',
            'index': index,
            'duration': total_duration,
            'uuid': uuid,
            'timeframes': formatted_timeframes,
            'output_destination': output_destination,
            'raw_file_path': raw_file_path
        }

    except Exception as e:
        logger.error(f"An error occurred for UUID: {uuid if 'uuid' in locals() else 'unknown'}, Index: {index if 'index' in locals() else 'unknown'}: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'body': f'Error processing request: {str(e)}',
            'success': 'false',
            'index': index if 'index' in locals() else 'unknown',
            'uuid': uuid if 'uuid' in locals() else 'unknown',
            'duration': 0,
            'timeframes': [],
            'output_destination': output_destination,
            'raw_file_path': raw_file_path
        }