import { PrismaClient, PublicationStatus, PracticeExerciseType } from "@prisma/client";

const prisma = new PrismaClient();

const exerciseBlueprints = [
  {
    lessonSlug: "why-deep-learning-matters",
    type: PracticeExerciseType.CODING,
    title: "Explain model value",
    slug: "explain-model-value",
    instructions:
      "Write a function named solve that receives a model name and returns the sentence `Model: <name> helps turn patterns into predictions.`",
    language: "javascript",
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
    ].join("\n"),
    hints: [
      "Use a function named solve.",
      "Return a string instead of logging it.",
      "Template literals make it easier to place the model name in the sentence."
    ],
    solutionNotes:
      "Return the exact sentence format with the provided model name inserted in the middle.",
    testCases: [
      {
        input: ["Neural Net"],
        expected: "Model: Neural Net helps turn patterns into predictions.",
        description: "Builds the sentence for a basic model name."
      },
      {
        input: ["Vision Transformer"],
        expected: "Model: Vision Transformer helps turn patterns into predictions.",
        description: "Handles model names with spaces."
      }
    ],
    position: 1
  },
  {
    lessonSlug: "workflow-design-basics",
    type: PracticeExerciseType.MINI_PROJECT,
    title: "Plan a calm workflow",
    slug: "plan-a-calm-workflow",
    instructions:
      "Build a function named solve that receives three workflow steps as strings and returns them joined with ` -> ` in the same order. This mini project helps learners organize a simple AI workflow clearly.",
    language: "javascript",
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
    ].join("\n"),
    hints: [
      "Store the steps in an array first.",
      "Array join can combine items with a custom separator.",
      "Keep the original order unchanged."
    ],
    solutionNotes:
      "The project passes when the three steps are returned in order with ` -> ` between them.",
    testCases: [
      {
        input: ["Collect notes", "Summarize insights", "Draft output"],
        expected: "Collect notes -> Summarize insights -> Draft output",
        description: "Returns the expected workflow sequence."
      },
      {
        input: ["Research", "Review", "Ship"],
        expected: "Research -> Review -> Ship",
        description: "Handles short workflow labels too."
      }
    ],
    position: 1
  }
] as const;

async function main() {
  for (const blueprint of exerciseBlueprints) {
    const lesson = await prisma.lesson.findFirst({
      where: {
        slug: blueprint.lessonSlug,
        status: PublicationStatus.PUBLISHED,
        course: {
          status: PublicationStatus.PUBLISHED
        }
      },
      select: {
        id: true
      }
    });

    if (!lesson) {
      console.warn(`Skipping missing lesson slug: ${blueprint.lessonSlug}`);
      continue;
    }

    await prisma.practiceExercise.upsert({
      where: {
        lessonId_slug: {
          lessonId: lesson.id,
          slug: blueprint.slug
        }
      },
      update: {
        type: blueprint.type,
        title: blueprint.title,
        instructions: blueprint.instructions,
        language: blueprint.language,
        starterCode: blueprint.starterCode,
        solutionCode: blueprint.solutionCode,
        hints: [...blueprint.hints],
        solutionNotes: blueprint.solutionNotes,
        testCases: JSON.parse(JSON.stringify(blueprint.testCases)),
        position: blueprint.position
      },
      create: {
        lessonId: lesson.id,
        type: blueprint.type,
        title: blueprint.title,
        slug: blueprint.slug,
        instructions: blueprint.instructions,
        language: blueprint.language,
        starterCode: blueprint.starterCode,
        solutionCode: blueprint.solutionCode,
        hints: [...blueprint.hints],
        solutionNotes: blueprint.solutionNotes,
        testCases: JSON.parse(JSON.stringify(blueprint.testCases)),
        position: blueprint.position
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
