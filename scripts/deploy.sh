#!/bin/bash

# NeoHarbour Security - Comprehensive Deployment Script
# Supports dev, staging, and production environments with validation and rollback

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOYMENT_LOG_DIR="$PROJECT_ROOT/logs/deployment"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DEPLOYMENT_ID="deploy_${TIMESTAMP}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$DEPLOYMENT_LOG_DIR/$DEPLOYMENT_ID.log"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$DEPLOYMENT_LOG_DIR/$DEPLOYMENT_ID.log"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$DEPLOYMENT_LOG_DIR/$DEPLOYMENT_ID.log"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$DEPLOYMENT_LOG_DIR/$DEPLOYMENT_ID.log"
}

# Usage function
usage() {
    cat << EOF
Usage: $0 [OPTIONS] ENVIRONMENT

Deploy NeoHarbour Security to specified environment

ENVIRONMENT:
    dev         Development environment
    staging     Staging environment  
    prod        Production environment

OPTIONS:
    -h, --help              Show this help message
    -v, --validate-only     Only run validation, don't deploy
    -r, --rollback VERSION  Rollback to specified version
    -f, --force             Force deployment without confirmation
    --skip-tests           Skip pre-deployment tests
    --dry-run              Show what would be deployed without executing

EXAMPLES:
    $0 dev                  Deploy to development
    $0 staging --validate-only  Validate staging configuration
    $0 prod --rollback v1.2.3   Rollback production to v1.2.3
    $0 dev --dry-run        Show dev deployment plan

EOF
}

# Parse command line arguments
ENVIRONMENT=""
VALIDATE_ONLY=false
ROLLBACK_VERSION=""
FORCE=false
SKIP_TESTS=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            exit 0
            ;;
        -v|--validate-only)
            VALIDATE_ONLY=true
            shift
            ;;
        -r|--rollback)
            ROLLBACK_VERSION="$2"
            shift 2
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        dev|staging|prod)
            ENVIRONMENT="$1"
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Validate required parameters
if [[ -z "$ENVIRONMENT" ]]; then
    log_error "Environment is required"
    usage
    exit 1
fi

# Create deployment log directory
mkdir -p "$DEPLOYMENT_LOG_DIR"

log_info "Starting deployment to $ENVIRONMENT environment"
log_info "Deployment ID: $DEPLOYMENT_ID"

# Load environment-specific configuration
ENV_CONFIG_FILE="$PROJECT_ROOT/config/environments/$ENVIRONMENT.yaml"
if [[ ! -f "$ENV_CONFIG_FILE" ]]; then
    log_error "Environment configuration file not found: $ENV_CONFIG_FILE"
    exit 1
fi

# Source deployment functions
source "$SCRIPT_DIR/deployment/functions.sh"

# Pre-deployment checks
check_prerequisites() {
    log_info "Running pre-deployment checks..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI not found. Please install it first."
        exit 1
    fi
    
    # Check SAM CLI
    if ! command -v sam &> /dev/null; then
        log_error "SAM CLI not found. Please install it first."
        exit 1
    fi
    
    # Check Python
    if ! command -v python3 &> /dev/null; then
        log_error "Python 3 not found. Please install it first."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured. Please run 'aws configure'"
        exit 1
    fi
    
    # Verify AWS account and region
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    CURRENT_REGION=$(aws configure get region)
    
    log_info "AWS Account: $ACCOUNT_ID"
    log_info "AWS Region: $CURRENT_REGION"
    
    # Load expected account/region from config
    EXPECTED_ACCOUNT=$(yq eval ".aws.account_id" "$ENV_CONFIG_FILE")
    EXPECTED_REGION=$(yq eval ".aws.region" "$ENV_CONFIG_FILE")
    
    if [[ "$ACCOUNT_ID" != "$EXPECTED_ACCOUNT" ]]; then
        log_error "AWS account mismatch. Expected: $EXPECTED_ACCOUNT, Current: $ACCOUNT_ID"
        exit 1
    fi
    
    if [[ "$CURRENT_REGION" != "$EXPECTED_REGION" ]]; then
        log_error "AWS region mismatch. Expected: $EXPECTED_REGION, Current: $CURRENT_REGION"
        exit 1
    fi
    
    log_success "Pre-deployment checks passed"
}

