#!/usr/bin/env python3
"""
Cost-free Lambda warmer using CloudWatch Events
Keeps Lambda warm during business hours only
"""
import boto3
import json
from datetime import datetime, timezone

def lambda_handler(event, context):
    """Warm Lambda functions during peak hours"""
    
    # Only warm during business hours (9 AM - 6 PM UTC+7)
    now = datetime.now(timezone.utc)
    vietnam_hour = (now.hour + 7) % 24
    
    if not (9 <= vietnam_hour <= 18):
        print(f"Outside business hours ({vietnam_hour}:00), skipping warm-up")
        return {'statusCode': 200, 'body': 'Skipped - outside business hours'}
    
    lambda_client = boto3.client('lambda')
    
    # Warm auth function with minimal payload
    try:
        response = lambda_client.invoke(
            FunctionName='ImagifyStack-AuthFunctionA1CD5E0F-HnTJ0bnpL0yA',
            InvocationType='RequestResponse',
            Payload=json.dumps({
                'httpMethod': 'GET',
                'path': '/health',
                'headers': {},
                'body': None,
                'isWarming': True
            })
        )
        print(f"Warmed auth function: {response['StatusCode']}")
        
    except Exception as e:
        print(f"Warming failed: {str(e)}")
    
    return {
        'statusCode': 200,
        'body': json.dumps('Lambda warmed successfully')
    }
