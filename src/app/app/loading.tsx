import { Seam } from "../../components/brand/seam";
import { Skeleton } from "../../components/ui/layout";

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <Seam state="recovering" loading className="h-8 w-56 text-fg" label="Loading" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </div>
  );
}
