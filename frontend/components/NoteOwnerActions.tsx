"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchMe } from "@/lib/api";

interface NoteOwnerActionsProps {
  authorUsername: string;
  slug: string;
}

export default function NoteOwnerActions({
  authorUsername,
  slug,
}: NoteOwnerActionsProps) {
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    fetchMe().then((res) => {
      if (
        res.authenticated &&
        res.user &&
        res.user.username.toLowerCase() === authorUsername.toLowerCase()
      ) {
        setIsOwner(true);
      }
    });
  }, [authorUsername]);

  if (!isOwner) return null;

  return (
    <>
      <span>&middot;</span>
      <Link
        href={`/u/${authorUsername}/${slug}/edit`}
        className="text-accent hover:underline"
      >
        Edit
      </Link>
    </>
  );
}

