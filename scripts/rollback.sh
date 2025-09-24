#!/bin/bash

# NeoHarbour Security - Rollback Script
# Automated rollback mechanism for failed deployments

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOYMENT_LOG_DIR="$PROJECT_ROOT/logs/deployment"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ROLLBACK_ID="rollback_${TIMESTAMP}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$DEPLOYMENT_LOG_DIR/$ROLLBACK_ID.log"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$DEPLOYMENT_LOG_DIR/$ROLLBACK_ID.log"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$DEPLOYMENT_LOG_DIR/$ROLLBACK_ID.log"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$DEPLOYMENT_LOG_DIR/$ROLLBACK_ID.log"
}

# Usage function
usage() {
    cat << EOF
Usage: $0 [OPTIONS] ENVIRONMENT

Rollback NeoHarbour Security deployment

ENVIRONMENT:
    dev         Development environment
    staging     Staging environment  
    prod        Production environment

OPTIONS:
    -h, --help              Show this help message
    -t, --target VERSION    Target version to rollback to (required)
    -l, --list-versions     List available versions for rollback
    -f, --force             Force rollback without confirmation
    --dry-run              Show what would be rolled back without executing
    --backup-first         Create backup before rollback

EXAMPLES:
    $0 staging --list-versions          List available versions
    $0 staging --target v1.2.3          Rollback to version v1.2.3
    $0 prod --target v1.2.3 --force     Force rollback production to v1.2.3
    $0 dev --target latest-backup       Rollback to latest backup

EOF
}

# Parse command line arguments
ENVIRONMENT=""
TARGET_VERSION=""
LIST_VERSIONS=false
FORCE=false
DRY_RUN=false
BACKUP_FIRST=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            exit 0
            ;;
        -t|--target)
            TARGET_VERSION="$2"
            shift 2
            ;;
        -l|--list-versions)
            LIST_VERSIONS=true
            shift
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --backup-first)
            BACKUP_FIRST=true
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

# Source deployment functions
source "$SCRIPT_DIR/deployment/functions.sh"

# List available versions
list_versions() {
    local environment=$1
    local stack_name=$(yq eval ".default.deploy.parameters.stack_name" "config/sam-configs/samconfig-$environment.toml")
    
    log_info "Available versions for rollback in $environment:"
    
    # List CloudFormation stack events to find previous versions
    echo ""
    echo "CloudFormation Stack History:"
    aws cloudformation describe-stack-events \
        --stack-name "$stack_name" \
        --query 'StackEvents[?ResourceType==`AWS::CloudFormation::Stack` && ResourceStatus==`UPDATE_COMPLETE`].[Timestamp,ResourceStatusReason]' \
        --output table || log_warning "Could not retrieve stack history"
    
    # List available backups
    echo ""
    echo "Available Backups:"
    local backup_dir="$PROJECT_ROOT/backups/$environment"
    if [[ -d "$backup_dir" ]]; then
        ls -la "$backup_dir" | grep "backup_" | awk '{print $9, $6, $7, $8}' | column -t
    else
        log_warning "No backups found for $environment"
    fi
    
    # List Git tags (if available)
    echo ""
    echo "Git Tags (if using version tags):"
    git tag --sort=-version:refname | head -10 2>/dev/null || log_warning "No git tags found"
}

# Get current deployment version
get_current_version() {
    local environment=$1
    local stack_name=$(yq eval ".default.deploy.parameters.stack_name" "config/sam-configs/samconfig-$environment.toml")
    
    # Get current stack description
    aws cloudformation describe-stacks \
        --stack-name "$stack_name" \
        --query 'Stacks[0].Tags[?Key==`Version`].Value' \
        --output text 2>/dev/null || echo "unknown"
}

