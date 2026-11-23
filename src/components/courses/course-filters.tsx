import { CourseDifficulty } from "@prisma/client";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n";

type CourseFiltersProps = {
  subjects: Array<{
    name: string;
    slug: string;
    categories: Array<{
      id: string;
      name: string;
      slug: string;
    }>;
  }>;
  selected: {
    subject?: string;
    category?: string;
    difficulty?: string;
    search?: string;
    sort?: string;
  };
  locale: Locale;
};

const difficultyOptions = Object.values(CourseDifficulty);

export function CourseFilters({ subjects, selected, locale }: CourseFiltersProps) {
  const t = getMessages(locale);
  const categories = subjects.flatMap((subject) => subject.categories);

  return (
    <Card>
      <CardContent className="p-6">
        <form className="grid gap-4 lg:grid-cols-[1.2fr,1fr,1fr,1fr,1fr,auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="search"
              defaultValue={selected.search}
              placeholder={t.courses.searchPlaceholder}
              className="pl-10"
            />
          </div>

          <select
            name="subject"
            defaultValue={selected.subject ?? ""}
            className="form-control"
          >
            <option value="">{t.courses.allSubjects}</option>
            {subjects.map((subject) => (
              <option key={subject.slug} value={subject.slug}>
                {subject.name}
              </option>
            ))}
          </select>

          <select
            name="category"
            defaultValue={selected.category ?? ""}
            className="form-control"
          >
            <option value="">{t.courses.allCategories}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <select
            name="difficulty"
            defaultValue={selected.difficulty ?? ""}
            className="form-control"
          >
            <option value="">{t.courses.allLevels}</option>
            {difficultyOptions.map((difficulty) => (
              <option key={difficulty} value={difficulty}>
                {difficulty.charAt(0) + difficulty.slice(1).toLowerCase()}
              </option>
            ))}
          </select>

          <select
            name="sort"
            defaultValue={selected.sort ?? "popularity"}
            className="form-control"
          >
            <option value="popularity">{locale === "uz" ? "Mashhurlik bo'yicha" : "Sort by popularity"}</option>
            <option value="rating">{locale === "uz" ? "Reyting bo'yicha" : "Sort by rating"}</option>
          </select>

          <Button type="submit" size="md">{t.courses.applyFilters}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
