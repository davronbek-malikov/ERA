import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Skeleton } from "@/components/ui/feedback";

// Skeleton shaped like a typical page: header, lead, then a card grid.
export function PageLoading({ admin = false }: { admin?: boolean }) {
  return (
    <Section>
      <Container>
        <div className={admin ? "grid gap-6 lg:grid-cols-[15rem,1fr]" : ""}>
          {admin ? <Skeleton className="hidden h-[26rem] rounded-xl lg:block" /> : null}
          <div className="flex flex-col gap-6" role="status" aria-label="Loading">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-full max-w-md" />
            <Skeleton className="h-4 w-full max-w-xl" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: admin ? 3 : 6 }).map((_, index) => (
                <Skeleton key={index} className="h-48 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