# Validate rollback target
validate_rollback_target() {
    local environment=$1
    local target=$2
    
    log_info "Validating rollback target: $target"
    
    if [[ "$target" == "latest-backup" ]]; then
        local backup_dir="$PROJECT_ROOT/backups/$environment"
        if [[ ! -d "$backup_dir" ]]; then
            log_error "No backups directory found: $backup_dir"
            return 1
        fi
        
        local latest_backup=$(ls -t "$backup_dir" | grep "backup_" | head -1)
        if [[ -z "$latest_backup" ]]; then
            log_error "No backups found in $backup_dir"
            return 1
        fi
        
        TARGET_VERSION="$backup_dir/$latest_backup"
        log_info "Latest backup found: $TARGET_VERSION"
        return 0
    fi
    
    # Check if it's a backup path
    if [[ -d "$target" ]]; then
        if [[ -f "$target/metadata.json" ]]; then
            log_info "Valid backup directory: $target"
            return 0
        else
            log_error "Invalid backup directory (missing metadata.json): $target"
            return 1
        fi
    fi
    
    # Check if it's a git tag
    if git rev-parse "$target" >/dev/null 2>&1; then
        log_info "Valid git reference: $target"
        return 0
    fi
    
    log_error "Invalid rollback target: $target"
    return 1
}

# Create pre-rollback backup
create_pre_rollback_backup() {
    local environment=$1
    
    log_info "Creating pre-rollback backup..."
    
    # Use the backup function from deployment functions
    backup_deployment "$environment"
    
    log_success "Pre-rollback backup created"
}

# Rollback CloudFormation stack
rollback_cloudformation() {
    local environment=$1
    local target=$2
    
    log_info "Rolling back CloudFormation stack..."
    
    local stack_name=$(yq eval ".default.deploy.parameters.stack_name" "config/sam-configs/samconfig-$environment.toml")
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would rollback CloudFormation stack $stack_name"
        return 0
    fi
    
    # If target is a backup directory, use the template from backup
    if [[ -d "$target" ]]; then
        local template_file="$target/cloudformation-template.json"
        if [[ -f "$template_file" ]]; then
            log_info "Using template from backup: $template_file"
            
            # Create change set for rollback
            aws cloudformation create-change-set \
                --stack-name "$stack_name" \
                --change-set-name "rollback-$ROLLBACK_ID" \
                --template-body "file://$template_file" \
                --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM
            
            # Execute change set
            aws cloudformation execute-change-set \
                --change-set-name "rollback-$ROLLBACK_ID" \
                --stack-name "$stack_name"
            
            # Wait for rollback to complete
            log_info "Waiting for rollback to complete..."
            aws cloudformation wait stack-update-complete --stack-name "$stack_name"
            
        else
            log_error "Template file not found in backup: $template_file"
            return 1
        fi
    else
        # Git-based rollback - checkout target version and redeploy
        log_info "Performing git-based rollback to $target"
        
        # Stash current changes
        git stash push -m "Pre-rollback stash $ROLLBACK_ID" || true
        
        # Checkout target version
        git checkout "$target"
        
        # Redeploy
        sam build --config-file "config/sam-configs/samconfig-$environment.toml"
        sam deploy --config-file "config/sam-configs/samconfig-$environment.toml" --no-confirm-changeset
    fi
    
    log_success "CloudFormation rollback completed"
}

# Rollback application components
rollback_application() {
    local environment=$1
    local target=$2
    
    log_info "Rolling back application components..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would rollback application components"
        return 0
    fi
    
    # Rollback frontend (if applicable)
    if [[ "$environment" != "dev" ]]; then
        local frontend_config=$(yq eval ".frontend" "config/environments/$environment.yaml")
        local s3_bucket=$(echo "$frontend_config" | yq eval ".s3_bucket")
        
        if [[ "$s3_bucket" != "null" && -n "$s3_bucket" ]]; then
            log_info "Rolling back frontend deployment..."
            
            # If we have a backup with frontend assets, restore them
            if [[ -d "$target" && -d "$target/frontend" ]]; then
                aws s3 sync "$target/frontend/" "s3://$s3_bucket" --delete
                
                # Invalidate CloudFront
                local cloudfront_id=$(echo "$frontend_config" | yq eval ".cloudfront_distribution_id")
                if [[ "$cloudfront_id" != "null" && -n "$cloudfront_id" ]]; then
                    aws cloudfront create-invalidation --distribution-id "$cloudfront_id" --paths "/*"
                fi
            fi
        fi
    fi
    
    # Rollback backend Lambda functions (if applicable)
    local backend_config=$(yq eval ".backend" "config/environments/$environment.yaml")
    local lambda_function=$(echo "$backend_config" | yq eval ".lambda_function_name")
    
    if [[ "$lambda_function" != "null" && -n "$lambda_function" ]]; then
        log_info "Rolling back backend Lambda function..."
        
        # Lambda rollback is handled by CloudFormation stack rollback
        # Additional application-specific rollback logic can be added here
    fi
    
    log_success "Application rollback completed"
}

