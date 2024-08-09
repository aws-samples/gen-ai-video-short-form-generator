import json
import boto3
from PIL import Image, ImageFont, ImageDraw
from io import BytesIO

s3 = boto3.client('s3')

def wrap_text(text, width, font):
    lines = []
    paragraphs = text.split('\\n')  # Split by literal '\n'
    for paragraph in paragraphs:
        words = paragraph.split()
        current_line = []
        for word in words:
            current_line.append(word)
            left, _, right, _ = font.getbbox(' '.join(current_line))
            if right - left > width:
                if len(current_line) > 1:
                    current_line.pop()
                    lines.append(' '.join(current_line))
                    current_line = [word]
                else:
                    lines.append(word)
                    current_line = []
        if current_line:
            lines.append(' '.join(current_line))
        if not paragraph:  # Add empty line for empty paragraphs
            lines.append('')
    return lines

def load_font(font_path, size):
    try:
        font = ImageFont.truetype(font_path, size)
        return font
    except IOError:
        print("Failed to load the primary font. Falling back to secondary font.")
        return None

def lambda_handler(event, context):
    square_source_key = 'assets/shorts-background-1x1.png'
    bucket_name = event["bucket_name"]   
    uuid = event['videoId']
    index = event['highlight']
    question = event['question']
    
    destination_dir = f'videos/{uuid}/background'
    
    square_response_image = s3.get_object(Bucket=bucket_name, Key=square_source_key)['Body'].read()
    
    base_image_square = Image.open(BytesIO(square_response_image))
    
    draw_square = ImageDraw.Draw(base_image_square)
    
    font_path = './NotoSansKR-SemiBold.ttf'
    text_size = 80  # You can adjust this size as needed
    
    font_square = load_font(font_path, text_size)
    multiline_square = wrap_text(question, 1020, font_square)
    
    # Debug print
    print("Parsed lines:", multiline_square)
    
    W = 1080
    H = 1920
    white = (255, 255, 255)
    
    # Calculate the total height of all lines
    total_text_height = sum([font_square.getbbox(line)[3] - font_square.getbbox(line)[1] for line in multiline_square])
    line_spacing = 10  # Adjust this value to increase or decrease space between lines
    total_text_height += line_spacing * (len(multiline_square) - 1)
    
    # Start drawing from this y-position
    text_y_square = (H - total_text_height) / 2 - 720
    
    for line in multiline_square:
        bbox = font_square.getbbox(line)
        line_width = bbox[2] - bbox[0]
        line_height = bbox[3] - bbox[1]
        
        text_x = (W - line_width) / 2
        draw_square.text((text_x, text_y_square), text=line, font=font_square, fill=white)
        text_y_square += line_height + line_spacing
    
    buffer_square = BytesIO()
    base_image_square.save(buffer_square, format='png')
    buffer_square.seek(0)
    destination_key_square = f'{destination_dir}/{index}-square.png'
    s3.put_object(Bucket=bucket_name, Key=destination_key_square, Body=buffer_square, ContentType='image/png')
    
    return {
        'statusCode': 200,
        'body': json.dumps('Created Background Image')
    }