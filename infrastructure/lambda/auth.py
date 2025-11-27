import json
import boto3
import os
from datetime import datetime
from botocore.config import Config

# Ultra-optimized connection pooling
config = Config(
    max_pool_connections=200,  # Increase further
    retries={'max_attempts': 0},  # No retries for speed
    connect_timeout=3,  # Very short connection timeout
    read_timeout=8,     # Short read timeout
    region_name='ap-southeast-1',
    tcp_keepalive=True  # Keep connections alive
)

# Global clients - reused across invocations
dynamodb = boto3.resource('dynamodb', config=config)
cognito = boto3.client('cognito-idp', config=config)

def cors_response(status_code, body, content_type='application/json', cache_control=None):
    """Helper function to return response with CORS headers"""
    headers = {
        'Content-Type': content_type,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    }
    
    # Add cache control for cacheable responses
    if cache_control:
        headers['Cache-Control'] = cache_control
    
    return {
        'statusCode': status_code,
        'headers': headers,
        'body': json.dumps(body) if isinstance(body, dict) else body
    }

def handler(event, context):
    try:
        # Handle warming requests (skip processing)
        if event.get('isWarming'):
            return cors_response(200, {'status': 'warm'})
        
        # Debug: Print event to see structure
        print(f"Event: {json.dumps(event)}")
        
        path = event['path']
        method = event['httpMethod']
        body = event.get('body') or '{}'
        
        if method == 'POST':
            body = json.loads(body)
            if '/register' in path:
                return register(body)
            elif '/login' in path:
                return login(body)
        elif method == 'GET' and '/credits' in path:
            # For protected endpoints, API Gateway already validated the token
            # We can get user info from requestContext.authorizer.claims
            return get_credits(event)
            
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': str(e)})
        }

def get_credits(event):
    """Get user credits from Cognito authorizer claims"""
    try:
        # Get user info from Cognito authorizer claims
        claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
        print(f"Claims: {claims}")
        
        # Get user ID from claims (can be 'sub' or 'cognito:username')
        user_id = claims.get('sub') or claims.get('cognito:username')
        email = claims.get('email')
        name = claims.get('name', 'User')
        
        if not user_id:
            return cors_response(401, {'error': 'No user ID in token claims'})
        
        # Get user from DynamoDB using GSI for fast email lookup
        users_table = dynamodb.Table(os.environ['USERS_TABLE'])
        if email:
            # FAST: Use GSI query instead of slow table scan
            response = users_table.query(
                IndexName='EmailIndex',
                KeyConditionExpression='email = :email',
                ExpressionAttributeValues={':email': email}
            )
            
            if response['Items']:
                user = response['Items'][0]
                return cors_response(200, {
                    'userId': user['userId'],
                    'credits': int(user.get('credits', 0)),
                    'email': user.get('email', '')
                }, cache_control='public, max-age=300')  # 5 minute cache
            else:
                # Auto-create DynamoDB record for existing Cognito user
                print(f"Creating DynamoDB record for existing user: {email}")
                users_table.put_item(
                    Item={
                        'userId': user_id,
                        'email': email,
                        'name': name,
                        'credits': 10,
                        'createdAt': datetime.now().isoformat()
                    }
                )
                return cors_response(200, {
                    'userId': user_id,
                    'credits': 10,
                    'email': email
                }, cache_control='public, max-age=60')
        
        # Fallback: return default credits for authenticated user
        return cors_response(200, {
            'userId': user_id,
            'credits': 10,
            'email': email or ''
        })
        
    except Exception as e:
        print(f"Error getting credits: {str(e)}")
        return cors_response(500, {'error': str(e)})

def register(data):
    try:
        print(f"Starting registration for email: {data['email']}")
        
        email = data['email']
        password = data['password']
        name = data['name']
        
        user_id = f"user_{int(datetime.now().timestamp())}"
        print(f"Generated user_id: {user_id}")
        
        # Check if user already exists in Cognito
        try:
            cognito.admin_get_user(
                UserPoolId=os.environ['USER_POOL_ID'],
                Username=email
            )
            # User exists
            return cors_response(400, {'error': 'User already exists'})
        except Exception as e:
            # User doesn't exist (UserNotFoundException) or other error, proceed with registration
            if 'UserNotFoundException' not in str(e):
                print(f"Unexpected error checking user: {str(e)}")
            pass
        
        # Create in Cognito
        print("Creating user in Cognito...")
        cognito.admin_create_user(
            UserPoolId=os.environ['USER_POOL_ID'],
            Username=email,
            TemporaryPassword=password,
            MessageAction='SUPPRESS'
        )
        print("User created in Cognito successfully")
        
        # Set permanent password
        print("Setting permanent password...")
        cognito.admin_set_user_password(
            UserPoolId=os.environ['USER_POOL_ID'],
            Username=email,
            Password=password,
            Permanent=True
        )
        print("Password set successfully")
        
        # Store in DynamoDB
        print("Storing user in DynamoDB...")
        table = dynamodb.Table(os.environ['USERS_TABLE'])
        table.put_item(
            Item={
                'userId': user_id,
                'email': email,
                'name': name,
                'credits': 10,
                'createdAt': datetime.now().isoformat()
            }
        )
        print("User stored in DynamoDB successfully")
        
        return cors_response(201, {'message': 'User registered', 'userId': user_id})
        
    except Exception as e:
        print(f"Registration error: {str(e)}")
        return cors_response(500, {'error': str(e)})

def login(data):
    email = data['email']
    password = data['password']
    
    # Authenticate with Cognito
    auth_result = cognito.admin_initiate_auth(
        UserPoolId=os.environ['USER_POOL_ID'],
        ClientId=os.environ['USER_POOL_CLIENT_ID'],
        AuthFlow='ADMIN_NO_SRP_AUTH',
        AuthParameters={
            'USERNAME': email,
            'PASSWORD': password
        }
    )
    
    # FAST: Use GSI query instead of slow table scan
    table = dynamodb.Table(os.environ['USERS_TABLE'])
    response = table.query(
        IndexName='EmailIndex',
        KeyConditionExpression='email = :email',
        ExpressionAttributeValues={':email': email}
    )
    
    user = response['Items'][0]
    
    return cors_response(200, {
        'token': auth_result['AuthenticationResult']['IdToken'],
        'user': {
            'userId': user['userId'],
            'email': user['email'],
            'credits': int(user['credits'])
        }
    })


