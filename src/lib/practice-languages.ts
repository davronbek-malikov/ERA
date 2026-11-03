export const PRACTICE_LANGUAGES = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" }
] as const;

export type PracticeLanguage = (typeof PRACTICE_LANGUAGES)[number]["value"];

type ExerciseVariant = {
  starterCode: string;
  solutionCode: string;
};

type ExerciseBase = {
  slug: string;
  starterCode: string;
  solutionCode: string;
};

const exerciseLanguageVariants: Record<string, Record<PracticeLanguage, ExerciseVariant>> = {
  "explain-model-value": {
    python: {
      starterCode: [
        "def solve(model_name):",
        "    # Return the expected sentence.",
        "",
        "    return \"\""
      ].join("\n"),
      solutionCode: [
        "def solve(model_name):",
        "    return f\"Model: {model_name} helps turn patterns into predictions.\""
      ].join("\n")
    },
    javascript: {
      starterCode: [
        "function solve(modelName) {",
        "  // Return the expected sentence.",
        "}",
        "",
        "module.exports = solve;"
      ].join("\n"),
      solutionCode: [
        "function solve(modelName) {",
        "  return `Model: ${modelName} helps turn patterns into predictions.`;",
        "}",
        "",
        "module.exports = solve;"
      ].join("\n")
    },
    typescript: {
      starterCode: [
        "function solve(modelName: string): string {",
        "  // Return the expected sentence.",
        "  return \"\";",
        "}",
        "",
        "export = solve;"
      ].join("\n"),
      solutionCode: [
        "function solve(modelName: string): string {",
        "  return `Model: ${modelName} helps turn patterns into predictions.`;",
        "}",
        "",
        "export = solve;"
      ].join("\n")
    }
  },
  "plan-a-calm-workflow": {
    python: {
      starterCode: [
        "def solve(step_one, step_two, step_three):",
        "    # Join the steps in order.",
        "",
        "    return \"\""
      ].join("\n"),
      solutionCode: [
        "def solve(step_one, step_two, step_three):",
        "    return \" -> \".join([step_one, step_two, step_three])"
      ].join("\n")
    },
    javascript: {
      starterCode: [
        "function solve(stepOne, stepTwo, stepThree) {",
        "  // Join the steps in order.",
        "}",
        "",
        "module.exports = solve;"
      ].join("\n"),
      solutionCode: [
        "function solve(stepOne, stepTwo, stepThree) {",
        "  return [stepOne, stepTwo, stepThree].join(\" -> \");",
        "}",
        "",
        "module.exports = solve;"
      ].join("\n")
    },
    typescript: {
      starterCode: [
        "function solve(stepOne: string, stepTwo: string, stepThree: string): string {",
        "  // Join the steps in order.",
        "  return \"\";",
        "}",
        "",
        "export = solve;"
      ].join("\n"),
      solutionCode: [
        "function solve(stepOne: string, stepTwo: string, stepThree: string): string {",
        "  return [stepOne, stepTwo, stepThree].join(\" -> \");",
        "}",
        "",
        "export = solve;"
      ].join("\n")
    }
  }
};

export function isPracticeLanguage(value: string): value is PracticeLanguage {
  return PRACTICE_LANGUAGES.some((language) => language.value === value);
}

export function getPracticeLanguageLabel(language: PracticeLanguage) {
  return PRACTICE_LANGUAGES.find((item) => item.value === language)?.label ?? language;
}

export function getPracticeLanguageVariant(
  exercise: ExerciseBase,
  language: PracticeLanguage
): ExerciseVariant {
  return (
    exerciseLanguageVariants[exercise.slug]?.[language] ?? {
      starterCode: exercise.starterCode,
      solutionCode: exercise.solutionCode
    }
  );
}
