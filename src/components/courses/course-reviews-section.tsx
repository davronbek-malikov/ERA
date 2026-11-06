"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";

import { buttonVariants, Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type CourseReviewsSectionProps = {
  courseSlug: string;
  locale: "en" | "uz";
  isAuthenticated: boolean;
  initialAverageRating: number | null;
  initialReviewCount: number;
  initialReviews: Array<{
    id: string;
    rating: number;
    comment: string;
    createdAt: string;
    user: {
      id: string;
      name: string;
    };
  }>;
  currentUserReview?: {
    rating: number;
    comment: string;
  } | null;
};

export function CourseReviewsSection({
  courseSlug,
  locale,
  isAuthenticated,
  initialAverageRating,
  initialReviewCount,
  initialReviews,
  currentUserReview
}: CourseReviewsSectionProps) {
  const [reviews, setReviews] = useState(initialReviews);
  const [averageRating, setAverageRating] = useState(initialAverageRating);
  const [reviewCount, setReviewCount] = useState(initialReviewCount);
  const [rating, setRating] = useState(currentUserReview?.rating ?? 5);
  const [comment, setComment] = useState(currentUserReview?.comment ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const copy =
    locale === "uz"
      ? {
          eyebrow: "Reviews",
          title: "Talabalar fikrlari va reyting",
          subtitle: "Kurs sifati haqida ishonchli fikrlar va o'rtacha bahoni shu yerda ko'ring.",
          writeReview: "O'z fikringizni yozing",
          reviewPlaceholder: "Kurs sizga nimasi bilan foydali bo'ldi?",
          submit: "Review yuborish",
          signIn: "Review yozish uchun kiring",
          saved: "Review saqlandi.",
          average: "O'rtacha reyting",
          basedOn: "asosida",
          reviews: "review",
          noReviews: "Hozircha review yo'q. Birinchi bo'lib fikr qoldiring.",
          stars: "yulduz"
        }
      : {
          eyebrow: "Reviews",
          title: "Student reviews and rating",
          subtitle: "See trust signals and written feedback about course quality in one section.",
          writeReview: "Write your review",
          reviewPlaceholder: "What was useful, clear, or still missing in this course?",
          submit: "Submit review",
          signIn: "Sign in to write a review",
          saved: "Your review was saved.",
          average: "Average rating",
          basedOn: "based on",
          reviews: "reviews",
          noReviews: "No reviews yet. Be the first to leave thoughtful feedback.",
          stars: "stars"
        };

  const orderedReviews = useMemo(
    () =>
      reviews
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [reviews]
  );

  async function handleSubmit() {
    setStatus("saving");
    setErrorMessage("");

    try {
      const response = await fetch(`/api/courses/${courseSlug}/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          rating,
          comment
        })
      });
      const payload = (await response.json()) as {
        error?: { message?: string };
        data?: {
          review: {
            id: string;
            rating: number;
            comment: string;
            createdAt: string;
            updatedAt: string;
            user: {
              id: string;
              name: string;
            };
          };
          averageRating: number | null;
          reviewCount: number;
        };
      };

      if (!response.ok || !payload.data) {
        setStatus("error");
        setErrorMessage(payload.error?.message ?? "The review could not be saved.");
        return;
      }

      const nextReview = payload.data.review;

      setReviews((current) => {
        const withoutCurrent = current.filter((review) => review.user.id !== nextReview.user.id);
        return [...withoutCurrent, nextReview];
      });
      setAverageRating(payload.data.averageRating);
      setReviewCount(payload.data.reviewCount);
      setStatus("saved");
    } catch {
      setStatus("error");
      setErrorMessage("The review could not be saved.");
    }
  }

  return (
    <Card className="border-border/70 bg-card">
      <CardContent className="space-y-6 p-6">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{copy.eyebrow}</p>
          <h2 className="section-title">{copy.title}</h2>
          <p className="text-sm leading-7 text-muted-foreground">{copy.subtitle}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr,1.1fr]">
          <div className="space-y-4 rounded-xl bg-secondary/35 p-5">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{copy.average}</p>
              <div className="mt-3 flex items-end gap-3">
                <p className="font-display text-[3rem] font-semibold leading-none text-foreground">
                  {averageRating ? averageRating.toFixed(1) : "0.0"}
                </p>
                <div className="pb-2 text-sm text-muted-foreground">
                  {copy.basedOn} {reviewCount} {copy.reviews}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 text-warning">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star
                  key={index}
                  className={cn("h-5 w-5", (averageRating ?? 0) > index ? "fill-current" : "")}
                />
              ))}
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-border/70 p-5">
            <p className="text-sm font-semibold text-foreground">{copy.writeReview}</p>
            {isAuthenticated ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 5 }).map((_, index) => {
                    const value = index + 1;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRating(value)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-3 py-2 text-sm transition-colors",
                          value <= rating
                            ? "border-warning/30 bg-warning/10 text-warning-foreground"
                            : "border-border/70 bg-card text-muted-foreground"
                        )}
                      >
                        <Star className={cn("h-4 w-4", value <= rating ? "fill-current" : "")} />
                        {value}
                      </button>
                    );
                  })}
                </div>
                <Textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  className="min-h-[140px]"
                  placeholder={copy.reviewPlaceholder}
                />
                <Button type="button" onClick={handleSubmit} disabled={status === "saving"}>
                  {status === "saving" ? "Saving..." : copy.submit}
                </Button>
                {status === "saved" ? (
                  <p className="text-sm text-success">{copy.saved}</p>
                ) : null}
                {status === "error" ? (
                  <p className="text-sm text-error">{errorMessage}</p>
                ) : null}
              </>
            ) : (
              <Link
                href={`/sign-in?next=/courses/${courseSlug}`}
                className={cn(buttonVariants({ size: "lg" }), "w-full")}
              >
                {copy.signIn}
              </Link>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {orderedReviews.length > 0 ? (
            orderedReviews.map((review) => (
              <div key={review.id} className="rounded-lg border border-border/70 bg-secondary/20 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{review.user.name}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      {new Date(review.createdAt).toLocaleDateString(locale === "uz" ? "uz-UZ" : "en-US")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-warning">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star
                        key={index}
                        className={cn("h-4 w-4", review.rating > index ? "fill-current" : "")}
                      />
                    ))}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{review.comment}</p>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 bg-secondary/10 px-4 py-4 text-sm text-muted-foreground">
              {copy.noReviews}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
