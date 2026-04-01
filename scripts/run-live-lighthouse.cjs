const fs = require("fs");

const lighthouse = require("lighthouse").default;
const chromeLauncher = require("chrome-launcher");

async function main() {
  const mode = process.argv[2] || "desktop";
  const outFile = process.argv[3] || ".lighthouse-live.json";

  const options = {
    output: "json",
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    formFactor: mode === "mobile" ? "mobile" : "desktop",
    screenEmulation:
      mode === "mobile"
        ? {
            mobile: true,
            width: 390,
            height: 844,
            deviceScaleFactor: 2.625,
            disabled: false
          }
        : {
            mobile: false,
            width: 1350,
            height: 940,
            deviceScaleFactor: 1,
            disabled: false
          }
  };

  const chrome = await chromeLauncher.launch({
    chromePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    chromeFlags: ["--headless=new", "--no-sandbox"]
  });

  try {
    console.log(`chrome port ${chrome.port}`);
    const runnerResult = await lighthouse("https://era-academy.vercel.app", {
      ...options,
      port: chrome.port
    });

    fs.writeFileSync(outFile, runnerResult.report);
    console.log(`saved ${outFile}`);
  } finally {
    try {
      await chrome.kill();
    } catch (error) {
      console.error(`chrome cleanup warning: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
