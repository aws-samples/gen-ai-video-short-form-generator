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

def normalize_text(text):
    """Normalize both Korean and English text"""
    import re
    
    # Remove punctuation and special characters, but keep spaces for English
    text = re.sub(r'[^\w\s]', '', text)
    
    # Convert to lowercase
    text = text.lower()
    
    # Normalize spaces (remove multiple spaces)
    text = ' '.join(text.split())
    
    # Handle special cases like numbers and common variations
    text = re.sub(r'(\d),(\d)', r'\1\2', text)  # "1,000" -> "1000"
    
    logger.debug(f"Normalized text: '{text}' from original: '{text}'")
    return text


def string_similarity(s1, s2):
    """Compare texts with normalization for both Korean and English"""
    # Normalize both strings
    s1_norm = normalize_text(s1)
    s2_norm = normalize_text(s2)
    
    # Calculate character-based similarity
    char_matcher = difflib.SequenceMatcher(None, s1_norm, s2_norm)
    char_ratio = char_matcher.ratio()
    
    # Calculate word-based similarity
    words1 = s1_norm.split()
    words2 = s2_norm.split()
    word_matcher = difflib.SequenceMatcher(None, words1, words2)
    word_ratio = word_matcher.ratio()
    
    # Use the average of both ratios
    ratio = (char_ratio + word_ratio) / 2
    
    logger.debug(f"Comparing:")
    logger.debug(f"Original 1: {s1}")
    logger.debug(f"Original 2: {s2}")
    logger.debug(f"Normalized 1: {s1_norm}")
    logger.debug(f"Normalized 2: {s2_norm}")
    logger.debug(f"Character similarity: {char_ratio}")
    logger.debug(f"Word similarity: {word_ratio}")
    logger.debug(f"Final ratio: {ratio}")
    
    return ratio

def extract_full_transcript(json_content):
    return " ".join([item['alternatives'][0]['content'] for item in json_content['results']['items'] if item['type'] == 'pronunciation'])

def extract_words_with_timestamp(json_content):
    return json_content['results']['items']

def find_timeframes_for_script(highlight_script, json_content):
    words_with_timestamp = json_content['results']['items']
    segments = [seg.strip() for seg in highlight_script.split("[...]") if seg.strip()]
    timeframes = []

    for i, segment in enumerate(segments):
        cleaned_segment = segment
        best_match_ratio = 0
        best_match_start = 0
        best_match_end = 0
        best_matching_window = ""

        target_word_count = len(cleaned_segment.split())
        
        # Try different window sizes around our target
        window_sizes = [
            target_word_count,
            target_word_count + 2,
            target_word_count - 1
        ]
        
        logger.debug(f"\nProcessing segment {i+1}: {cleaned_segment}")
        logger.debug(f"Target word count: {target_word_count}")

        for window_size in window_sizes:
            if window_size < 1:
                continue
                
            for j in range(len(words_with_timestamp)):
                # Collect words until we have enough pronunciation items
                current_words = []
                pronunciation_count = 0
                k = j
                
                while (k < len(words_with_timestamp) and 
                       pronunciation_count < window_size):
                    word_item = words_with_timestamp[k]
                    if word_item['type'] == 'pronunciation':
                        current_words.append(word_item)
                        pronunciation_count += 1
                    k += 1
                
                if pronunciation_count < window_size * 0.8:  # Need most of our words
                    continue

                window = ' '.join(word['alternatives'][0]['content'] 
                                for word in current_words)
                
                match_ratio = string_similarity(cleaned_segment, window)
                
                if match_ratio > best_match_ratio:
                    best_match_ratio = match_ratio
                    best_match_start = j
                    best_match_end = k - 1
                    best_matching_window = window
                    logger.debug(f"New best match found:")
                    logger.debug(f"Window: {window}")
                    logger.debug(f"Match ratio: {match_ratio}")

        logger.debug(f"Final best match:")
        logger.debug(f"Ratio: {best_match_ratio}")
        logger.debug(f"Window: {best_matching_window}")

        # Slightly lower threshold since we're being more strict with matching
        if best_match_ratio > 0.65:
            # Find the exact start and end points
            while (best_match_start < best_match_end and 
                   words_with_timestamp[best_match_start]['type'] != 'pronunciation'):
                best_match_start += 1
                
            while (best_match_end > best_match_start and 
                   words_with_timestamp[best_match_end]['type'] != 'pronunciation'):
                best_match_end -= 1
            
            start_time = float(words_with_timestamp[best_match_start]['start_time'])
            end_time = float(words_with_timestamp[best_match_end]['end_time'])
            
            timeframes.append((start_time, end_time, i))
            
            logger.debug(f"Found timeframe: {start_time} - {end_time}")
            logger.debug(f"Start word: {words_with_timestamp[best_match_start]['alternatives'][0]['content']}")
            logger.debug(f"End word: {words_with_timestamp[best_match_end]['alternatives'][0]['content']}")
        else:
            logger.warning(f"No good match found for: {cleaned_segment}")

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