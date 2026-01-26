import RoomClient from "./RoomClient";

// Required for static export with optional catch-all routes
// For optional catch-all [[...code]], returning empty object generates /room/ base route
// Firebase Hosting rewrites handle serving this page for any /room/* URL
export async function generateStaticParams() {
  return [{ code: [] }];
}

export default function RoomPage() {
  return <RoomClient />;
}
