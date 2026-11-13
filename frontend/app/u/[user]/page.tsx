import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import ProfileViewClient from "@/components/ProfileViewClient";
import { UserProfile } from "@/lib/api";

interface ProfilePageProps {
  params: Promise<{ user: string }>;
}

export default async function UserProfilePage({ params }: ProfilePageProps) {
  const { user } = await params;
  const backendUrl =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.BACKEND_URL ||
    "http://127.0.0.1:8000";
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const res = await fetch(
    `${backendUrl}/api/v1/users/${encodeURIComponent(user)}/profile`,
    {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
      cache: "no-store",
    }
  );

  if (res.status === 404) {
    notFound();
  }
  if (!res.ok) {
    throw new Error(`Failed to load profile: ${res.status}`);
  }

  const profile: UserProfile = await res.json();
  return <ProfileViewClient initialProfile={profile} />;
}
