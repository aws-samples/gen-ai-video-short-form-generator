from datetime import datetime
import json

def convert_seconds_to_timecode(seconds):
    seconds = float(seconds)
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    remaining_seconds = int(seconds % 60)
    frames = int((seconds - int(seconds)) * 25)  # Assuming 25 frames per second, adjust if needed

    return "{:02d}:{:02d}:{:02d}:{:02d}".format(hours, minutes, remaining_seconds, frames)
    
def convert_timecode_to_seconds(timecode):
    """Convert a timecode string to total seconds."""
    hours, minutes, seconds, frames = map(int, timecode.split(':'))
    return hours * 3600 + minutes * 60 + seconds + frames / 25.0

def create_new_video(uuid, index, bucket_name, sections):
    
    input_file = f'videos/{uuid}/FHD/{index}-FHD.mp4'
    subtitle = f'videos/{uuid}/ShortsTranscript/{index}-TranscriptShorts.vtt'
    output_location = f'videos/{uuid}/Final'
    
    InputsTemplates = []

    start_time = 0.0  # Start at the very beginning
    buffer_time = 0
    sections_total_duration = 0.0
    
    for i, section in enumerate(sections):
        section_duration = float(section["SectionDuration"])
        end_time = start_time + section_duration
        sections_total_duration += section_duration
        
        start_timecode = convert_seconds_to_timecode(start_time)
        end_timecode = convert_seconds_to_timecode(end_time)

        details = {
            "VideoSelector": {
                "PadVideo": "BLACK"
            },
            'FileInput': f's3://{bucket_name}/{input_file}',
            'InputClippings': [
                {
                    'StartTimecode': start_timecode,
                    'EndTimecode': end_timecode
                }
            ],
            'Crop': {
                'Height': int(section["CropHeight"]),
                'Width': int(section["CropWidth"]),
                'X': int(section["Xoffset"]),
                'Y': int(section["Yoffset"])
            },
            "Position": {
                "Height": 1080,
                "Width": 1080,
                "X": 0,
                "Y": 420
            },
            "AudioSelectors": {
                "Audio Selector 1": {
                    "DefaultSelection": "DEFAULT"
                }
            },
            "CaptionSelectors": {
                "Caption Selector 1": {
                    "SourceSettings": {
                        "SourceType": "WEBVTT",
                        "FileSourceSettings": {
                            "SourceFile": f's3://{bucket_name}/{subtitle}'
                        }
                    }
                }
            },
            'TimecodeSource': 'ZEROBASED'
        }
        InputsTemplates.append(details)
        
        start_time = end_time + (buffer_time if i < len(sections) - 1 else 0)  # Move to the next clip start
    
    # Calculate the total duration of sections in milliseconds
    sections_duration_ms = int(sections_total_duration * 1000 + 40 * (len(sections)-1))

    background_file_square = f's3://{bucket_name}/videos/{uuid}/background/{index}-square.png'
    
    OutputTemplate = [
        {
            'OutputGroupSettings': {
                'FileGroupSettings': {
                    'Destination': f's3://{bucket_name}/{output_location}/{index}-square-final'
                },
                "Type": "FILE_GROUP_SETTINGS"
            },
            'Outputs': [
                {
                    "ContainerSettings": {
                        "Container": "MP4",
                        "Mp4Settings": {}
                    },
                    'VideoDescription': {
                        "Width": 1080,
                        "Height": 1920,
                        "ScalingBehavior": "FILL",
                        "CodecSettings": {
                            "Codec": "H_264",
                            "H264Settings": {
                                "MaxBitrate": 5000000,
                                "RateControlMode": "QVBR",
                                "SceneChangeDetect": "TRANSITION_DETECTION"
                            }
                        },
                        'VideoPreprocessors': {
                            'ImageInserter': {
                                'InsertableImages': [
                                    {
                                        'Width': 1080,
                                        'Height': 1920,
                                        'Opacity': 100,
                                        'ImageInserterInput': background_file_square,
                                        'ImageX': 0,
                                        'ImageY': 0,
                                        'Layer': 1,
                                        'Duration': sections_duration_ms
                                    }
                                ]
                            }
                        }
                    },
                    'AudioDescriptions': [
                        {
                            "AudioSourceName": "Audio Selector 1",
                            "CodecSettings": {
                                "Codec": "AAC",
                                "AacSettings": {
                                    "Bitrate": 96000,
                                    "CodingMode": "CODING_MODE_2_0",
                                    "SampleRate": 48000
                                }
                            },
                            'AudioTypeControl': 'FOLLOW_INPUT'
                        }
                    ],
                    'CaptionDescriptions':[
                        {
                            "CaptionSelectorName": "Caption Selector 1",
                            "DestinationSettings": {
                                "DestinationType": 'BURN_IN',
                                "BurninDestinationSettings": {
                                    'Alignment': 'CENTERED',
                                    'BackgroundColor': 'BLACK',
                                    'BackgroundOpacity': 80,
                                    'FontColor': 'WHITE',
                                    'FontOpacity': 255,
                                    'FontScript': 'AUTOMATIC',
                                    'FontSize': 36,
                                    'TeletextSpacing': 'PROPORTIONAL',
                                    'YPosition': 1550
                                }
                            },
                            "LanguageCode": 'KOR'
                        }
                    ]
                },
            ]
        }
    ]
    
    return InputsTemplates, OutputTemplate

# Lambda handler function
def lambda_handler(event, context):
    
    bucket_name = event["bucket_name"]
    sections = event["inputs"]
    uuid = event['videoId']
    index = event['highlight']
    
    inputTemplate, outputTemplate = create_new_video(uuid, index, bucket_name, sections)
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'inputTemplate': inputTemplate,
            'outputTemplate': outputTemplate
        })
    }
