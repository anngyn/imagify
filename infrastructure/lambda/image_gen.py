import json
import boto3
import base64
import os
import time
from datetime import datetime
from botocore.config import Config
from logger import log_api_call, log_image_generation, log_business_metric

# Connection pooling configuration
config = Config(
    max_pool_connections=50,
    retries={'max_attempts': 2, 'mode': 'adaptive'}
)

# Global clients - Cross-region setup
bedrock = boto3.client('bedrock-runtime', region_name='us-east-1', config=config)  # Bedrock models in US East
dynamodb = boto3.resource('dynamodb', region_name='ap-southeast-1', config=config)  # Data in Singapore
s3 = boto3.client('s3', region_name='ap-southeast-1', config=config)  # Storage in Singapore

def cors_response(status_code, body, content_type='application/json'):
    """Helper function to return response with CORS headers"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': content_type,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization'
        },
        'body': json.dumps(body) if isinstance(body, dict) else body
    }

def handler(event, context):
    start_time = time.time()
    user_id = None
    
    try:
        body = json.loads(event['body'])
        prompt = body['prompt']
        
        # Get user ID from Cognito authorizer claims
        claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
        user_id = claims.get('sub') or claims.get('cognito:username')
        email = claims.get('email')
        
        if not user_id:
            return cors_response(401, {'error': 'No user ID in token'})
        
        log_api_call('image_gen', user_id, 'generate_image_start', True)
        
        # Check user credits - lookup by email since userId format is different
        users_table = dynamodb.Table(os.environ['USERS_TABLE'])
        
        if email:
            # Find user by email
            user_response = users_table.scan(
                FilterExpression='email = :email',
                ExpressionAttributeValues={':email': email}
            )
            
            if not user_response['Items']:
                log_api_call('image_gen', user_id, 'user_not_found', False)
                return {
                    'statusCode': 404,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'User not found'})
                }
            
            user = user_response['Items'][0]
            db_user_id = user['userId']
        else:
            # Fallback: try direct lookup with Cognito user ID
            user_response = users_table.get_item(Key={'userId': user_id})
            if 'Item' not in user_response:
                log_api_call('image_gen', user_id, 'user_not_found', False)
                return {
                    'statusCode': 404,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'User not found'})
                }
            user = user_response['Item']
            db_user_id = user_id
        
        if int(user['credits']) < 1:
            log_api_call('image_gen', user_id, 'insufficient_credits', False)
            return {
                'statusCode': 400,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Insufficient credits'})
            }
        
        # Generate image with Bedrock Titan Image Generator
        bedrock_start = time.time()
        response = bedrock.invoke_model(
            modelId='amazon.titan-image-generator-v1',
            body=json.dumps({
                'taskType': 'TEXT_IMAGE',
                'textToImageParams': {
                    'text': prompt
                },
                'imageGenerationConfig': {
                    'numberOfImages': 1,
                    'height': 1024,
                    'width': 1024,
                    'cfgScale': 8.0
                }
            })
        )
        bedrock_duration = (time.time() - bedrock_start) * 1000
        
        result = json.loads(response['body'].read())
        image_data = result['images'][0]
        
        # Upload to S3
        image_id = f"img_{int(datetime.now().timestamp())}"
        s3_key = f"images/{db_user_id}/{image_id}.png"
        
        s3.put_object(
            Bucket=os.environ['IMAGES_BUCKET'],
            Key=s3_key,
            Body=base64.b64decode(image_data),
            ContentType='image/png'
        )
        
        image_url = f"https://{os.environ['IMAGES_BUCKET']}.s3.amazonaws.com/{s3_key}"
        
        # Save to DynamoDB
        images_table = dynamodb.Table(os.environ['IMAGES_TABLE'])
        images_table.put_item(
            Item={
                'imageId': image_id,
                'userId': db_user_id,
                'prompt': prompt,
                'imageUrl': image_url,
                'createdAt': datetime.now().isoformat()
            }
        )
        
        # Deduct credits
        users_table.update_item(
            Key={'userId': db_user_id},
            UpdateExpression='SET credits = credits - :dec',
            ExpressionAttributeValues={':dec': 1}
        )
        
        # Log successful generation
        total_duration = (time.time() - start_time) * 1000
        log_image_generation(user_id, prompt, True, 0.04, total_duration)  # $0.04 per image
        log_business_metric('BedrockDuration', bedrock_duration, 'Milliseconds', user_id)
        
        log_api_call('image_gen', user_id, 'generate_image_success', True, total_duration)
        
        return cors_response(200, {
            'imageId': image_id,
            'imageUrl': image_url,
            'remainingCredits': int(user['credits']) - 1
        })
        
    except Exception as e:
        duration = (time.time() - start_time) * 1000
        log_api_call('image_gen', user_id, 'generate_image_error', False, duration, e)
        log_image_generation(user_id, prompt if 'prompt' in locals() else 'unknown', False)
        
        return cors_response(500, {'error': str(e)})
