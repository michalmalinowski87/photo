import { Skeleton } from "@/components/ui/skeleton";

export default function FeaturesLoading() {
  return (
    <div className="w-full py-20">
      <div className="container">
        <div className="flex flex-col items-center justify-center w-full py-8 max-w-xl mx-auto">
          <Skeleton className="h-6 w-24 mb-4" />
          <Skeleton className="h-12 w-full max-w-2xl mb-4" />
          <Skeleton className="h-6 w-full max-w-lg mb-8" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-48 w-full rounded-lg" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

