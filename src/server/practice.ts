import vm from "node:vm";

import { ActivityType, Prisma, SubmissionStatus } from "@prisma/client";
import ts from "typescript";

import { getCurrentUser } from "@/lib/auth";
import {
  getPracticeLanguageVariant,
  type PracticeLanguage
} from "@/lib/practice-languages";
import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { trackUserActivity } from "@/server/activity";

type PracticeTestCase = {
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

function normalizeValue(value: unknown) {
  return JSON.stringify(value);
}

function executeCommonJsModule(code: string, testCases: PracticeTestCase[]) {
  const sandbox = {
    module: { exports: {} as unknown },
    exports: {}
  };
  const context = vm.createContext(sandbox);
  const script = new vm.Script(code);
  script.runInContext(context, { timeout: 1000 });

  const exported = (sandbox.module.exports || sandbox.exports) as unknown;
  const solve =
    typeof exported === "function"
      ? exported
      : typeof (exported as { solve?: unknown })?.solve === "function"
        ? (exported as { solve: (...args: unknown[]) => unknown }).solve
        : null;

  if (!solve) {
    throw new Error("Export a function directly or as module.exports = solve.");
  }

  return testCases.map((testCase) => {
    const actual = solve(...testCase.input);
    const passed = normalizeValue(actual) === normalizeValue(testCase.expected);

    return {
      description: testCase.description,
      passed,
      expected: testCase.expected,
      actual
    };
  });
}

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

function runExerciseByLanguage(
  language: PracticeLanguage,
  code: string,
  testCases: PracticeTestCase[]
): PracticeExecutionResult[] {
  if (language === "javascript") {
    return executeCommonJsModule(code, testCases);
  }

  if (language === "typescript") {
    return executeCommonJsModule(transpileTypeScriptToCommonJs(code), testCases);
  }

  if (language === "python") {
    return executeCommonJsModule(transpilePythonToCommonJs(code), testCases);
  }

  throw new Error("Unsupported language.");
}

export async function submitPracticeExercise(input: {
  exerciseId: string;
  language: PracticeLanguage;
  code: string;
}) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    throw new Error("Sign in to submit practice.");
  }

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
    throw new Error("Practice exercise not found.");
  }

  const results = runExerciseByLanguage(
    input.language,
    input.code,
    exercise.testCases as PracticeTestCase[]
  );
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
