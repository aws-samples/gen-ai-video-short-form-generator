import json
import boto3
from PIL import Image, ImageFont, ImageDraw
from io import BytesIO

s3 = boto3.client('s3')

def wrap_text(text, width, font):
    text_lines = []
    text_line = []
    text = text.replace('\n', ' [br] ')
    words = text.split()

    for word in words:
        if word == '[br]':
            text_lines.append(' '.join(text_line))
            text_line = []
            continue
        text_line.append(word)
        left, _, right, _ = font.getbbox(' '.join(text_line))
        w = right - left
        if w > width:
            text_line.pop()
            text_lines.append(' '.join(text_line))
            text_line = [word]

    if text_line:
        text_lines.append(' '.join(text_line))

    return text_lines

def adjust_font_size(question, width, initial_font_size, font_path):
    font_size = initial_font_size
    font = load_font(font_path, font_size)
    lines = wrap_text(question, width, font)
    while len(lines) > 2:
        font_size -= 1
        font = load_font(font_path, font_size)
        lines = wrap_text(question, width, font)
    return font, lines

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
    
    font_path = './NotoSansKR-Regular.ttf'
    text_size = 70
    
    font_square, multiline_square = adjust_font_size(question, 900, text_size, font_path)
    
    W = 1080
    H = 1920
    white = (255, 255, 255)
    
    text_y_square = (H - len(multiline_square) * font_square.size) / 2 - 720

    for line in multiline_square:
        w = draw_square.textlength(line, font=font_square)
        text_x = (W - w) / 2
        draw_square.text((text_x, text_y_square), text=line, font=font_square, fill=white)
        text_y_square += font_square.size + 10
    
    buffer_square = BytesIO()
    base_image_square.save(buffer_square, format='png')
    buffer_square.seek(0)
    destination_key_square = f'{destination_dir}/{index}-square.png'
    s3.put_object(Bucket=bucket_name, Key=destination_key_square, Body=buffer_square, ContentType='image/png')
    
    return {
        'statusCode': 200,
        'body': json.dumps('Created Background Image')
    }