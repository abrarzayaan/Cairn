export interface User {
  id: number;
  username: string;
  bio: string;
}

export interface AuthStatus {
  authenticated: boolean;
  user: User | null;
}

export async function fetchMe(): Promise<AuthStatus> {
  try {
    const res = await fetch("/api/v1/auth/me", {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) {
      return { authenticated: false, user: null };
    }
    return await res.json();
  } catch {
    return { authenticated: false, user: null };
  }
}

export async function updateBio(bio: string): Promise<User> {
  const csrf = await ensureCsrfToken();
  const res = await fetch("/api/v1/auth/bio", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrf,
    },
    credentials: "include",
    body: JSON.stringify({ bio }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.detail?.error?.message || err?.detail?.[0]?.msg || "Failed to update bio");
  }
  return await res.json();
}

export async function logoutUser(): Promise<void> {
  await fetch("/api/v1/auth/logout", {
    method: "POST",
    credentials: "include",
  });
}

export async function logoutAllDevices(): Promise<{ ok: boolean; revoked: number }> {
  const csrf = await ensureCsrfToken();
  const res = await fetch("/api/v1/auth/logout-all", {
    method: "POST",
    headers: {
      "X-CSRFToken": csrf,
    },
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Could not sign out all sessions"));
  }
  return await res.json();
}

export async function exportMyNotesZip(): Promise<Blob> {
  const res = await fetch("/api/v1/auth/export", {
    method: "GET",
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Could not export notes"));
  }
  return await res.blob();
}

export async function deleteMyAccount(confirmUsername: string): Promise<void> {
  const csrf = await ensureCsrfToken();
  const res = await fetch("/api/v1/auth/delete-account", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrf,
    },
    credentials: "include",
    body: JSON.stringify({ confirm_username: confirmUsername }),
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Could not delete account"));
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureCsrfToken(): Promise<string> {
  let token = readCookie("csrftoken");
  if (!token) {
    await fetchMe();
    token = readCookie("csrftoken");
  }
  return token || "";
}

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const err = await res.json();
    return (
      err?.detail?.error?.message ||
      err?.detail?.[0]?.msg ||
      (typeof err?.detail === "string" ? err.detail : null) ||
      fallback
    );
  } catch {
    return fallback;
  }
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  book_count: number;
}

export interface BookSummary {
  id: number;
  title: string;
  slug: string;
  description: string;
  visibility: "public" | "private";
  is_published: boolean;
  moderation: string;
  moderation_note?: string;
  author_username: string;
  category: Category;
  chapter_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChapterRef {
  id: number;
  title: string;
  slug: string;
  sequence: number;
  visibility: "public" | "private";
  is_published: boolean;
  summary: string;
  updated_at: string;
}

export interface BookDetail {
  book: BookSummary;
  chapters: ChapterRef[];
}

export interface RenderLink {
  target_ref: string;
  link_type: string;
  status: "resolved" | "missing" | "private" | string;
}

export interface NoteOut {
  id: number;
  title: string;
  slug: string;
  content_md: string;
  content_html: string;
  visibility: "public" | "private";
  is_published: boolean;
  moderation: string;
  moderation_note?: string;
  tags: string[];
  author_username: string;
  book: BookSummary | null;
  sequence: number;
  created_at: string;
  updated_at: string;
  links: RenderLink[];
  cycle_warnings: string[];
}

export interface TitleSuggestion {
  id: number;
  title: string;
  slug: string;
  visibility: string;
}

export interface NoteRevisionItem {
  id: number;
  created_at: string;
}

export interface NoteRevisionDetail {
  id: number;
  content_md: string;
  created_at: string;
}

export async function fetchNoteForEdit(noteId: number): Promise<NoteOut> {
  const res = await fetch(`/api/v1/notes/${noteId}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Note not found"));
  }
  return await res.json();
}

export async function fetchNoteIdBySlug(username: string, slug: string): Promise<number> {
  const res = await fetch(
    `/api/v1/notes/by-slug/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`,
    { cache: "no-store", credentials: "include" }
  );
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Note not found"));
  }
  const data = await res.json();
  return data.note.id;
}

export async function fetchCategories(username?: string): Promise<Category[]> {
  const sp = new URLSearchParams();
  if (username) sp.set("username", username);
  const url = `/api/v1/categories${sp.toString() ? `?${sp.toString()}` : ""}`;
  const res = await fetch(url, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) return [];
  return await res.json();
}

export async function fetchSuggestedCategories(): Promise<Category[]> {
  const res = await fetch("/api/v1/categories/suggested", {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) return [];
  return await res.json();
}

export async function createCategory(payload: {
  name: string;
  description?: string;
}): Promise<Category> {
  const csrf = await ensureCsrfToken();
  const res = await fetch("/api/v1/categories", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrf,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Failed to create category"));
  }
  return await res.json();
}

export async function updateCategory(
  categoryId: number,
  payload: {
    name?: string;
    description?: string;
  }
): Promise<Category> {
  const csrf = await ensureCsrfToken();
  const res = await fetch(`/api/v1/categories/${categoryId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrf,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Failed to update category"));
  }
  return await res.json();
}

export async function deleteCategory(categoryId: number): Promise<void> {
  const csrf = await ensureCsrfToken();
  const res = await fetch(`/api/v1/categories/${categoryId}`, {
    method: "DELETE",
    headers: {
      "X-CSRFToken": csrf,
    },
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Failed to delete category"));
  }
}

export async function fetchMyBooks(): Promise<BookSummary[]> {
  const res = await fetch("/api/v1/books/mine", {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) return [];
  return await res.json();
}

export async function fetchBooks(params?: {
  category?: string;
  username?: string;
  limit?: number;
  offset?: number;
}): Promise<BookSummary[]> {
  const sp = new URLSearchParams();
  if (params?.category) sp.set("category", params.category);
  if (params?.username) sp.set("username", params.username);
  if (params?.limit !== undefined) sp.set("limit", String(params.limit));
  if (params?.offset !== undefined) sp.set("offset", String(params.offset));
  const res = await fetch(`/api/v1/books?${sp.toString()}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) return [];
  return await res.json();
}

export async function fetchBookBySlug(username: string, slug: string): Promise<BookDetail> {
  const res = await fetch(
    `/api/v1/books/by-slug/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`,
    { cache: "no-store", credentials: "include" }
  );
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Book not found"));
  }
  return await res.json();
}

export async function createBook(payload: {
  title: string;
  category_id?: number | null;
  description?: string;
  visibility: "public" | "private";
  is_published?: boolean;
  slug?: string;
}): Promise<BookSummary> {
  const csrf = await ensureCsrfToken();
  const res = await fetch("/api/v1/books", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrf,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Failed to create book"));
  }
  return await res.json();
}

export async function updateBook(
  bookId: number,
  payload: {
    title?: string;
    category_id?: number;
    description?: string;
    visibility?: "public" | "private";
    is_published?: boolean;
    slug?: string;
  }
): Promise<BookSummary> {
  const csrf = await ensureCsrfToken();
  const res = await fetch(`/api/v1/books/${bookId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrf,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Failed to update book"));
  }
  return await res.json();
}

export async function deleteBook(bookId: number): Promise<void> {
  const csrf = await ensureCsrfToken();
  const res = await fetch(`/api/v1/books/${bookId}`, {
    method: "DELETE",
    headers: {
      "X-CSRFToken": csrf,
    },
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Failed to delete book"));
  }
}

export async function reorderBookChapters(
  bookId: number,
  ordered_note_ids: number[]
): Promise<ChapterRef[]> {
  const csrf = await ensureCsrfToken();
  const res = await fetch(`/api/v1/books/${bookId}/reorder`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrf,
    },
    credentials: "include",
    body: JSON.stringify({ ordered_note_ids }),
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Failed to reorder chapters"));
  }
  return await res.json();
}

export async function createNote(payload: {
  title: string;
  content_md: string;
  tags: string[];
  visibility: "public" | "private";
  is_published?: boolean;
  slug?: string;
  book_id?: number | null;
  sequence?: number | null;
}): Promise<NoteOut> {
  const csrf = await ensureCsrfToken();
  const res = await fetch("/api/v1/notes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrf,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Failed to create note"));
  }
  return await res.json();
}

export async function updateNote(
  noteId: number,
  payload: {
    title?: string;
    content_md?: string;
    tags?: string[];
    visibility?: "public" | "private";
    is_published?: boolean;
    slug?: string;
    book_id?: number | null;
    sequence?: number;
  }
): Promise<NoteOut> {
  const csrf = await ensureCsrfToken();
  const res = await fetch(`/api/v1/notes/${noteId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrf,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Failed to save note"));
  }
  return await res.json();
}

export async function deleteNote(noteId: number): Promise<void> {
  const csrf = await ensureCsrfToken();
  const res = await fetch(`/api/v1/notes/${noteId}`, {
    method: "DELETE",
    headers: {
      "X-CSRFToken": csrf,
    },
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Failed to delete note"));
  }
}

export async function renderMarkdownPreview(content_md: string): Promise<{
  html: string;
  links: RenderLink[];
}> {
  const csrf = await ensureCsrfToken();
  const res = await fetch("/api/v1/render", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrf,
    },
    credentials: "include",
    body: JSON.stringify({ content_md }),
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Failed to render preview"));
  }
  return await res.json();
}

export async function fetchTitleSuggestions(q: string): Promise<TitleSuggestion[]> {
  const res = await fetch(`/api/v1/titles?q=${encodeURIComponent(q)}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) {
    return [];
  }
  return await res.json();
}

export async function fetchNoteRevisions(noteId: number): Promise<NoteRevisionItem[]> {
  const res = await fetch(`/api/v1/notes/${noteId}/revisions`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) {
    return [];
  }
  return await res.json();
}

export async function fetchNoteRevisionDetail(
  noteId: number,
  revisionId: number
): Promise<NoteRevisionDetail> {
  const res = await fetch(`/api/v1/notes/${noteId}/revisions/${revisionId}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Failed to load revision"));
  }
  return await res.json();
}

export interface SearchHit {
  id: number;
  title: string;
  slug: string;
  author_username: string;
  visibility: "public" | "private";
  is_published: boolean;
  tags: string[];
  snippet: string;
  book_id?: number | null;
  book_title?: string | null;
  book_slug?: string | null;
  category_name?: string | null;
  sequence?: number;
  updated_at: string;
}

export interface UserSearchHit {
  username: string;
  bio: string;
  published_book_count: number;
  published_note_count: number;
  public_book_count: number;
  public_note_count: number;
}

export interface SearchResponse {
  total: number;
  limit: number;
  offset: number;
  results: SearchHit[];
  books: BookSummary[];
  categories: Category[];
  users: UserSearchHit[];
}

export async function searchNotes(params: {
  q?: string;
  tag?: string;
  category?: string;
  author?: string;
  scope?: "all" | "mine";
  type?: "all" | "notes" | "books" | "categories" | "users";
  limit?: number;
  offset?: number;
}): Promise<SearchResponse> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.tag) sp.set("tag", params.tag);
  if (params.category) sp.set("category", params.category);
  if (params.author) sp.set("author", params.author);
  if (params.scope) sp.set("scope", params.scope);
  if (params.type) sp.set("type", params.type);
  if (params.limit !== undefined) sp.set("limit", String(params.limit));
  if (params.offset !== undefined) sp.set("offset", String(params.offset));

  const res = await fetch(`/api/v1/search?${sp.toString()}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Search failed"));
  }
  return await res.json();
}

export async function submitReport(payload: {
  note_id: number;
  reason: "spam" | "abuse" | "copyright" | "other";
  details: string;
}): Promise<{ id: number; status: string }> {
  const csrf = await ensureCsrfToken();
  const res = await fetch("/api/v1/reports", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrf,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, "Failed to submit report"));
  }
  return await res.json();
}

export interface WorkspaceNote extends SearchHit {
  prereq_count: number;
}

export interface TopicCount {
  name: string;
  count: number;
}

export interface HomeFeed {
  recent_public: WorkspaceNote[];
  recent_books: BookSummary[];
  categories: Category[];
  topics: TopicCount[];
  my_notes: WorkspaceNote[];
  my_books: BookSummary[];
  stats: {
    total: number;
    public: number;
    private: number;
  };
  book_stats: {
    total: number;
    public: number;
    private: number;
  };
}

export interface UserProfile {
  username: string;
  bio: string;
  created_at: string;
  books: BookSummary[];
  categories: Category[];
  notes: WorkspaceNote[];
  topics: TopicCount[];
  is_self: boolean;
}

export async function fetchHomeFeed(): Promise<HomeFeed> {
  const res = await fetch("/api/v1/home", {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error("Failed to load workspace feed");
  }
  return await res.json();
}

