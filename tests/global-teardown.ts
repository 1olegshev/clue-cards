import { execSync } from 'child_process';

/**
 * Global teardown for Playwright tests.
 * Cleans up any orphaned rooms left by tests.
 * 
 * Requires Firebase Admin credentials:
 * - Run `gcloud auth application-default login` before tests, OR
 * - Set GOOGLE_APPLICATION_CREDENTIALS to a service account key
 */
async function globalTeardown() {
  console.log('\n🧹 Cleaning up test rooms...');
  
  try {
    // Run cleanup script with timeout (60 seconds max)
    const result = execSync('npm run cleanup:rooms -- --disconnected', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000, // 60 second timeout
    });
    
    // Extract summary from output
    const lines = result.split('\n');
    const summaryLines = lines.filter(l => 
      l.includes('Rooms scanned') || 
      l.includes('Deleted') || 
      l.includes('Kept') ||
      l.includes('[delete]')
    );
    
    if (summaryLines.length > 0) {
      console.log(summaryLines.join('\n'));
    } else {
      console.log('✓ Cleanup completed');
    }
  } catch (error: unknown) {
    // Don't fail tests if cleanup fails - just log it
    if (error && typeof error === 'object' && 'killed' in error && error.killed) {
      console.warn('⚠️  Cleanup timed out (skipped)');
    } else if (error && typeof error === 'object' && 'stderr' in error) {
      const stderr = (error as { stderr?: string }).stderr;
      console.warn('⚠️  Cleanup failed:', stderr || 'Unknown error');
    } else {
      console.warn('⚠️  Cleanup skipped:', error instanceof Error ? error.message : 'Unknown error');
    }
  }
}

export default globalTeardown;
