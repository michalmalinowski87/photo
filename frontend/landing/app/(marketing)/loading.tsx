import { Skeleton } from "@/components/ui/skeleton";

export default function MarketingLoading() {
  return (
    <div className="w-full">
      {/* Hero Section Skeleton */}
      <section className="header-area header-eight">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-6 col-md-12 col-12">
              <div className="header-content">
                <Skeleton className="h-12 w-3/4 mb-4" />
                <Skeleton className="h-6 w-full mb-2" />
                <Skeleton className="h-6 w-5/6 mb-4" />
                <Skeleton className="h-10 w-48" />
              </div>
            </div>
            <div className="col-lg-6 col-md-12 col-12">
              <Skeleton className="w-full aspect-[4/3] rounded-lg" />
            </div>
          </div>
        </div>
      </section>

      {/* About Section Skeleton */}
      <section className="about-area about-five py-20">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-6 col-12">
              <Skeleton className="w-full aspect-[5/6] rounded-lg" />
            </div>
            <div className="col-lg-6 col-12">
              <Skeleton className="h-8 w-32 mb-4" />
              <Skeleton className="h-10 w-3/4 mb-6" />
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section Skeleton */}
      <section className="services-area services-eight py-20">
        <div className="container">
          <div className="row">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="col-lg-4 col-md-6 mb-6">
                <div className="single-services">
                  <Skeleton className="h-16 w-16 rounded-full mb-4" />
                  <Skeleton className="h-6 w-32 mb-2" />
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