# Post-rollback validation
post_rollback_validation() {
    local environment=$1
    
    log_info "Running post-rollback validation..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would run post-rollback validation"
        return 0
    fi
    
    # Wait for services to stabilize
    log_info "Waiting for services to stabilize..."
    sleep 30
    
    # Run health checks
    log_info "Running health checks..."
    python3 "$PROJECT_ROOT/tools/health_check.py" health --environment "$environment" || {
        log_error "Health checks failed after rollback"
        return 1
    }
    
    # Test endpoints
    log_info "Testing endpoints..."
    python3 "$SCRIPT_DIR/deployment/test_endpoints.py" "$environment" || {
        log_warning "Some endpoint tests failed after rollback"
    }
    
    log_success "Post-rollback validation completed"
}

# Send rollback notification
send_rollback_notification() {
    local environment=$1
    local status=$2
    local target=$3
    
    local message="Rollback to $target completed with status: $status"
    
    # Use notification function from deployment functions
    send_deployment_notification "$environment" "$status" "$message"
}

# Main rollback function
perform_rollback() {
    local environment=$1
    local target=$2
    
    log_info "=== Starting Rollback ==="
    log_info "Environment: $environment"
    log_info "Target: $target"
    log_info "Rollback ID: $ROLLBACK_ID"
    
    # Validate target
    if ! validate_rollback_target "$environment" "$target"; then
        log_error "Invalid rollback target"
        exit 1
    fi
    
    # Get current version
    local current_version=$(get_current_version "$environment")
    log_info "Current version: $current_version"
    
    # Confirmation for production
    if [[ "$environment" == "prod" && "$FORCE" != "true" ]]; then
        echo -n "Are you sure you want to rollback PRODUCTION from $current_version to $target? (yes/no): "
        read -r confirmation
        if [[ "$confirmation" != "yes" ]]; then
            log_info "Rollback cancelled by user"
            exit 0
        fi
    fi
    
    # Create backup if requested
    if [[ "$BACKUP_FIRST" == "true" ]]; then
        create_pre_rollback_backup "$environment"
    fi
    
    # Perform rollback steps
    rollback_cloudformation "$environment" "$TARGET_VERSION"
    rollback_application "$environment" "$TARGET_VERSION"
    post_rollback_validation "$environment"
    
    # Send notification
    send_rollback_notification "$environment" "success" "$target"
    
    log_success "=== Rollback Completed Successfully ==="
    log_info "Rollback ID: $ROLLBACK_ID"
    log_info "Environment: $environment"
    log_info "Target: $target"
    log_info "Logs: $DEPLOYMENT_LOG_DIR/$ROLLBACK_ID.log"
}

# Main execution
main() {
    # Handle list versions
    if [[ "$LIST_VERSIONS" == "true" ]]; then
        list_versions "$ENVIRONMENT"
        exit 0
    fi
    
    # Validate target version is provided
    if [[ -z "$TARGET_VERSION" ]]; then
        log_error "Target version is required for rollback"
        usage
        exit 1
    fi
    
    # Perform rollback
    perform_rollback "$ENVIRONMENT" "$TARGET_VERSION"
}

# Execute main function
main "$@"