#!/bin/bash

echo "🚀 Deploying Imagify Infrastructure..."

# Install Python dependencies for Lambda
cd lambda
pip install -r requirements.txt -t .
cd ..

# Install CDK dependencies
npm install

# Bootstrap CDK (only needed once per account/region)
cdk bootstrap

# Deploy stack
cdk deploy --require-approval never

echo "✅ Deployment complete!"
echo "📝 Check outputs for API URLs and Cognito details"
