import json
import logging
import os
from datetime import datetime
import boto3

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# CloudWatch client for custom metrics
cloudwatch = boto3.client('cloudwatch')

def log_api_call(function_name, user_id=None, action=None, success=True, duration=None, error=None):
    """Log API call with structured data"""
    log_data = {
        'timestamp': datetime.now().isoformat(),
        'function': function_name,
        'user_id': user_id,
        'action': action,
        'success': success,
        'duration_ms': duration
    }
    
    if error:
        log_data['error'] = str(error)
        logger.error(f"API_CALL_ERROR: {json.dumps(log_data)}")
    else:
        logger.info(f"API_CALL: {json.dumps(log_data)}")

def log_business_metric(metric_name, value, unit='Count', user_id=None):
    """Log custom business metrics to CloudWatch"""
    try:
        dimensions = []
        if user_id:
            dimensions.append({'Name': 'UserId', 'Value': user_id})
        
        cloudwatch.put_metric_data(
            Namespace='Imagify/Business',
            MetricData=[
                {
                    'MetricName': metric_name,
                    'Value': value,
                    'Unit': unit,
                    'Dimensions': dimensions,
                    'Timestamp': datetime.now()
                }
            ]
        )
        logger.info(f"METRIC: {metric_name}={value} {unit}")
    except Exception as e:
        logger.error(f"Failed to send metric {metric_name}: {e}")

def log_image_generation(user_id, prompt, success=True, cost=None, duration=None):
    """Log image generation events"""
    log_data = {
        'event_type': 'image_generation',
        'user_id': user_id,
        'prompt_length': len(prompt),
        'success': success,
        'cost_usd': cost,
        'duration_ms': duration,
        'timestamp': datetime.now().isoformat()
    }
    
    logger.info(f"IMAGE_GEN: {json.dumps(log_data)}")
    
    # Send business metrics
    log_business_metric('ImageGeneration', 1, 'Count', user_id)
    if cost:
        log_business_metric('ImageGenerationCost', cost, 'None', user_id)

def log_payment(user_id, package_type, amount, success=True):
    """Log payment events"""
    log_data = {
        'event_type': 'payment',
        'user_id': user_id,
        'package_type': package_type,
        'amount_vnd': amount,
        'success': success,
        'timestamp': datetime.now().isoformat()
    }
    
    logger.info(f"PAYMENT: {json.dumps(log_data)}")
    
    # Send business metrics
    if success:
        log_business_metric('PaymentSuccess', 1, 'Count', user_id)
        log_business_metric('Revenue', amount, 'None')
    else:
        log_business_metric('PaymentFailure', 1, 'Count', user_id)
