# Clerk Authentication Integration Guide

This document provides comprehensive instructions for setting up and deploying NeoHarbor Security with Clerk authentication.

## Overview

NeoHarbor Security supports both demo mode (for development/testing) and production-ready Clerk authentication. The system is designed to seamlessly switch between modes based on environment configuration.

## Current Implementation Status

✅ **Implemented Features:**
- Demo authentication system with user management
- Clerk authentication interface and configuration
- Environment-based mode switching
- User profile management
- Secure logout functionality
- Custom styling for Clerk components

🔄 **Ready for Production:**
- Environment configuration system
- Authentication service abstraction
- User state management
- Error handling and callbacks

## Environment Configuration

### Development Mode
```env
NODE_ENV=development
REACT_APP_ENVIRONMENT=development
# Demo mode is enabled by default in development
```

### Staging Mode
```env
NODE_ENV=production
REACT_APP_ENVIRONMENT=staging
REACT_APP_CLERK_PUBLISHABLE_KEY=pk_test_your_staging_key_here
REACT_APP_ENABLE_DEMO=true
```

### Production Mode
```env
NODE_ENV=production
REACT_APP_ENVIRONMENT=production
REACT_APP_CLERK_PUBLISHABLE_KEY=pk_live_your_production_key_here
REACT_APP_ENABLE_DEMO=false
REACT_APP_FORCE_CLERK=true
```

## Clerk Setup Instructions

### 1. Create Clerk Application

