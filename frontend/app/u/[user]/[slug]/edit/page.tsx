import NoteEditor from "@/components/NoteEditor";

interface EditNotePageProps {
  params: Promise<{ user: string; slug: string }>;
}

export default async function EditNotePage({ params }: EditNotePageProps) {
  const { user, slug } = await params;
  return <NoteEditor mode="edit" username={user} slug={slug} />;
}

