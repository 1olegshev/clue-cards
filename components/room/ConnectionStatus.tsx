interface ConnectionStatusProps {
  isConnecting: boolean;
  connectionError: string | null;
}

export default function ConnectionStatus({ isConnecting, connectionError }: ConnectionStatusProps) {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        {isConnecting && !connectionError && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Connecting to room...</p>
          </>
        )}
        {connectionError && (
          <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-lg p-6">
            <svg className="w-12 h-12 text-red-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-bold text-red-800 dark:text-red-400 mb-2">Connection Failed</h2>
            <p className="text-red-700 dark:text-red-300 mb-4">{connectionError}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-red-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-red-700 transition-all"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
