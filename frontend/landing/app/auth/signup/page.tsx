"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { initAuth, signUp, redirectToCognito } from '@/lib/auth';
import { toast } from 'sonner';
import {
  PasswordInputWithStrength,
  PasswordInputWithToggle,
  PasswordStrengthResult,
} from '@/components/ui/password-strength-validator';

export default function SignUpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrengthResult | null>(null);
  const returnUrl = searchParams.get('returnUrl');

  useEffect(() => {
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;

    if (userPoolId && clientId) {
      initAuth(userPoolId, clientId);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (password !== confirmPassword) {
      toast.error('Hasła nie są identyczne');
      setIsLoading(false);
      return;
    }

    if (!passwordStrength || !passwordStrength.meetsMinimum) {
      toast.error('Hasło nie spełnia wymagań bezpieczeństwa');
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      toast.error('Hasło musi mieć co najmniej 8 znaków');
      setIsLoading(false);
      return;
    }

    try {
      const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
      const clientId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;

      if (!userPoolId || !clientId) {
        throw new Error('Auth configuration missing');
      }

      await signUp(email, password);
      toast.success('Konto utworzone! Sprawdź email, aby potwierdzić konto.');
      
      // Redirect to confirm email page
      router.push(`/auth/confirm-email?email=${encodeURIComponent(email)}`);
    } catch (error: any) {
      console.error('Sign up error:', error);
      let errorMessage = 'Wystąpił błąd podczas rejestracji';
      
      if (error.code === 'UsernameExistsException') {
        errorMessage = 'Użytkownik z tym emailem już istnieje';
      } else if (error.code === 'InvalidPasswordException') {
        errorMessage = 'Hasło nie spełnia wymagań';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCognitoSignUp = () => {
    const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3001';
    const returnUrlToUse = returnUrl || `${dashboardUrl}/`;
    redirectToCognito(returnUrlToUse);
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" 
      style={{ 
        backgroundColor: '#FFFAF5', // var(--light-3) - light beige background
        color: '#2D241F' // var(--dark-2)
      }}
    >
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Link href="/" className="inline-block mb-6">
            <span className="brand-text-primary">
              PhotoCloud
            </span>
          </Link>
          <div className="w-full border-t mb-6" style={{ borderColor: '#E3D3C4' }}></div>
          <h2 className="text-3xl font-bold" style={{ color: '#1E1A17' }}>Zarejestruj się</h2>
          <p className="mt-2 text-sm" style={{ color: '#5A4D42' }}>
            Utwórz konto i otrzymaj 1 darmową galerię do przetestowania
          </p>
        </div>

        <div className="rounded-lg shadow-lg p-8 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#E3D3C4' }}>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2" style={{ color: '#2D241F' }}>
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none relative block w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                style={{
                  borderColor: '#E3D3C4', // var(--gray-3)
                  color: '#2D241F', // var(--dark-2)
                  backgroundColor: '#FFFFFF', // var(--white)
                }}
                placeholder="twoj@email.com"
                onFocus={(e) => {
                  e.target.style.borderColor = '#8B6F57'; // var(--primary)
                  e.target.style.boxShadow = '0 0 0 2px rgba(139, 111, 87, 0.2)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#E3D3C4'; // var(--gray-3)
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2" style={{ color: 'var(--dark-2)' }}>
                Hasło
              </label>
              <PasswordInputWithStrength
                id="password"
                name="password"
                password={password}
                onPasswordChange={(value) => {
                  setPassword(value);
                }}
                onStrengthChange={setPasswordStrength}
                minLength={8}
                required
                autoComplete="new-password"
                placeholder="Wprowadź hasło"
                className="appearance-none relative block w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                style={{
                  borderColor: '#E3D3C4', // var(--gray-3)
                  color: '#2D241F', // var(--dark-2)
                  backgroundColor: '#FFFFFF', // var(--white)
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#8B6F57'; // var(--primary)
                  e.target.style.boxShadow = '0 0 0 2px rgba(139, 111, 87, 0.2)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#E3D3C4'; // var(--gray-3)
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2" style={{ color: '#2D241F' }}>
                Potwierdź hasło
              </label>
              <PasswordInputWithToggle
                id="confirmPassword"
                name="confirmPassword"
                value={confirmPassword}
                onValueChange={(value) => setConfirmPassword(value)}
                required
                autoComplete="new-password"
                placeholder="Powtórz hasło"
                className="appearance-none relative block w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                style={{
                  borderColor: confirmPassword && password !== confirmPassword ? '#C9675A' : '#E3D3C4', // var(--error) : var(--gray-3)
                  color: '#2D241F', // var(--dark-2)
                  backgroundColor: '#FFFFFF', // var(--white)
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#8B6F57'; // var(--primary)
                  e.target.style.boxShadow = '0 0 0 2px rgba(139, 111, 87, 0.2)';
                }}
                onBlur={(e) => {
                  if (confirmPassword && password !== confirmPassword) {
                    e.target.style.borderColor = '#C9675A'; // var(--error)
                  } else {
                    e.target.style.borderColor = '#E3D3C4'; // var(--gray-3)
                  }
                  e.target.style.boxShadow = 'none';
                }}
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="mt-1 text-xs" style={{ color: '#C9675A' }}>
                  Hasła nie są identyczne
                </p>
              )}
              {confirmPassword && password === confirmPassword && password.length > 0 && (
                <p className="mt-1 text-xs" style={{ color: '#8CA68D' }}>
                  Hasła są identyczne
                </p>
              )}
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading || !passwordStrength?.meetsMinimum || password !== confirmPassword}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                style={{
                  backgroundColor: isLoading || !passwordStrength?.meetsMinimum || password !== confirmPassword ? '#F0E4D7' : '#8B6F57', // var(--gray-4) : var(--primary)
                }}
                onMouseEnter={(e) => {
                  if (!isLoading && passwordStrength?.meetsMinimum && password === confirmPassword) {
                    e.currentTarget.style.backgroundColor = '#7A5F4A'; // var(--primary-dark)
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading && passwordStrength?.meetsMinimum && password === confirmPassword) {
                    e.currentTarget.style.backgroundColor = '#8B6F57'; // var(--primary)
                  }
                }}
              >
                {isLoading ? 'Tworzenie konta...' : 'Rozpocznij za darmo'}
              </button>
            </div>
          </form>
        </div>

        <div className="text-center">
          <p className="text-sm mb-4" style={{ color: '#5A4D42' }}>
            Po rejestracji otrzymasz email z kodem weryfikacyjnym
          </p>
          <p className="text-sm" style={{ color: '#5A4D42' }}>
            Rejestrując się, akceptujesz nasze{' '}
            <Link href="/terms" className="font-medium hover:opacity-80 transition-opacity" style={{ color: '#8B6F57' }}>
              Warunki korzystania
            </Link>
            {' '}i{' '}
            <Link href="/privacy" className="font-medium hover:opacity-80 transition-opacity" style={{ color: '#8B6F57' }}>
              Politykę prywatności
            </Link>
          </p>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" style={{ borderColor: '#E3D3C4' }}></div>
          </div>
        </div>

        <div className="text-center">
          <p className="text-sm" style={{ color: '#5A4D42' }}>
            Masz już konto?{' '}
            <Link href="/auth/login" className="font-medium hover:opacity-80 transition-opacity" style={{ color: '#8B6F57' }}>
              Zaloguj się
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
