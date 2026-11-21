import { cache } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import ProfileViewClient from "@/components/ProfileViewClient";
import { UserProfile } from "@/lib/api";

interface ProfilePageProps {
  params: Promise<{ user: string }>;
}

const getProfileData = cache(async (user: string, cookieHeader: string) => {
  const backendUrl =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.BACKEND_URL ||
    "http://127.0.0.1:8000";
  const res = await fetch(
    `${backendUrl}/api/v1/users/${encodeURIComponent(user)}/profile`,
    {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
      cache: "no-store",
    },
  );
  return { status: res.status, ok: res.ok, data: res.ok ? ((await res.json()) as UserProfile) : null };
});

export async function generateMetadata({
  params,
}: ProfilePageProps): Promise<Metadata> {
  const { user } = await params;

  try {
    const cookieStore = await cookies();
    const { ok, data: profile } = await getProfileData(user, cookieStore.toString());
    if (!ok || !profile) {
      return {
        title: "Cairn",
        robots: { index: false, follow: false },
      };
    }
    const title = `@${profile.username}`;
    const description =
      profile.bio ||
      `Public notes and documentation books by @${profile.username} on Cairn.`;
    const canonicalPath = `/u/${profile.username}`;

    return {
      title,
      description,
      alternates: {
        canonical: canonicalPath,
      },
      openGraph: {
        type: "profile",
        siteName: "Cairn",
        title: `@${profile.username} · Cairn`,
        description,
        url: canonicalPath,
      },
    };
  } catch {
    return { title: `@${user}` };
  }
}

export default async function UserProfilePage({ params }: ProfilePageProps) {
  const { user } = await params;
  const cookieStore = await cookies();
  const { status, ok, data: profile } = await getProfileData(user, cookieStore.toString());

  if (status === 404 || !profile) {
    notFound();
  }
  if (!ok) {
    throw new Error(`Failed to load profile: ${status}`);
  }

  return <ProfileViewClient initialProfile={profile} />;
}