# Run tests
run_tests() {
    if [[ "$SKIP_TESTS" == "true" ]]; then
        log_warning "Skipping tests as requested"
        return 0
    fi
    
    log_info "Running pre-deployment tests..."
    
    cd "$PROJECT_ROOT"
    
    # Run unit tests
    log_info "Running unit tests..."
    python3 -m pytest tests/ -v --tb=short
    
    # Run integration tests for the target environment
    log_info "Running integration tests..."
    python3 -m pytest tests/test_*integration* -v --tb=short
    
    # Run demo system tests
    log_info "Running demo system tests..."
    python3 -m pytest tests/test_demo_* -v --tb=short
    
    log_success "All tests passed"
}

# Validate configuration
validate_configuration() {
    log_info "Validating configuration for $ENVIRONMENT..."
    
    # Validate SAM template
    log_info "Validating SAM template..."
    sam validate --template infra/sam-template.yaml
    
    # Validate environment configuration
    log_info "Validating environment configuration..."
    python3 "$SCRIPT_DIR/deployment/validate_config.py" "$ENVIRONMENT"
    
    # Check for required secrets
    log_info "Checking required secrets..."
    python3 "$SCRIPT_DIR/deployment/check_secrets.py" "$ENVIRONMENT"
    
    log_success "Configuration validation passed"
}

# Deploy infrastructure
deploy_infrastructure() {
    log_info "Deploying infrastructure to $ENVIRONMENT..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would deploy infrastructure with the following parameters:"
        cat "$PROJECT_ROOT/config/sam-configs/samconfig-$ENVIRONMENT.toml"
        return 0
    fi
    
    cd "$PROJECT_ROOT"
    
    # Build SAM application
    log_info "Building SAM application..."
    sam build --config-file "config/sam-configs/samconfig-$ENVIRONMENT.toml"
    
    # Deploy with environment-specific configuration
    log_info "Deploying SAM application..."
    sam deploy --config-file "config/sam-configs/samconfig-$ENVIRONMENT.toml" --no-confirm-changeset
    
    # Store deployment metadata
    STACK_NAME=$(yq eval ".default.deploy.parameters.stack_name" "config/sam-configs/samconfig-$ENVIRONMENT.toml")
    aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs' > "$DEPLOYMENT_LOG_DIR/${DEPLOYMENT_ID}_outputs.json"
    
    log_success "Infrastructure deployment completed"
}

