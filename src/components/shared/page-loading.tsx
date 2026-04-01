import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";

export function PageLoading({ admin = false }: { admin?: boolean }) {
  return (
    <Section>
      <Container className={admin ? "py-4" : ""}>
        <div className={`grid gap-6 ${admin ? "lg:grid-cols-[260px,1fr]" : ""}`}>
          {admin ? (
            <div className="h-[420px] animate-pulse rounded-[1.75rem] bg-white/70" />
          ) : null}
          <div className="space-y-6">
            <div className="h-6 w-32 animate-pulse rounded-full bg-white/70" />
            <div className="h-16 w-full max-w-3xl animate-pulse rounded-[1.75rem] bg-white/70" />
            <div className="h-8 w-full max-w-2xl animate-pulse rounded-[1.5rem] bg-white/60" />
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: admin ? 3 : 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-64 animate-pulse rounded-[1.75rem] bg-white/70"
                />
              ))}
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
