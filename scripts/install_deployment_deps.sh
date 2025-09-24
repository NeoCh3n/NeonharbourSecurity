#!/bin/bash

# NeoHarbour Security - Deployment Dependencies Installation Script
# Installs required tools for deployment automation

set -e

echo "🚀 Installing deployment dependencies for NeoHarbour Security..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect OS
OS="unknown"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    OS="windows"
fi

log_info "Detected OS: $OS"

# Check if running as root (not recommended)
if [[ $EUID -eq 0 ]]; then
    log_warning "Running as root is not recommended for development tools"
fi

# Install AWS CLI
install_aws_cli() {
    log_info "Checking AWS CLI..."
    
    if command -v aws &> /dev/null; then
        AWS_VERSION=$(aws --version 2>&1 | cut -d/ -f2 | cut -d' ' -f1)
        log_success "AWS CLI already installed: $AWS_VERSION"
        return 0
    fi
    
    log_info "Installing AWS CLI..."
    
    case $OS in
        "macos")
            if command -v brew &> /dev/null; then
                brew install awscli
            else
                log_info "Installing via curl..."
                curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
                sudo installer -pkg AWSCLIV2.pkg -target /
                rm AWSCLIV2.pkg
            fi
            ;;
        "linux")
            curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
            unzip awscliv2.zip
            sudo ./aws/install
            rm -rf aws awscliv2.zip
            ;;
        *)
            log_error "Please install AWS CLI manually for your OS"
            log_error "Visit: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
            return 1
            ;;
    esac
    
    log_success "AWS CLI installed successfully"
}

# Install SAM CLI
install_sam_cli() {
    log_info "Checking SAM CLI..."
    
    if command -v sam &> /dev/null; then
        SAM_VERSION=$(sam --version 2>&1 | cut -d' ' -f4)
        log_success "SAM CLI already installed: $SAM_VERSION"
        return 0
    fi
    
    log_info "Installing SAM CLI..."
    
    case $OS in
        "macos")
            if command -v brew &> /dev/null; then
                brew tap aws/tap
                brew install aws-sam-cli
            else
                log_info "Installing via pip..."
                pip3 install aws-sam-cli
            fi
            ;;
        "linux")
            # Install via pip
            pip3 install aws-sam-cli
            ;;
        *)
            log_error "Please install SAM CLI manually for your OS"
            log_error "Visit: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
            return 1
            ;;
    esac
    
    log_success "SAM CLI installed successfully"
}

# Install yq
install_yq() {
    log_info "Checking yq..."
    
    if command -v yq &> /dev/null; then
        YQ_VERSION=$(yq --version 2>&1 | cut -d' ' -f4)
        log_success "yq already installed: $YQ_VERSION"
        return 0
    fi
    
    log_info "Installing yq..."
    
    case $OS in
        "macos")
            if command -v brew &> /dev/null; then
                brew install yq
            else
                log_info "Installing via binary download..."
                sudo wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_darwin_amd64
                sudo chmod +x /usr/local/bin/yq
            fi
            ;;
        "linux")
            sudo wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64
            sudo chmod +x /usr/local/bin/yq
            ;;
        *)
            log_error "Please install yq manually for your OS"
            log_error "Visit: https://github.com/mikefarah/yq#install"
            return 1
            ;;
    esac
    
    log_success "yq installed successfully"
}

# Install Python dependencies
install_python_deps() {
    log_info "Installing Python dependencies..."
    
    # Check if pip is available
    if ! command -v pip3 &> /dev/null; then
        log_error "pip3 not found. Please install Python 3 and pip first."
        return 1
    fi
    
    # Install required Python packages
    pip3 install --user pyyaml boto3 requests tabulate
    
    log_success "Python dependencies installed successfully"
}

# Install Node.js dependencies (for backend)
install_node_deps() {
    log_info "Checking Node.js..."
    
    if ! command -v node &> /dev/null; then
        log_warning "Node.js not found. Installing..."
        
        case $OS in
            "macos")
                if command -v brew &> /dev/null; then
                    brew install node
                else
                    log_error "Please install Node.js manually"
                    log_error "Visit: https://nodejs.org/"
                    return 1
                fi
                ;;
            "linux")
                # Install Node.js via NodeSource repository
                curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
                sudo apt-get install -y nodejs
                ;;
            *)
                log_error "Please install Node.js manually for your OS"
                log_error "Visit: https://nodejs.org/"
                return 1
                ;;
        esac
    else
        NODE_VERSION=$(node --version)
        log_success "Node.js already installed: $NODE_VERSION"
    fi
    
    # Install global packages
    if command -v npm &> /dev/null; then
        log_info "Installing global npm packages..."
        npm install -g typescript
        log_success "Global npm packages installed"
    fi
}

# Verify installations
verify_installations() {
    log_info "Verifying installations..."
    
    local all_good=true
    
    # Check AWS CLI
    if command -v aws &> /dev/null; then
        log_success "✅ AWS CLI: $(aws --version 2>&1 | cut -d/ -f2 | cut -d' ' -f1)"
    else
        log_error "❌ AWS CLI not found"
        all_good=false
    fi
    
    # Check SAM CLI
    if command -v sam &> /dev/null; then
        log_success "✅ SAM CLI: $(sam --version 2>&1 | cut -d' ' -f4)"
    else
        log_error "❌ SAM CLI not found"
        all_good=false
    fi
    
    # Check yq
    if command -v yq &> /dev/null; then
        log_success "✅ yq: $(yq --version 2>&1 | cut -d' ' -f4)"
    else
        log_error "❌ yq not found"
        all_good=false
    fi
    
    # Check Python
    if command -v python3 &> /dev/null; then
        log_success "✅ Python: $(python3 --version | cut -d' ' -f2)"
    else
        log_error "❌ Python 3 not found"
        all_good=false
    fi
    
    # Check Node.js
    if command -v node &> /dev/null; then
        log_success "✅ Node.js: $(node --version)"
    else
        log_warning "⚠️  Node.js not found (optional for deployment)"
    fi
    
    if [[ "$all_good" == "true" ]]; then
        log_success "🎉 All deployment dependencies are installed!"
        return 0
    else
        log_error "❌ Some dependencies are missing. Please install them manually."
        return 1
    fi
}

# Main installation flow
main() {
    log_info "=== NeoHarbour Security Deployment Dependencies Installation ==="
    
    # Install core dependencies
    install_aws_cli || log_error "Failed to install AWS CLI"
    install_sam_cli || log_error "Failed to install SAM CLI"
    install_yq || log_error "Failed to install yq"
    install_python_deps || log_error "Failed to install Python dependencies"
    install_node_deps || log_warning "Failed to install Node.js (optional)"
    
    echo ""
    verify_installations
    
    echo ""
    log_info "=== Next Steps ==="
    echo "1. Configure AWS credentials: aws configure"
    echo "2. Validate configuration: make validate-config ENV=dev"
    echo "3. Deploy to development: make deploy-dev"
    echo ""
    log_info "For more information, see: docs/deployment_automation.md"
}

# Run main function
main "$@"