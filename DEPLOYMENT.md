# NeonHarbour Security Platform - Deployment Guide

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for development)
- PostgreSQL (for production deployment)

### Development Deployment

1. **Clone and setup**
   ```bash
   git clone <repository>
   cd NeonharbourSecurity
   cp .env.example .env
   # Edit .env with your API keys
   ```

2. **Start with Docker Compose**
   ```bash
   docker-compose up -d
   ```
   
   The application will be available at:
   - Frontend: http://localhost:80
   - Backend API: http://localhost:3000
   - PostgreSQL: localhost:5432

3. **Initialize the database**
   ```bash
   # The database automatically initializes on first run
   # Check logs: docker-compose logs backend
   ```

### Production Deployment

1. **Environment Configuration**
   ```bash
   # Set production environment variables
   export NODE_ENV=production
   export JWT_SECRET=$(openssl rand -base64 32)
   export DATABASE_URL=postgresql://user:pass@host:5432/dbname
   export OPENAI_API_KEY=your-actual-key
   export VIRUSTOTAL_API_KEY=your-actual-key
   ```

2. **Build and deploy**
   ```bash
   # Build Docker images
   docker-compose -f docker-compose.yml -f docker-compose.prod.yml build
   
   # Deploy
   docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```

## Configuration

### Environment Variables

#### Required:
- `JWT_SECRET`: Secret for JWT token signing
- `DATABASE_URL`: PostgreSQL connection string
- `OPENAI_API_KEY`: OpenAI API key for AI analysis
- `VIRUSTOTAL_API_KEY`: VirusTotal API key for threat intelligence

#### Optional:
- `SPLUNK_BASE_URL`: Splunk management API base (e.g., `https://localhost:8089`)
- `SPLUNK_USERNAME` / `SPLUNK_PASSWORD`: Basic auth for Splunk API
- `SPLUNK_BEARER_TOKEN` or `SPLUNK_SESSION_TOKEN`: Token auth for Splunk API
- `SPLUNK_SEARCH`: Override the default Splunk search used by scripts
  
  See `docs/splunk_integration.md` for a step‑by‑step read‑only test flow.
- `NODE_ENV`: Environment (development/production)
- `PORT`: Backend port (default: 3000)

### Database Setup

The application automatically creates the necessary tables:
- `users`: User accounts and authentication
- `alerts`: Security alerts and analysis results  
- `audit_logs`: Security audit trail

### API Keys Setup

1. **OpenAI API**:
   - Visit https://platform.openai.com/api-keys
   - Create a new secret key
   - Add to `.env` as `OPENAI_API_KEY`

2. **VirusTotal API**:
   - Visit https://www.virustotal.com/gui/user/<username>/apikey
   - Create a new API key
   - Add to `.env` as `VIRUSTOTAL_API_KEY`

## Security Features

### Implemented Security Controls

- **Authentication**: JWT-based auth with secure token management
- **Authorization**: Role-based access control
- **Input Validation**: Comprehensive request validation
- **Rate Limiting**: Protection against brute force attacks
- **CORS**: Configured for secure cross-origin requests
- **Helmet.js**: Security headers protection
- **Audit Logging**: Comprehensive activity tracking
- **Database Encryption**: PostgreSQL TDE integration

### Compliance Features

- **HKMA SA-2/TM-G-1**: Control matrix implemented
- **Data Retention**: Configurable retention policies
- **Audit Trail**: Complete activity logging
- **Encryption**: End-to-end data protection

## Monitoring and Health Checks

### Health Endpoints
- `GET /health`: Application health status
- `GET /metrics`: Performance metrics (authenticated)

### Logging
- Application logs to stdout (Docker captured)
- Audit logs to database table
- Error logging with stack traces

## Testing

### Run Tests
```bash
# Backend tests
cd backend && npm test

# Test coverage
cd backend && npm test -- --coverage
```

### Test Coverage
- Unit tests for API endpoints
- Integration tests for database operations  
- Security test scenarios
- Error handling validation

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Check `DATABASE_URL` format
   - Verify PostgreSQL is running
   - Check network connectivity

2. **API Key Issues**
   - Verify API keys in `.env`
   - Check API service availability
   - Review rate limits

3. **Docker Issues**
   - Ensure Docker daemon is running
   - Check available disk space
   - Verify port availability

### Logs and Debugging

```bash
# View application logs
docker-compose logs backend

# View database logs  
docker-compose logs postgres

# Debug specific service
docker-compose exec backend node -e "console.log('Debug')"
```

## Support

For issues and support:
1. Check the logs using `docker-compose logs`
2. Verify environment configuration
3. Review API key permissions
4. Check database connectivity

## License

This project is proprietary software. All rights reserved.
