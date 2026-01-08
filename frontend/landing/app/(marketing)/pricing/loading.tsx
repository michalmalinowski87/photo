import { Skeleton } from "@/components/ui/skeleton";

export default function PricingLoading() {
  return (
    <div className="w-full py-20">
      <div className="container">
        <div className="flex flex-col items-center justify-center w-full py-8 max-w-xl mx-auto">
          <Skeleton className="h-6 w-24 mb-4" />
          <Skeleton className="h-12 w-full max-w-2xl mb-4" />
          <Skeleton className="h-6 w-full max-w-lg mb-8" />
        </div>
        
        {/* Duration Selector Skeleton */}
        <div className="row justify-content-center mb-5">
          <div className="col-lg-8 col-md-10 col-12">
            <div className="flex justify-center gap-4">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-32" />
            </div>
          </div>
        </div>

        {/* Pricing Cards Skeleton */}
        <div className="row">
          {[1, 2, 3].map((i) => (
            <div key={i} className="col-lg-4 col-md-6 col-12 mb-4">
              <div className="pricing-style-fourteen">
                <Skeleton className="h-32 w-full mb-4" />
                <Skeleton className="h-10 w-full mb-4" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

