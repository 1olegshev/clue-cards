interface ConnectionStatusProps {
  isConnecting: boolean;
  connectionError: string | null;
}

/**
 * Loading skeleton that mimics the lobby layout.
 */
function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header skeleton */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
            <div className="h-6 w-24 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
          </div>
          <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
        </div>

        {/* Main content area */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          {/* Title skeleton */}
          <div className="text-center mb-8">
            <div className="h-8 w-64 bg-gray-200 dark:bg-gray-700 rounded-lg mx-auto mb-2 animate-pulse"></div>
            <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded mx-auto animate-pulse"></div>
          </div>

          {/* Teams skeleton */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Red team */}
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-6">
              <div className="h-6 w-24 bg-red-200 dark:bg-red-800 rounded mb-4 animate-pulse"></div>
              <div className="space-y-3">
                <div className="h-12 bg-red-100 dark:bg-red-900/40 rounded-lg animate-pulse"></div>
                <div className="h-12 bg-red-100 dark:bg-red-900/40 rounded-lg animate-pulse"></div>
              </div>
            </div>
            {/* Blue team */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6">
              <div className="h-6 w-24 bg-blue-200 dark:bg-blue-800 rounded mb-4 animate-pulse"></div>
              <div className="space-y-3">
                <div className="h-12 bg-blue-100 dark:bg-blue-900/40 rounded-lg animate-pulse"></div>
                <div className="h-12 bg-blue-100 dark:bg-blue-900/40 rounded-lg animate-pulse"></div>
              </div>
            </div>
          </div>

          {/* Loading indicator */}
          <div className="flex flex-col items-center justify-center py-8">
            <div className="relative">
              <div className="h-16 w-16 rounded-full border-4 border-gray-200 dark:border-gray-700"></div>
              <div className="absolute inset-0 h-16 w-16 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
            </div>
            <p className="mt-4 text-gray-600 dark:text-gray-400 font-medium">
              Connecting to room
              <span className="inline-flex ml-1">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ConnectionStatus({ isConnecting, connectionError }: ConnectionStatusProps) {
  const isNameTaken = connectionError === "Name already taken";
  
  const handleChooseDifferentName = () => {
    // Remove name param from URL to show the name form again
    const url = new URL(window.location.href);
    url.searchParams.delete("name");
    window.location.href = url.toString();
  };

  // Show skeleton loading UI
  if (isConnecting && !connectionError) {
    return <LoadingSkeleton />;
  }

  // Show error state
  if (connectionError) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-linear-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center max-w-md">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {isNameTaken ? "Name Already Taken" : "Connection Failed"}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {isNameTaken 
                ? "Someone in this room is already using that name. Please choose a different one."
                : connectionError
              }
            </p>
            <div className="flex gap-3 justify-center">
              {isNameTaken ? (
                <button
                  onClick={handleChooseDifferentName}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-all"
                >
                  Choose Different Name
                </button>
              ) : (
                <>
                  <button
                    onClick={() => window.location.reload()}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-all"
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => window.location.href = "/"}
                    className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-6 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
                  >
                    Go Home
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return null;
}
