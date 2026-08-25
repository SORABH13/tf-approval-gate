import { execFileSync } from "node:child_process";

const BINARIES: Array<{ bin: string; required: boolean; installUrl: string }> = [
  { bin: "terraform", required: true, installUrl: "https://developer.hashicorp.com/terraform/install" },
  { bin: "checkov", required: true, installUrl: "https://www.checkov.io/2.Basics/Installing%20Checkov.html" },
  { bin: "conftest", required: false, installUrl: "https://www.openpolicyagent.org/docs/latest/#running-opa" },
  { bin: "infracost", required: false, installUrl: "https://www.infracost.io/docs/#quick-start" },
];

let missingRequired = false;

for (const { bin, required, installUrl } of BINARIES) {
  try {
    execFileSync(bin, ["--version"], { stdio: "ignore" });
    console.log(`✅ ${bin} found`);
  } catch {
    if (required) {
      missingRequired = true;
      console.error(`❌ ${bin} NOT FOUND (required). Install: ${installUrl}`);
    } else {
      console.warn(`⚠️  ${bin} not found (optional -- the matching feature will be skipped). Install: ${installUrl}`);
    }
  }
}

if (missingRequired) {
  console.error("\nMissing required binaries. Install them and re-run.");
  process.exit(1);
}
