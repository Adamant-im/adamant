#!/usr/bin/env node

const exec = require("child_process").exec;

const args = {
  specFile: "https://docs.adamant.im/schema/schema.json",
  generatorName: "typescript-axios",
  output: "./client",
  config: "./config.json",
  template: "typescript-axios",
};

exec(
  [
    "npx",
    "@openapitools/openapi-generator-cli",
    "generate",
    `--type-mappings Date=string`,
    `--skip-validate-spec`,
    `-i ${args.specFile}`,
    `-g ${args.generatorName}`,
    `-o ${args.output}`,
    `-c ${args.config}`,
    `-t ${args.template}`,
  ].join(" "),
  (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }

    console.log(`stdout: ${stdout}`);
  }
);
