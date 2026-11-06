export type PracticeRunnerTestCase = {
  input: unknown[];
  expected: unknown;
  description: string;
};

export type PracticeRunnerResult = {
  description: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
};

const RUN_TIMEOUT_MS = 2000;

// Runs inside a Web Worker. Network APIs are removed before student code runs,
// and the worker is terminated if it does not finish in time.
const workerSource = `
for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches"]) {
  for (let target = self; target; target = Object.getPrototypeOf(target)) {
    try {
      Object.defineProperty(target, name, { value: undefined, configurable: false, writable: false });
    } catch {}
  }
}

function toSerializable(value) {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

self.onmessage = (event) => {
  const { script, testCases } = event.data;

  try {
    const module = { exports: {} };
    new Function("module", "exports", script)(module, module.exports);

    const exported = module.exports;
    const solve =
      typeof exported === "function"
        ? exported
        : typeof exported?.solve === "function"
          ? exported.solve
          : null;

    if (!solve) {
      throw new Error("Export a function directly or as module.exports = solve.");
    }

    const results = testCases.map((testCase) => {
      try {
        const actual = solve(...testCase.input);
        return {
          description: testCase.description,
          passed: JSON.stringify(actual) === JSON.stringify(testCase.expected),
          expected: testCase.expected,
          actual: toSerializable(actual)
        };
      } catch (error) {
        return {
          description: testCase.description,
          passed: false,
          expected: testCase.expected,
          actual: "Error: " + (error && error.message ? error.message : String(error))
        };
      }
    });

    self.postMessage({ ok: true, results });
  } catch (error) {
    self.postMessage({ ok: false, message: error && error.message ? error.message : String(error) });
  }
};
`;

export function runPracticeInBrowser(script: string, testCases: PracticeRunnerTestCase[]) {
  return new Promise<PracticeRunnerResult[]>((resolve, reject) => {
    const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
    const worker = new Worker(workerUrl);

    const cleanUp = () => {
      clearTimeout(timeout);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    };

    const timeout = setTimeout(() => {
      cleanUp();
      reject(new Error("Your code took too long to finish. Check for an infinite loop."));
    }, RUN_TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent<{ ok: boolean; results?: PracticeRunnerResult[]; message?: string }>) => {
      cleanUp();

      if (event.data.ok && event.data.results) {
        resolve(event.data.results);
      } else {
        reject(new Error(event.data.message ?? "Your code could not run."));
      }
    };

    worker.onerror = (event) => {
      event.preventDefault();
      cleanUp();
      reject(new Error(event.message || "Your code could not run."));
    };

    worker.postMessage({ script, testCases });
  });
}