1. Sign up at [clerk.com](https://clerk.com)
2. Create a new application
3. Choose your authentication methods (email/password, social logins, etc.)
4. Configure your domain settings

### 2. Configure Authentication Methods

**Recommended for NeoHarbor Security:**
- Email/Password authentication ✅
- Google OAuth (optional) ✅
- Microsoft OAuth (for enterprise) ✅
- Multi-factor authentication ✅

### 3. Environment Variables Setup

Create environment-specific `.env` files:

#### `.env.local` (Development)
```env
REACT_APP_CLERK_PUBLISHABLE_KEY=pk_test_your_development_key
REACT_APP_ENVIRONMENT=development
```

#### `.env.staging`
```env
REACT_APP_CLERK_PUBLISHABLE_KEY=pk_test_your_staging_key
REACT_APP_ENVIRONMENT=staging
REACT_APP_API_BASE_URL=https://staging-api.neoharbor.com
```

#### `.env.production`
```env
REACT_APP_CLERK_PUBLISHABLE_KEY=pk_live_your_production_key
REACT_APP_ENVIRONMENT=production
REACT_APP_API_BASE_URL=https://api.neoharbor.com
REACT_APP_FORCE_CLERK=true
```

### 4. Domain Configuration

Configure these redirect URLs in your Clerk dashboard:

**Development:**
- http://localhost:3000
- http://localhost:3000/data-sources

**Staging:**
- https://staging.neoharbor.com
- https://staging.neoharbor.com/data-sources

**Production:**
- https://app.neoharbor.com
- https://app.neoharbor.com/data-sources

**Important:** Use the new Clerk redirect props in your configuration:
- `fallbackRedirectUrl` - General fallback for all authentication flows
- `signInFallbackRedirectUrl` - Specific fallback for sign-in
- `signUpFallbackRedirectUrl` - Specific fallback for sign-up

**Deprecated props to avoid:**
- `afterSignInUrl` (use `signInFallbackRedirectUrl` or `forceRedirectUrl`)
- `afterSignUpUrl` (use `signUpFallbackRedirectUrl` or `forceRedirectUrl`)
- `redirectUrl` (use `fallbackRedirectUrl` or `forceRedirectUrl`)

## Code Integration Points

### Authentication Service (`/services/auth.ts`)

The authentication service provides a unified interface:

```typescript
import { authManager, getAuthConfig } from './services/auth';

// Initialize authentication
authManager.setCallbacks({
  onSignIn: (user) => console.log('User signed in:', user),
  onSignOut: () => console.log('User signed out'),
  onError: (error) => console.error('Auth error:', error),
});

// Check authentication status
const isAuthenticated = authManager.isAuthenticated();
const currentUser = authManager.getCurrentUser();
```

### Environment Configuration (`/config/environment.ts`)

Environment-specific settings are centrally managed:

```typescript
import { config, authConfig, isProduction } from './config/environment';

// Use configuration throughout the app
const clerkKey = authConfig.clerkPublishableKey;
const enableDemo = authConfig.enableDemo;
```

### Login Component (`/components/LoginPage.tsx`)

The login page automatically adapts based on environment:

- **Development:** Shows both demo and Clerk options
- **Staging:** Shows both options (for testing)
- **Production:** Shows only Clerk authentication (unless demo explicitly enabled)

## Deployment Checklist

### Pre-deployment
- [ ] Clerk application created and configured
- [ ] Environment variables set correctly
- [ ] Domain redirects configured in Clerk dashboard
- [ ] Authentication methods enabled (email, social logins)
- [ ] User roles and permissions configured (if needed)

### Testing
- [ ] Demo mode works in development
- [ ] Clerk authentication works in staging
- [ ] User profile data displays correctly
- [ ] Logout functionality works
- [ ] Error handling works for auth failures

### Production
- [ ] Production Clerk keys configured
- [ ] Demo mode disabled (unless specifically needed)
- [ ] Force Clerk authentication enabled
- [ ] All environment variables validated
- [ ] Authentication flows tested end-to-end

## Security Considerations

### Production Security
1. **API Keys:** Store Clerk publishable keys securely
2. **Environment Separation:** Use different Clerk applications for staging/production
3. **HTTPS:** Ensure all authentication flows use HTTPS
4. **Session Management:** Configure appropriate session timeouts
5. **MFA:** Enable multi-factor authentication for admin users

### Data Protection
1. **User Data:** Clerk handles user data storage securely
2. **Tokens:** JWT tokens are managed by Clerk
3. **Privacy:** Configure data retention policies
4. **GDPR:** Enable GDPR compliance features if needed

## Troubleshooting

### Common Issues

**Issue:** "Missing Publishable Key" error
**Solution:** Ensure `REACT_APP_CLERK_PUBLISHABLE_KEY` is set correctly

**Issue:** Redirect loops after sign-in
**Solution:** Check redirect URLs in Clerk dashboard match your deployment URLs

**Issue:** Styling issues with Clerk components
**Solution:** Verify custom CSS in `/styles/globals.css` is loading correctly

**Issue:** Demo mode not working
**Solution:** Check environment configuration and ensure demo mode is enabled

**Issue:** Clerk redirect URL warnings
**Solution:** Ensure you're using the new redirect props (`fallbackRedirectUrl`, `signInFallbackRedirectUrl`, `signUpFallbackRedirectUrl`) and not the legacy props (`afterSignInUrl`, `afterSignUpUrl`, `redirectUrl`)

**Issue:** Authentication not working after sign-in
**Solution:** Check that redirect URLs in Clerk dashboard match your deployment URLs exactly

### Debug Mode

Enable debug logging by setting:
```env
REACT_APP_DEBUG=true
```

This will log authentication events and configuration details to the console.

## Future Enhancements

### Planned Features
1. **Role-based Access Control (RBAC):** Implement user roles for different security clearance levels
2. **Single Sign-On (SSO):** SAML/OIDC integration for enterprise customers
3. **Audit Logging:** Enhanced logging for compliance requirements
4. **API Authentication:** Backend API integration with Clerk JWTs
5. **Mobile Authentication:** Mobile app authentication flows

### Integration Opportunities
1. **AWS Cognito:** Alternative authentication provider
2. **Active Directory:** Enterprise directory integration
3. **OAuth Providers:** Additional social login options
4. **Hardware Tokens:** YubiKey and hardware MFA support

## Support and Maintenance

### Monitoring
- Monitor authentication success/failure rates
- Track user session durations
- Alert on authentication errors

### Updates
- Keep Clerk SDK updated to latest version
- Review and update authentication policies quarterly
- Test authentication flows after major updates

### Documentation
- Keep this guide updated with any configuration changes
- Document any custom authentication flows
- Maintain environment variable documentation

---

**For technical support:** Contact the NeoHarbor Security development team
**For Clerk-specific issues:** Refer to [Clerk Documentation](https://clerk.com/docs) or contact Clerk support