import json
import boto3
from PIL import Image, ImageFont, ImageDraw
from io import BytesIO

s3 = boto3.client('s3')

def wrap_text(text, width, font):
    """Wrap text naturally without stretching"""
    lines = []
    words = text.split()
    current_line = []
    
    for word in words:
        current_line.append(word)
        test_line = ' '.join(current_line)
        bbox = font.getbbox(test_line)
        line_width = bbox[2] - bbox[0]
        
        if line_width > width:
            if len(current_line) > 1:
                current_line.pop()
                lines.append(' '.join(current_line))
                current_line = [word]
            else:
                lines.append(word)
                current_line = []
    
    if current_line:
        lines.append(' '.join(current_line))
    
    return lines

def load_font(font_path, size):
    try:
        font = ImageFont.truetype(font_path, size)
        return font
    except IOError:
        print("Failed to load the primary font. Falling back to secondary font.")
        return None

def get_text_dimensions(text, font):
    """Get the actual dimensions of the text without stretching"""
    bbox = font.getbbox(text)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]  # width, height

def lambda_handler(event, context):
    bucket_name = event["bucket_name"]   
    uuid = event['videoId']
    index = event['highlight']
    question = event['question']
    vertical = event['inputs'][0]['Vertical']
    
    image_width = 1080
    
    if vertical:
        source_key = 'assets/shorts-background-vertical.png'
        title_height = 240
        image_height = 1920
        initial_text_size = 60  # Start with larger size and scale down if needed
    else:
        source_key = 'assets/shorts-background-1x1.png'
        title_height = 420
        image_height = 1920
        initial_text_size = 84
    
    destination_dir = f'videos/{uuid}/background'
    
    # Load and resize base image
    response_image = s3.get_object(Bucket=bucket_name, Key=source_key)['Body'].read()
    base_image = Image.open(BytesIO(response_image))
    
    if base_image.size != (image_width, image_height):
        base_image = base_image.resize((image_width, image_height), Image.LANCZOS)
    
    draw = ImageDraw.Draw(base_image)
    
    # Text configuration
    font_path = './NotoSansKR-SemiBold.ttf'
    padding_x = 40  # Increased padding for better text layout
    padding_y = 20  # Small padding to prevent text from touching edges
    
    available_width = image_width - (2 * padding_x)
    available_height = title_height - (2 * padding_y)
    line_spacing = 8  # Slightly increased for better readability
    
    # Find appropriate font size that maintains proportion
    text_size = initial_text_size
    min_text_size = 40  # Increased minimum size for better readability
    
    while text_size >= min_text_size:
        font = load_font(font_path, text_size)
        if not font:
            break
            
        lines = wrap_text(question, available_width, font)
        
        if len(lines) > 2:
            text_size -= 2
            continue
            
        # Calculate total height including line spacing
        total_height = 0
        for line in lines:
            _, height = get_text_dimensions(line, font)
            total_height += height
        
        if len(lines) > 1:
            total_height += line_spacing * (len(lines) - 1)
            
        # Check if text fits in available height while maintaining proportion
        if total_height <= available_height:
            break
            
        text_size -= 2
    
    # Calculate vertical centering within title area
    total_height = 0
    line_heights = []
    for line in lines:
        _, height = get_text_dimensions(line, font)
        line_heights.append(height)
        total_height += height
    
    if len(lines) > 1:
        total_height += line_spacing * (len(lines) - 1)
        
    # Center text vertically in title area
    current_y = padding_y + (available_height - total_height) / 2
    
    # Draw text
    white = (255, 255, 255)
    
    for i, line in enumerate(lines):
        width, _ = get_text_dimensions(line, font)
        text_x = (image_width - width) / 2
        
        draw.text((text_x, current_y), line, font=font, fill=white)
        current_y += line_heights[i] + line_spacing
    
    # Save and upload
    buffer = BytesIO()
    base_image.save(buffer, format='png')
    buffer.seek(0)
    destination_key = f'{destination_dir}/{index}.png'
    s3.put_object(Bucket=bucket_name, Key=destination_key, Body=buffer, ContentType='image/png')
    
    return {
        'statusCode': 200,
        'body': json.dumps('Created Background Image')
    }