"use client";

import { useEffect } from "react";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <Section>
          <Container>
            <Card className="mx-auto max-w-2xl">
              <CardContent className="space-y-5 p-8 text-center">
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                  Something went wrong
                </p>
                <h1 className="font-display text-5xl">The page could not be loaded.</h1>
                <p className="text-sm leading-7 text-muted-foreground">
                  An unexpected error occurred while rendering this route. Try again, and if
                  the issue persists, check your environment variables and database connection.
                </p>
                <div className="flex justify-center">
                  <Button onClick={reset}>Try Again</Button>
                </div>
              </CardContent>
            </Card>
          </Container>
        </Section>
      </body>
    </html>
  );
}
