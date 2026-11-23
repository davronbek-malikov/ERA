import { ActivityType, Prisma, SubmissionStatus } from "@prisma/client";
import ts from "typescript";

import type { PracticeLanguage } from "@/lib/practice-languages";
import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { invalid } from "@/lib/validation";
import { authErrors, requireLessonAccess, type AuthUser } from "@/server/authz";
import { trackUserActivity } from "@/server/activity";
import { getPracticeLanguageVariant } from "@/server/practice-variants";

export const MAX_PRACTICE_CODE_LENGTH = 20_000;

export type PracticeTestCase = {
  input: unknown[];
  expected: unknown;
  description: string;
};

type PracticeExecutionResult = {
  description: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
};

function transpileTypeScriptToCommonJs(code: string) {
  return ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
}

function translatePythonStringLiteral(input: string) {
  if (/^f["']/.test(input)) {
    const quote = input[1];
    const body = input.slice(2, -1);
    const escapedBody = body.replace(/`/g, "\\`").replace(/\{([^}]+)\}/g, "${$1}");
    return `\`${escapedBody}\``;
  }

  if (input[0] === "'" && input.at(-1) === "'") {
    const body = input.slice(1, -1).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${body}"`;
  }

  return input;
}

function translatePythonExpression(expression: string): string {
  const trimmed = expression.trim();

  if (!trimmed) {
    return trimmed;
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    /^f["'].*["']$/.test(trimmed)
  ) {
    return translatePythonStringLiteral(trimmed);
  }

  const joinMatch = trimmed.match(/^(.+)\.join\((.+)\)$/);

  if (joinMatch) {
    const separator = translatePythonExpression(joinMatch[1]);
    const collection = translatePythonExpression(joinMatch[2]);
    return `${collection}.join(${separator})`;
  }

  return trimmed
    .replace(/\bNone\b/g, "null")
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false");
}

function transpilePythonToCommonJs(code: string) {
  const lines = code.replace(/\r/g, "").split("\n");
  const headerIndex = lines.findIndex((line) => /^def\s+solve\s*\((.*)\)\s*:\s*$/.test(line.trim()));

  if (headerIndex < 0) {
    throw new Error("Define a function named solve for Python practice.");
  }

  const header = lines[headerIndex].trim();
  const headerMatch = header.match(/^def\s+solve\s*\((.*)\)\s*:\s*$/);

  if (!headerMatch) {
    throw new Error("Python practice needs a valid solve function header.");
  }

  const params = headerMatch[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const rawBody = lines.slice(headerIndex + 1).filter((line) => line.trim().length > 0);

  if (rawBody.length === 0) {
    throw new Error("Add logic inside the solve function.");
  }

  const indentedBody = rawBody.filter((line) => /^\s+/.test(line));
  const minimumIndent = Math.min(
    ...indentedBody
      .filter((line) => line.trim().length > 0)
      .map((line) => line.match(/^\s+/)?.[0].length ?? 0)
  );

  const bodyStatements = indentedBody.map((line) => line.slice(minimumIndent).trim()).filter(Boolean);

  if (bodyStatements.length === 0) {
    throw new Error("Add executable Python statements inside solve.");
  }

  const jsStatements = bodyStatements.map((statement) => {
    if (statement.startsWith("#")) {
      return "";
    }

    if (statement.startsWith("return ")) {
      return `return ${translatePythonExpression(statement.slice(7))};`;
    }

    const assignment = statement.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);

    if (assignment) {
      return `const ${assignment[1]} = ${translatePythonExpression(assignment[2])};`;
    }

    throw new Error("Python practice currently supports assignments and return statements.");
  });

  return [
    `module.exports = function solve(${params.join(", ")}) {`,
    ...jsStatements.filter(Boolean).map((line) => `  ${line}`),
    "};"
  ].join("\n");
}

// Converts student code to a CommonJS script for the browser runner. This only
// rewrites text: student code is never executed on the server.
export function compilePracticeCode(language: PracticeLanguage, code: string) {
  if (language === "javascript") {
    return code;
  }

  if (language === "typescript") {
    return transpileTypeScriptToCommonJs(code);
  }

  if (language === "python") {
    return transpilePythonToCommonJs(code);
  }

  throw new Error("Unsupported language.");
}

/**
 * Records a practice submission for the signed-in user. The exercise's lesson must be accessible to the
 * user (enrolled student, owning teacher or admin) — solutions are returned only after this check.
 */
export async function submitPracticeExercise(currentUser: AuthUser, input: {
  exerciseId: string;
  language: PracticeLanguage;
  code: string;
  results: Array<{ passed: boolean; actual: unknown }>;
}) {
  const exercise = await retryOnDatabaseFailure(() =>
    prisma.practiceExercise.findUnique({
      where: {
        id: input.exerciseId
      },
      select: {
        id: true,
        slug: true,
        title: true,
        lessonId: true,
        starterCode: true,
        solutionCode: true,
        hints: true,
        solutionNotes: true,
        testCases: true
      }
    })
  );

  if (!exercise) {
    throw authErrors.notFound("Practice exercise not found.");
  }

  await requireLessonAccess(currentUser, exercise.lessonId);

  // Results come from the browser runner, so they are self-reported. Test
  // descriptions and expected values always come from the database.
  const testCases = exercise.testCases as PracticeTestCase[];

  if (input.results.length !== testCases.length) {
    throw invalid("invalid-results", "Practice results do not match this exercise.");
  }

  const results: PracticeExecutionResult[] = testCases.map((testCase, index) => ({
    description: testCase.description,
    passed: input.results[index].passed === true,
    expected: testCase.expected,
    actual: input.results[index].actual ?? null
  }));
  const passedCount = results.filter((result) => result.passed).length;
  const status = passedCount === results.length ? SubmissionStatus.PASSED : SubmissionStatus.FAILED;
  const languageVariant = getPracticeLanguageVariant(exercise, input.language);

  const submission = await retryOnDatabaseFailure(() =>
    prisma.practiceSubmission.create({
      data: {
        exerciseId: exercise.id,
        userId: currentUser.id,
        language: input.language,
        code: input.code,
        status,
        passedCount,
        totalTests: results.length,
        feedback: results as Prisma.InputJsonValue
      }
    })
  );

  await trackUserActivity({
    userId: currentUser.id,
    type: ActivityType.PRACTICE_SUBMITTED,
    message: `Submitted practice: ${exercise.title}`,
    context: {
      exerciseId: exercise.id,
      lessonId: exercise.lessonId,
      language: input.language,
      passedCount,
      totalTests: results.length,
      status
    }
  });

  return {
    submissionId: submission.id,
    language: input.language,
    status,
    passedCount,
    totalTests: results.length,
    feedback: results,
    hints: exercise.hints,
    solutionCode: languageVariant.solutionCode,
    solutionNotes: exercise.solutionNotes
  };
}
