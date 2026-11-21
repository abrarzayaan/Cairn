export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 py-4">
      <div className="h-7 w-56 animate-pulse rounded-sm bg-surface-2" />
      <div className="space-y-3">
        <div className="h-4 w-full max-w-2xl animate-pulse rounded-sm bg-surface-1" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded-sm bg-surface-1" />
      </div>
      <div className="grid gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-36 animate-pulse rounded-md bg-surface-1"
          />
        ))}
      </div>
    </div>
  );
}
