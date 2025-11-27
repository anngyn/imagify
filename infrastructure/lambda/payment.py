import json
import boto3
import hashlib
import hmac
import os
import time
from datetime import datetime
from urllib.parse import urlencode
from botocore.config import Config
from logger import log_api_call, log_payment, log_business_metric

# Connection pooling configuration
config = Config(
    max_pool_connections=50,
    retries={'max_attempts': 2, 'mode': 'adaptive'}
)

# Global clients - reused across invocations
dynamodb = boto3.resource('dynamodb', config=config)
secrets_client = boto3.client('secretsmanager')

CREDIT_PACKAGES = {
    'basic': {'credits': 100, 'amount': 10000},
    'advanced': {'credits': 500, 'amount': 50000},
    'business': {'credits': 5000, 'amount': 100000}
}

def get_vnpay_credentials():
    """Get VNPAY credentials from Secrets Manager"""
    try:
        secret_arn = os.environ['VNPAY_SECRET_ARN']
        response = secrets_client.get_secret_value(SecretId=secret_arn)
        secret = json.loads(response['SecretString'])
        return {
            'tmn_code': secret['tmn_code'],
            'hash_secret': secret['hash_secret'],
            'return_url': secret.get('return_url', 'http://localhost:5173/payment-result')
        }
    except Exception as e:
        print(f"Error getting VNPAY credentials: {str(e)}")
        # Fallback to environment variables for development
        return {
            'tmn_code': os.environ.get('VNPAY_TMN_CODE', ''),
            'hash_secret': os.environ.get('VNPAY_HASH_SECRET', ''),
            'return_url': 'http://localhost:5173/payment-result'
        }

def handler(event, context):
    start_time = time.time()
    user_id = None
    
    try:
        path = event['path']
        method = event['httpMethod']
        
        if '/vnpay' in path and method == 'POST':
            # Get user ID from Cognito authorizer claims
            claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
            user_id = claims.get('sub') or claims.get('cognito:username')
            
            if not user_id:
                return {
                    'statusCode': 401,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'No user ID in token'})
                }
            
            body = json.loads(event['body'])
            body['userId'] = user_id  # Add userId to body
            
            log_api_call('payment', user_id, 'create_vnpay_url', True)
            return create_vnpay_url(body)
        elif '/callback' in path and method == 'GET':
            params = event['queryStringParameters']
            user_id = params.get('vnp_TxnRef', '').split('_')[0] if params.get('vnp_TxnRef') else None
            log_api_call('payment', user_id, 'vnpay_callback', True)
            return handle_vnpay_callback(params)
            
    except Exception as e:
        duration = (time.time() - start_time) * 1000
        log_api_call('payment', user_id, 'payment_error', False, duration, e)
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': str(e)})
        }

def create_vnpay_url(data):
    user_id = data['userId']
    package_type = data['packageType']
    
    if package_type not in CREDIT_PACKAGES:
        raise ValueError('Invalid package type')
    
    package = CREDIT_PACKAGES[package_type]
    vnpay_creds = get_vnpay_credentials()
    
    # Log payment initiation
    log_business_metric('PaymentInitiated', 1, 'Count', user_id)
    log_business_metric('PaymentAmount', package['amount'], 'None', user_id)
    
    vnpay_params = {
        'vnp_Version': '2.1.0',
        'vnp_Command': 'pay',
        'vnp_TmnCode': vnpay_creds['tmn_code'],
        'vnp_Amount': str(package['amount'] * 100),
        'vnp_CurrCode': 'VND',
        'vnp_TxnRef': f"{user_id}_{int(datetime.now().timestamp())}",
        'vnp_OrderInfo': f"Mua {package['credits']} credits",
        'vnp_OrderType': 'other',
        'vnp_Locale': 'vn',
        'vnp_ReturnUrl': vnpay_creds['return_url'],
        'vnp_IpAddr': '127.0.0.1',
        'vnp_CreateDate': datetime.now().strftime('%Y%m%d%H%M%S')
    }
    
    # Sort params and create signature
    sorted_params = dict(sorted(vnpay_params.items()))
    sign_data = urlencode(sorted_params)
    
    signature = hmac.new(
        vnpay_creds['hash_secret'].encode('utf-8'),
        sign_data.encode('utf-8'),
        hashlib.sha512
    ).hexdigest()
    
    payment_url = f"https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?{sign_data}&vnp_SecureHash={signature}"
    
    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'paymentUrl': payment_url})
    }

def handle_vnpay_callback(params):
    vnp_secure_hash = params.pop('vnp_SecureHash', '')
    vnp_response_code = params.get('vnp_ResponseCode')
    vnp_txn_ref = params.get('vnp_TxnRef')
    vnp_amount = params.get('vnp_Amount')
    
    user_id = vnp_txn_ref.split('_')[0] if vnp_txn_ref else None
    vnpay_creds = get_vnpay_credentials()
    
    # Verify signature
    sorted_params = dict(sorted(params.items()))
    sign_data = urlencode(sorted_params)
    
    signature = hmac.new(
        vnpay_creds['hash_secret'].encode('utf-8'),
        sign_data.encode('utf-8'),
        hashlib.sha512
    ).hexdigest()
    
    if signature != vnp_secure_hash:
        log_payment(user_id, 'unknown', 0, False)
        raise ValueError('Invalid signature')
    
    if vnp_response_code == '00':
        # Payment successful - add credits
        amount = int(vnp_amount) // 100
        
        # Find matching package
        package_type = None
        for key, pkg in CREDIT_PACKAGES.items():
            if pkg['amount'] == amount:
                package_type = key
                break
        
        if package_type:
            credits = CREDIT_PACKAGES[package_type]['credits']
            
            table = dynamodb.Table(os.environ['USERS_TABLE'])
            table.update_item(
                Key={'userId': user_id},
                UpdateExpression='SET credits = credits + :credits',
                ExpressionAttributeValues={':credits': credits}
            )
            
            # Log successful payment
            log_payment(user_id, package_type, amount, True)
            log_business_metric('CreditsAdded', credits, 'Count', user_id)
    else:
        # Payment failed
        log_payment(user_id, 'unknown', int(vnp_amount) // 100 if vnp_amount else 0, False)
    
    return {
        'statusCode': 302,
        'headers': {
            'Location': f"{vnpay_creds['return_url']}?status={vnp_response_code}"
        }
    }
