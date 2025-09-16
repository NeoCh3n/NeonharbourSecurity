import { SignedIn, SignedOut, SignIn } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';
import { clerkAppearance } from '../config/clerkAppearance';

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <SignedOut>
          <SignIn afterSignInUrl="/report" signUpUrl="/login" appearance={clerkAppearance} />
        </SignedOut>
        <SignedIn>
          <Navigate to="/report" replace />
        </SignedIn>
      </div>
    </div>
  );
}
