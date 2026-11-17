import { AuthFlow } from '../components/auth/AuthFlow';

/**
 * `/auth` — first-launch MANDATORY email + 6-digit-code onboarding (Phase-2).
 *
 * OnboardingGate redirects here whenever synced mode is on and there is no verified
 * (non-anonymous) session yet (and the DEV bypass is off). The flow itself lives in
 * `components/auth/AuthFlow`; on success SessionContext flips `needsAuth` false and the
 * gate routes onward (to pet setup for a brand-new install, else the tabs).
 */
export default function AuthRoute() {
  return <AuthFlow />;
}
