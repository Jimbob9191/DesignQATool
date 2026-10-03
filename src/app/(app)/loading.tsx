import { Skeleton } from "@/components/ui/skeleton";

// Shown inside the app shell the moment a nav link is clicked, while the
// destination page's data loads. Next prefetches this boundary for every
// visible <Link>, so navigation responds instantly instead of waiting on the
// server render.
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </div>
  );
}
