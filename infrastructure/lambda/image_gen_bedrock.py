import json
import boto3
import base64
import uuid
from datetime import datetime
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients - Use US East for Bedrock image models
bedrock_runtime = boto3.client('bedrock-runtime', region_name='us-east-1')
s3_client = boto3.client('s3', region_name='ap-southeast-1')
dynamodb = boto3.resource('dynamodb')

# Environment variables
IMAGES_TABLE = 'imagify-images'
USERS_TABLE = 'imagify-users'
S3_BUCKET = 'imagify-images-prod'

def lambda_handler(event, context):
    """
    AWS Lambda handler for image generation using Bedrock
    """
    try:
        # Parse request
        body = json.loads(event['body'])
        prompt = body.get('prompt', '')
        user_id = event['requestContext']['authorizer']['userId']
        
        if not prompt:
            return {
                'statusCode': 400,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                'body': json.dumps({'error': 'Prompt is required'})
            }
        
        # Check user credits
        user_credits = get_user_credits(user_id)
        if user_credits < 1:
            return {
                'statusCode': 402,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                'body': json.dumps({'error': 'Insufficient credits'})
            }
        
        # Generate image using Bedrock
        image_data = generate_image_with_bedrock(prompt)
        
        # Upload to S3
        image_url = upload_to_s3(image_data, user_id)
        
        # Update user credits and save image metadata
        update_user_credits(user_id, user_credits - 1)
        save_image_metadata(user_id, prompt, image_url)
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            'body': json.dumps({
                'success': True,
                'imageUrl': image_url,
                'creditsRemaining': user_credits - 1
            })
        }
        
    except Exception as e:
        logger.error(f"Error generating image: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            'body': json.dumps({'error': 'Internal server error'})
        }

def generate_image_with_bedrock(prompt):
    """
    Generate image using AWS Bedrock Titan Image Generator
    """
    try:
        # Prepare request for Bedrock Titan Image Generator
        request_body = {
            "taskType": "TEXT_IMAGE",
            "textToImageParams": {
                "text": prompt,
                "negativeText": "blurry, low quality, distorted",
            },
            "imageGenerationConfig": {
                "numberOfImages": 1,
                "height": 1024,
                "width": 1024,
                "cfgScale": 8.0,
                "seed": 42
            }
        }
        
        # Alternative: Use Stability AI SDXL model
        # model_id = "stability.stable-diffusion-xl-v1"
        # request_body = {
        #     "text_prompts": [{"text": prompt}],
        #     "cfg_scale": 10,
        #     "seed": 0,
        #     "steps": 50,
        #     "width": 1024,
        #     "height": 1024
        # }
        
        # Call Bedrock
        model_id = "amazon.titan-image-generator-v2:0"
        response = bedrock_runtime.invoke_model(
            modelId=model_id,
            body=json.dumps(request_body),
            contentType='application/json',
            accept='application/json'
        )
        
        # Parse response
        response_body = json.loads(response['body'].read())
        
        # Extract base64 image data
        if 'images' in response_body:
            image_base64 = response_body['images'][0]
            return base64.b64decode(image_base64)
        else:
            raise Exception("No image data in Bedrock response")
            
    except Exception as e:
        logger.error(f"Bedrock image generation failed: {str(e)}")
        raise

def upload_to_s3(image_data, user_id):
    """
    Upload generated image to S3 bucket
    """
    try:
        # Generate unique filename
        image_id = str(uuid.uuid4())
        filename = f"images/{user_id}/{image_id}.png"
        
        # Upload to S3
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=filename,
            Body=image_data,
            ContentType='image/png',
            ACL='public-read'
        )
        
        # Return public URL
        image_url = f"https://{S3_BUCKET}.s3.amazonaws.com/{filename}"
        return image_url
        
    except Exception as e:
        logger.error(f"S3 upload failed: {str(e)}")
        raise

def get_user_credits(user_id):
    """
    Get user's current credit balance from DynamoDB
    """
    try:
        table = dynamodb.Table(USERS_TABLE)
        response = table.get_item(Key={'userId': user_id})
        
        if 'Item' in response:
            return response['Item'].get('credits', 0)
        else:
            return 0
            
    except Exception as e:
        logger.error(f"Failed to get user credits: {str(e)}")
        return 0

def update_user_credits(user_id, new_credits):
    """
    Update user's credit balance in DynamoDB
    """
    try:
        table = dynamodb.Table(USERS_TABLE)
        table.update_item(
            Key={'userId': user_id},
            UpdateExpression='SET credits = :credits, updatedAt = :timestamp',
            ExpressionAttributeValues={
                ':credits': new_credits,
                ':timestamp': datetime.utcnow().isoformat()
            }
        )
        
    except Exception as e:
        logger.error(f"Failed to update user credits: {str(e)}")
        raise

def save_image_metadata(user_id, prompt, image_url):
    """
    Save image generation metadata to DynamoDB
    """
    try:
        table = dynamodb.Table(IMAGES_TABLE)
        image_id = str(uuid.uuid4())
        
        table.put_item(
            Item={
                'imageId': image_id,
                'userId': user_id,
                'prompt': prompt,
                'imageUrl': image_url,
                'creditsUsed': 1,
                'createdAt': datetime.utcnow().isoformat(),
                'model': 'amazon.titan-image-generator-v1 (US East)'
            }
        )
        
    except Exception as e:
        logger.error(f"Failed to save image metadata: {str(e)}")
        # Don't raise - this is not critical for user experience
