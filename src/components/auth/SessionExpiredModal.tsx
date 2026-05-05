import { useEntraAuthStore } from "../../store/entraAuth.store";

export function SessionExpiredModal() {
  const sessionExpired = useEntraAuthStore((s) => s.sessionExpired);
  const login = useEntraAuthStore((s) => s.login);

  if (!sessionExpired) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#fff8c5] flex items-center justify-center">
            <svg className="w-5 h-5 text-[#9a6700]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-[#1f2328]">Session Expired</h2>
        </div>
        <p className="text-sm text-[#656d76] mb-6">
          Your sign-in session has expired due to inactivity. Please sign in again to continue.
        </p>
        <div className="flex justify-end">
          <button
            onClick={login}
            className="px-4 py-2 text-sm font-medium text-white bg-[#1a7f37] rounded-md hover:bg-[#168030] transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
}
