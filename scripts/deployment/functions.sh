#!/bin/bash

# NeoHarbour Security - Deployment Functions Library
# Shared functions for deployment automation

# Environment validation functions
validate_environment() {
    local env=$1
    case $env in
        dev|staging|prod)
            return 0
            ;;
        *)
            log_error "Invalid environment: $env. Must be dev, staging, or prod"
            return 1
            ;;
    esac
}

# AWS resource validation
validate_aws_resources() {
    local environment=$1
    local config_file="$PROJECT_ROOT/config/environments/$environment.yaml"
    
    log_info "Validating AWS resources for $environment..."
    
    # Check if required DynamoDB tables exist
    local investigations_table=$(yq eval ".aws.dynamodb.investigations_table" "$config_file")
    local metrics_table=$(yq eval ".aws.dynamodb.metrics_table" "$config_file")
    local demo_sessions_table=$(yq eval ".aws.dynamodb.demo_sessions_table" "$config_file")
    
    for table in "$investigations_table" "$metrics_table" "$demo_sessions_table"; do
        if ! aws dynamodb describe-table --table-name "$table" &>/dev/null; then
            log_warning "DynamoDB table $table does not exist - will be created during deployment"
        else
            log_info "DynamoDB table $table exists"
        fi
    done
    
    # Check S3 buckets
    local artifacts_bucket=$(yq eval ".aws.s3.artifacts_bucket" "$config_file")
    local audit_bucket=$(yq eval ".aws.s3.audit_bucket" "$config_file")
    
    for bucket in "$artifacts_bucket" "$audit_bucket"; do
        if ! aws s3 ls "s3://$bucket" &>/dev/null; then
            log_warning "S3 bucket $bucket does not exist - will be created during deployment"
        else
            log_info "S3 bucket $bucket exists"
        fi
    done
    
    # Check KMS key
    local kms_alias=$(yq eval ".aws.kms.key_alias" "$config_file")
    if ! aws kms describe-key --key-id "$kms_alias" &>/dev/null; then
        log_warning "KMS key $kms_alias does not exist - will be created during deployment"
    else
        log_info "KMS key $kms_alias exists"
    fi
}

# Generate environment-specific configuration
generate_env_config() {
    local environment=$1
    local config_file="$PROJECT_ROOT/config/environments/$environment.yaml"
    local env_file="$PROJECT_ROOT/.env.$environment"
    
    log_info "Generating environment configuration for $environment..."
    
    # Create .env file from template and config
    cat > "$env_file" << EOF
# NeoHarbour Security - $environment Environment Configuration
# Generated on $(date)

# AWS Configuration
AWS_REGION=$(yq eval ".aws.region" "$config_file")
AWS_ACCOUNT_ID=$(yq eval ".aws.account_id" "$config_file")

# DynamoDB Tables
DDB_INVESTIGATIONS_TABLE=$(yq eval ".aws.dynamodb.investigations_table" "$config_file")
DDB_METRICS_TABLE=$(yq eval ".aws.dynamodb.metrics_table" "$config_file")
DDB_DEMO_SESSIONS_TABLE=$(yq eval ".aws.dynamodb.demo_sessions_table" "$config_file")
DDB_AGENTS_TABLE=$(yq eval ".aws.dynamodb.agents_table" "$config_file")

# S3 Buckets
ARTIFACTS_BUCKET=$(yq eval ".aws.s3.artifacts_bucket" "$config_file")
AUDIT_BUCKET=$(yq eval ".aws.s3.audit_bucket" "$config_file")

# KMS
KMS_KEY_ID=$(yq eval ".aws.kms.key_alias" "$config_file")

# EventBridge
EVENT_BUS_NAME=$(yq eval ".aws.eventbridge.bus_name" "$config_file")

# Step Functions
STATE_MACHINE_ARN=$(yq eval ".aws.stepfunctions.state_machine_name" "$config_file")

# AI Configuration
AI_PROVIDER=$(yq eval ".ai.provider" "$config_file")
BEDROCK_REGION=$(yq eval ".ai.bedrock.region" "$config_file")
BEDROCK_TEXT_MODEL=$(yq eval ".ai.bedrock.text_model" "$config_file")
BEDROCK_EMBED_MODEL=$(yq eval ".ai.bedrock.embed_model" "$config_file")
BEDROCK_MAX_TOKENS=$(yq eval ".ai.bedrock.max_tokens" "$config_file")
BEDROCK_TEMPERATURE=$(yq eval ".ai.bedrock.temperature" "$config_file")

# Demo Configuration
DEFAULT_TENANT_ID=$(yq eval ".demo.default_tenant_id" "$config_file")
CONNECTOR_FIXTURES=tools/seed

# Rate Limiting
CONNECTOR_RPS=$(yq eval ".connectors.rate_limit.rps" "$config_file")
CONNECTOR_BURST=$(yq eval ".connectors.rate_limit.burst" "$config_file")

# Logging
LOG_LEVEL=$(yq eval ".logging.level" "$config_file")
POWERTOOLS_SERVICE_NAME=AsiaAgenticSoc

# Environment-specific settings
NODE_ENV=$environment
STAGE_NAME=$environment
EOF

    log_success "Environment configuration generated: $env_file"
}

