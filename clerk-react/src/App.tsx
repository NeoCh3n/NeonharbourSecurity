import './App.css';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/clerk-react';

export default function App() {
  return (
    <div style={{ padding: 16 }}>
      <header style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <SignedOut>
          <SignInButton />
          <SignUpButton />
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </header>

      <main style={{ marginTop: 24 }}>
        <SignedOut>
          <p>Please sign in to continue.</p>
        </SignedOut>
        <SignedIn>
          <p>You are signed in. Replace this content with your app.</p>
        </SignedIn>
      </main>
    </div>
  );
}
