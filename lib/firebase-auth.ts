import { signInAnonymously, User } from "firebase/auth";
import { getFirebaseAuth } from "./firebase";

export async function signInAnonymous(): Promise<User | null> {
  const auth = getFirebaseAuth();
  if (!auth) {
    console.warn("Firebase Auth not initialized. Check environment variables.");
    return null;
  }

  try {
    const userCredential = await signInAnonymously(auth);
    return userCredential.user;
  } catch (error) {
    console.error("Error signing in anonymously:", error);
    return null;
  }
}

export function getCurrentUser(): User | null {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  return auth.currentUser;
}
