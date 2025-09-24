#!/bin/bash

# Minimal AWS Setup Script for NeoHarbour Security
# This script sets up the minimum required AWS resources for demo/development

set -e

echo "🚀 Setting up minimal AWS resources for NeoHarbour Security..."

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install it first:"
    echo "   https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Please run:"
    echo "   aws configure"
    exit 1
fi

# Get AWS account ID and region
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=${AWS_REGION:-us-east-1}

echo "📋 AWS Account: $ACCOUNT_ID"
echo "📍 Region: $REGION"

# Create DynamoDB tables
echo "📊 Creating DynamoDB tables..."

# Investigations table
aws dynamodb create-table \
    --table-name AsiaAgenticSocInvestigations \
    --attribute-definitions \
        AttributeName=pk,AttributeType=S \
        AttributeName=sk,AttributeType=S \
    --key-schema \
        AttributeName=pk,KeyType=HASH \
        AttributeName=sk,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST \
    --region $REGION \
    --no-cli-pager || echo "Table AsiaAgenticSocInvestigations may already exist"

# Metrics table
aws dynamodb create-table \
    --table-name AsiaAgenticSocMetrics \
    --attribute-definitions \
        AttributeName=metric_date,AttributeType=S \
        AttributeName=metric_name,AttributeType=S \
    --key-schema \
        AttributeName=metric_date,KeyType=HASH \
        AttributeName=metric_name,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST \
    --region $REGION \
    --no-cli-pager || echo "Table AsiaAgenticSocMetrics may already exist"

# Create S3 buckets
echo "🪣 Creating S3 buckets..."

ARTIFACTS_BUCKET="asia-agentic-soc-artifacts-$ACCOUNT_ID"
AUDIT_BUCKET="asia-agentic-soc-audit-$ACCOUNT_ID"

# Artifacts bucket
aws s3 mb s3://$ARTIFACTS_BUCKET --region $REGION || echo "Bucket $ARTIFACTS_BUCKET may already exist"

# Audit bucket (without Object Lock for simplicity)
aws s3 mb s3://$AUDIT_BUCKET --region $REGION || echo "Bucket $AUDIT_BUCKET may already exist"

# Enable versioning on buckets
aws s3api put-bucket-versioning \
    --bucket $ARTIFACTS_BUCKET \
    --versioning-configuration Status=Enabled \
    --region $REGION || true

aws s3api put-bucket-versioning \
    --bucket $AUDIT_BUCKET \
    --versioning-configuration Status=Enabled \
    --region $REGION || true

# Create KMS key
echo "🔐 Creating KMS key..."

KMS_KEY_ID=$(aws kms create-key \
    --description "NeoHarbour Security encryption key" \
    --usage ENCRYPT_DECRYPT \
    --key-spec SYMMETRIC_DEFAULT \
    --region $REGION \
    --query KeyMetadata.KeyId \
    --output text 2>/dev/null || echo "")

if [ -n "$KMS_KEY_ID" ]; then
    # Create alias
    aws kms create-alias \
        --alias-name alias/AsiaAgenticSoc \
        --target-key-id $KMS_KEY_ID \
        --region $REGION || echo "Alias may already exist"
    
    echo "✅ KMS key created: $KMS_KEY_ID"
else
    echo "⚠️  KMS key creation failed or already exists"
fi

# Update environment file
echo "📝 Updating .env file..."

ENV_FILE=".env"
if [ -f "$ENV_FILE" ]; then
    # Update existing values
    sed -i.bak "s|^ARTIFACTS_BUCKET=.*|ARTIFACTS_BUCKET=$ARTIFACTS_BUCKET|" $ENV_FILE
    sed -i.bak "s|^AUDIT_BUCKET=.*|AUDIT_BUCKET=$AUDIT_BUCKET|" $ENV_FILE
    sed -i.bak "s|^AWS_REGION=.*|AWS_REGION=$REGION|" $ENV_FILE
    
    # Add missing values if they don't exist
    grep -q "^DDB_INVESTIGATIONS_TABLE=" $ENV_FILE || echo "DDB_INVESTIGATIONS_TABLE=AsiaAgenticSocInvestigations" >> $ENV_FILE
    grep -q "^DDB_METRICS_TABLE=" $ENV_FILE || echo "DDB_METRICS_TABLE=AsiaAgenticSocMetrics" >> $ENV_FILE
    grep -q "^DEFAULT_TENANT_ID=" $ENV_FILE || echo "DEFAULT_TENANT_ID=demo-tenant" >> $ENV_FILE
    
    echo "✅ Updated $ENV_FILE"
else
    echo "⚠️  .env file not found. Please create it with the following values:"
    echo "AWS_REGION=$REGION"
    echo "DDB_INVESTIGATIONS_TABLE=AsiaAgenticSocInvestigations"
    echo "DDB_METRICS_TABLE=AsiaAgenticSocMetrics"
    echo "ARTIFACTS_BUCKET=$ARTIFACTS_BUCKET"
    echo "AUDIT_BUCKET=$AUDIT_BUCKET"
    echo "DEFAULT_TENANT_ID=demo-tenant"
fi

echo ""
echo "🎉 Minimal AWS setup complete!"
echo ""
echo "📋 Resources created:"
echo "   • DynamoDB tables: AsiaAgenticSocInvestigations, AsiaAgenticSocMetrics"
echo "   • S3 buckets: $ARTIFACTS_BUCKET, $AUDIT_BUCKET"
echo "   • KMS key: alias/AsiaAgenticSoc"
echo ""
echo "🔍 Next steps:"
echo "   1. Run validation: python tools/validate_aws_service_integration.py"
echo "   2. For full deployment with Step Functions: sam build && sam deploy --guided"
echo "   3. For Bedrock access: Enable models in AWS Bedrock console"
echo ""
echo "⚠️  Note: This is a minimal setup for development/demo purposes."
echo "   For production, use the full SAM template deployment."