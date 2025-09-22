// Simple test to verify authentication setup
const fs = require('fs');
const path = require('path');

console.log('🔍 Testing Clerk Authentication Integration...\n');

// Check environment variables
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  console.log('✅ Environment file exists');
  
  if (envContent.includes('VITE_CLERK_PUBLISHABLE_KEY')) {
    console.log('✅ Clerk publishable key configured');
  } else {
    console.log('❌ Clerk publishable key missing');
  }
  
  if (envContent.includes('VITE_API_BASE_URL')) {
    console.log('✅ API base URL configured');
  } else {
    console.log('❌ API base URL missing');
  }
} else {
  console.log('❌ Environment file missing');
}

// Check package.json dependencies
const packagePath = path.join(__dirname, 'package.json');
if (fs.existsSync(packagePath)) {
  const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const deps = { ...packageContent.dependencies, ...packageContent.devDependencies };
  
  if (deps['@clerk/clerk-react']) {
    console.log('✅ Clerk React SDK installed:', deps['@clerk/clerk-react']);
  } else {
    console.log('❌ Clerk React SDK missing');
  }
  
  if (deps['@cloudscape-design/components']) {
    console.log('✅ Cloudscape components installed:', deps['@cloudscape-design/components']);
  } else {
    console.log('❌ Cloudscape components missing');
  }
}

// Check key files exist
const keyFiles = [
  'src/hooks/useAuth.ts',
  'src/hooks/useSessionManager.ts',
  'src/components/ProtectedComponent.tsx',
  'src/components/AuthStatus.tsx',
  'src/lib/api.ts',
  'src/lib/tokenValidator.ts'
];

console.log('\n📁 Checking authentication files:');
keyFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file}`);
  }
});

console.log('\n🎯 Authentication integration test complete!');