# Backup current deployment
backup_deployment() {
    local environment=$1
    local backup_dir="$PROJECT_ROOT/backups/$environment"
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_path="$backup_dir/backup_$timestamp"
    
    log_info "Creating deployment backup..."
    
    mkdir -p "$backup_path"
    
    # Backup CloudFormation stack
    local stack_name=$(yq eval ".default.deploy.parameters.stack_name" "config/sam-configs/samconfig-$environment.toml")
    aws cloudformation get-template --stack-name "$stack_name" > "$backup_path/cloudformation-template.json"
    aws cloudformation describe-stacks --stack-name "$stack_name" > "$backup_path/stack-description.json"
    
    # Backup DynamoDB data (metadata only for large tables)
    local investigations_table=$(yq eval ".aws.dynamodb.investigations_table" "config/environments/$environment.yaml")
    aws dynamodb describe-table --table-name "$investigations_table" > "$backup_path/investigations-table-schema.json"
    
    # Backup S3 bucket policies and configurations
    local artifacts_bucket=$(yq eval ".aws.s3.artifacts_bucket" "config/environments/$environment.yaml")
    aws s3api get-bucket-policy --bucket "$artifacts_bucket" > "$backup_path/artifacts-bucket-policy.json" 2>/dev/null || true
    aws s3api get-bucket-encryption --bucket "$artifacts_bucket" > "$backup_path/artifacts-bucket-encryption.json" 2>/dev/null || true
    
    # Store backup metadata
    cat > "$backup_path/metadata.json" << EOF
{
    "environment": "$environment",
    "timestamp": "$timestamp",
    "deployment_id": "$DEPLOYMENT_ID",
    "aws_account": "$(aws sts get-caller-identity --query Account --output text)",
    "aws_region": "$(aws configure get region)",
    "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
    "git_branch": "$(git branch --show-current 2>/dev/null || echo 'unknown')"
}
EOF
    
    log_success "Deployment backup created: $backup_path"
    echo "$backup_path" > "$PROJECT_ROOT/.last_backup_$environment"
}

# Restore from backup
restore_deployment() {
    local environment=$1
    local backup_path=$2
    
    if [[ ! -d "$backup_path" ]]; then
        log_error "Backup path does not exist: $backup_path"
        return 1
    fi
    
    log_info "Restoring deployment from backup: $backup_path"
    
    # Restore CloudFormation stack
    local stack_name=$(yq eval ".default.deploy.parameters.stack_name" "config/sam-configs/samconfig-$environment.toml")
    
    # Create change set for rollback
    aws cloudformation create-change-set \
        --stack-name "$stack_name" \
        --change-set-name "rollback-$(date +%Y%m%d-%H%M%S)" \
        --template-body "file://$backup_path/cloudformation-template.json" \
        --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM
    
    log_success "Rollback change set created. Execute manually if needed."
}