# Deploy demo system components
deploy_demo_components() {
    log_info "Deploying demo system components..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would deploy demo components"
        return 0
    fi
    
    # Deploy React frontend if in staging/prod
    if [[ "$ENVIRONMENT" != "dev" ]]; then
        log_info "Building and deploying React frontend..."
        cd "$PROJECT_ROOT/clerk-react"
        npm ci
        npm run build
        
        # Deploy to S3 (configuration from environment config)
        FRONTEND_BUCKET=$(yq eval ".frontend.s3_bucket" "$ENV_CONFIG_FILE")
        aws s3 sync dist/ "s3://$FRONTEND_BUCKET" --delete
        
        # Invalidate CloudFront if configured
        CLOUDFRONT_ID=$(yq eval ".frontend.cloudfront_distribution_id" "$ENV_CONFIG_FILE")
        if [[ "$CLOUDFRONT_ID" != "null" ]]; then
            aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_ID" --paths "/*"
        fi
    fi
    
    # Deploy backend API
    log_info "Deploying backend API..."
    cd "$PROJECT_ROOT/backend"
    npm ci
    
    # Update Lambda function code if using Lambda deployment
    BACKEND_FUNCTION=$(yq eval ".backend.lambda_function_name" "$ENV_CONFIG_FILE")
    if [[ "$BACKEND_FUNCTION" != "null" ]]; then
        zip -r backend.zip . -x "node_modules/aws-sdk/*"
        aws lambda update-function-code --function-name "$BACKEND_FUNCTION" --zip-file fileb://backend.zip
    fi
    
    log_success "Demo components deployment completed"
}

# Post-deployment validation
post_deployment_validation() {
    log_info "Running post-deployment validation..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would run post-deployment validation"
        return 0
    fi
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 30
    
    # Run health checks
    log_info "Running health checks..."
    python3 "$PROJECT_ROOT/tools/health_check.py" health --environment "$ENVIRONMENT"
    
    # Run AWS service integration validation
    log_info "Validating AWS service integration..."
    python3 "$PROJECT_ROOT/tools/validate_aws_service_integration.py" --environment "$ENVIRONMENT"
    
    # Run demo system validation
    log_info "Validating demo system..."
    python3 "$PROJECT_ROOT/tools/validate_demo_live_consistency.py" --environment "$ENVIRONMENT"
    
    # Test API endpoints
    log_info "Testing API endpoints..."
    python3 "$SCRIPT_DIR/deployment/test_endpoints.py" "$ENVIRONMENT"
    
    log_success "Post-deployment validation passed"
}

# Rollback function
rollback_deployment() {
    log_info "Rolling back to version $ROLLBACK_VERSION..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would rollback to version $ROLLBACK_VERSION"
        return 0
    fi
    
    # Get stack name
    STACK_NAME=$(yq eval ".default.deploy.parameters.stack_name" "config/sam-configs/samconfig-$ENVIRONMENT.toml")
    
    # Find the changeset for the target version
    CHANGESET_ID=$(aws cloudformation list-change-sets --stack-name "$STACK_NAME" --query "Summaries[?Description=='$ROLLBACK_VERSION'].ChangeSetId" --output text)
    
    if [[ -z "$CHANGESET_ID" ]]; then
        log_error "No changeset found for version $ROLLBACK_VERSION"
        exit 1
    fi
    
    # Execute rollback
    aws cloudformation execute-change-set --change-set-name "$CHANGESET_ID"
    
    # Wait for rollback to complete
    aws cloudformation wait stack-update-complete --stack-name "$STACK_NAME"
    
    log_success "Rollback to version $ROLLBACK_VERSION completed"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up temporary files..."
    # Add cleanup logic here
}

# Trap cleanup on exit
trap cleanup EXIT

# Main execution flow
main() {
    log_info "=== NeoHarbour Security Deployment ==="
    log_info "Environment: $ENVIRONMENT"
    log_info "Deployment ID: $DEPLOYMENT_ID"
    log_info "Timestamp: $(date)"
    
    # Handle rollback
    if [[ -n "$ROLLBACK_VERSION" ]]; then
        rollback_deployment
        exit 0
    fi
    
    # Run deployment steps
    check_prerequisites
    
    if [[ "$VALIDATE_ONLY" == "true" ]]; then
        validate_configuration
        log_success "Validation completed successfully"
        exit 0
    fi
    
    # Confirmation for production
    if [[ "$ENVIRONMENT" == "prod" && "$FORCE" != "true" ]]; then
        echo -n "Are you sure you want to deploy to PRODUCTION? (yes/no): "
        read -r confirmation
        if [[ "$confirmation" != "yes" ]]; then
            log_info "Deployment cancelled by user"
            exit 0
        fi
    fi
    
    run_tests
    validate_configuration
    deploy_infrastructure
    deploy_demo_components
    post_deployment_validation
    
    log_success "=== Deployment completed successfully ==="
    log_info "Deployment ID: $DEPLOYMENT_ID"
    log_info "Environment: $ENVIRONMENT"
    log_info "Logs: $DEPLOYMENT_LOG_DIR/$DEPLOYMENT_ID.log"
}

# Execute main function
main "$@"