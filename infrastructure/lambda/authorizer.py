import json
import jwt
import os
from jwt import PyJWKClient

def handler(event, context):
    """Lambda authorizer for API Gateway"""
    try:
        # Get token from Authorization header
        token = event['authorizationToken']
        
        # Remove 'Bearer ' prefix if present
        if token.startswith('Bearer '):
            token = token[7:]
        
        # Cognito User Pool configuration
        user_pool_id = os.environ['USER_POOL_ID']
        region = 'ap-southeast-1'
        
        # Get JWT keys from Cognito
        jwks_url = f'https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json'
        jwks_client = PyJWKClient(jwks_url)
        
        # Decode and verify token
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        decoded_token = jwt.decode(
            token,
            signing_key.key,
            algorithms=['RS256'],
            audience=os.environ['USER_POOL_CLIENT_ID']
        )
        
        # Extract user info
        user_id = decoded_token.get('username', decoded_token.get('sub'))
        
        # Generate policy
        policy = {
            'principalId': user_id,
            'policyDocument': {
                'Version': '2012-10-17',
                'Statement': [
                    {
                        'Action': 'execute-api:Invoke',
                        'Effect': 'Allow',
                        'Resource': event['methodArn']
                    }
                ]
            },
            'context': {
                'userId': user_id,
                'email': decoded_token.get('email', ''),
                'token': token
            }
        }
        
        return policy
        
    except Exception as e:
        print(f"Authorization failed: {str(e)}")
        raise Exception('Unauthorized')