# Health check functions
check_service_health() {
    local environment=$1
    local max_retries=5
    local retry_delay=10
    
    log_info "Checking service health for $environment..."
    
    # Check API Gateway health
    local api_endpoint=$(yq eval ".api.endpoint" "config/environments/$environment.yaml")
    if [[ "$api_endpoint" != "null" ]]; then
        for ((i=1; i<=max_retries; i++)); do
            if curl -f -s "$api_endpoint/health" > /dev/null; then
                log_success "API Gateway health check passed"
                break
            else
                log_warning "API Gateway health check failed (attempt $i/$max_retries)"
                if [[ $i -eq $max_retries ]]; then
                    log_error "API Gateway health check failed after $max_retries attempts"
                    return 1
                fi
                sleep $retry_delay
            fi
        done
    fi
    
    # Check Step Functions
    local state_machine_name=$(yq eval ".aws.stepfunctions.state_machine_name" "config/environments/$environment.yaml")
    if aws stepfunctions describe-state-machine --state-machine-arn "arn:aws:states:$(aws configure get region):$(aws sts get-caller-identity --query Account --output text):stateMachine:$state_machine_name" &>/dev/null; then
        log_success "Step Functions health check passed"
    else
        log_error "Step Functions health check failed"
        return 1
    fi
    
    # Check DynamoDB tables
    local investigations_table=$(yq eval ".aws.dynamodb.investigations_table" "config/environments/$environment.yaml")
    if aws dynamodb describe-table --table-name "$investigations_table" &>/dev/null; then
        log_success "DynamoDB health check passed"
    else
        log_error "DynamoDB health check failed"
        return 1
    fi
    
    return 0
}

# Deployment metrics collection
collect_deployment_metrics() {
    local environment=$1
    local deployment_start_time=$2
    local deployment_end_time=$(date +%s)
    local duration=$((deployment_end_time - deployment_start_time))
    
    log_info "Collecting deployment metrics..."
    
    # Create metrics file
    local metrics_file="$DEPLOYMENT_LOG_DIR/${DEPLOYMENT_ID}_metrics.json"
    
    cat > "$metrics_file" << EOF
{
    "deployment_id": "$DEPLOYMENT_ID",
    "environment": "$environment",
    "start_time": $deployment_start_time,
    "end_time": $deployment_end_time,
    "duration_seconds": $duration,
    "aws_account": "$(aws sts get-caller-identity --query Account --output text)",
    "aws_region": "$(aws configure get region)",
    "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
    "git_branch": "$(git branch --show-current 2>/dev/null || echo 'unknown')",
    "deployed_by": "$(whoami)",
    "deployment_host": "$(hostname)"
}
EOF
    
    log_success "Deployment metrics collected: $metrics_file"
}

# Notification functions
send_deployment_notification() {
    local environment=$1
    local status=$2
    local message=$3
    
    # Slack notification (if configured)
    local slack_webhook=$(yq eval ".notifications.slack.webhook_url" "config/environments/$environment.yaml" 2>/dev/null)
    if [[ "$slack_webhook" != "null" && -n "$slack_webhook" ]]; then
        local color="good"
        if [[ "$status" == "failed" ]]; then
            color="danger"
        elif [[ "$status" == "warning" ]]; then
            color="warning"
        fi
        
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"attachments\":[{\"color\":\"$color\",\"title\":\"NeoHarbour Security Deployment\",\"text\":\"Environment: $environment\\nStatus: $status\\nMessage: $message\\nDeployment ID: $DEPLOYMENT_ID\"}]}" \
            "$slack_webhook" &>/dev/null || true
    fi
    
    # Email notification (if configured)
    local email_topic=$(yq eval ".notifications.sns.topic_arn" "config/environments/$environment.yaml" 2>/dev/null)
    if [[ "$email_topic" != "null" && -n "$email_topic" ]]; then
        aws sns publish \
            --topic-arn "$email_topic" \
            --subject "NeoHarbour Security Deployment - $environment - $status" \
            --message "Environment: $environment\nStatus: $status\nMessage: $message\nDeployment ID: $DEPLOYMENT_ID\nTimestamp: $(date)" \
            &>/dev/null || true
    fi
}

# Utility functions
check_yq() {
    if ! command -v yq &> /dev/null; then
        log_error "yq not found. Please install it first:"
        log_error "  brew install yq  # macOS"
        log_error "  sudo apt-get install yq  # Ubuntu"
        exit 1
    fi
}

check_git() {
    if ! command -v git &> /dev/null; then
        log_warning "git not found. Some features may not work properly."
        return 1
    fi
    return 0
}

# Initialize deployment functions
init_deployment_functions() {
    check_yq
    check_git || true
    
    # Create necessary directories
    mkdir -p "$PROJECT_ROOT/logs/deployment"
    mkdir -p "$PROJECT_ROOT/backups"
    mkdir -p "$PROJECT_ROOT/config/environments"
    mkdir -p "$PROJECT_ROOT/config/sam-configs"
}

# Call initialization
init_deployment_functions