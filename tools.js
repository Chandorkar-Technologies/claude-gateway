const fs = require("fs");
const path = require("path");

const axios = require("axios");

const pty = require("node-pty");

//
// DANGEROUS COMMANDS
//
const BLOCKED_COMMANDS = [
  "rm -rf /",
  "shutdown",
  "reboot",
  "mkfs",
  ":(){ :|:& };:",
];

//
// PERSISTENT SHELL SESSIONS
//
const sessions = {};

function getSession(sessionId = "default") {

  if (!sessions[sessionId]) {

    sessions[sessionId] = pty.spawn(
      "/bin/bash",
      [],
      {
        name: "xterm-color",
        cols: 120,
        rows: 40,
        cwd: process.cwd(),
        env: process.env,
      }
    );
  }

  return sessions[sessionId];
}

//
// TRIM LARGE OUTPUTS
//
function trimOutput(output = "") {

  if (!output) {
    return "";
  }

  //
  // HARD LIMIT
  //
  if (output.length > 12000) {

    return (
      output.slice(0, 8000) +
      "\n\n...[TRUNCATED]...\n\n" +
      output.slice(-2000)
    );
  }

  return output;
}

//
// SHELL
//
async function runShell(
  command,
  sessionId = "default"
) {

  if (
    BLOCKED_COMMANDS.some(x =>
      command.includes(x)
    )
  ) {

    return {
      success: false,
      error: "Blocked dangerous command",
    };
  }

  //
  // COMPACT COMMAND
  //
  if (
    command.trim() === "/compact"
  ) {

    return {
      success: true,
      compact: true,
      output:
        "Conversation compact requested."
    };
  }

  return new Promise((resolve) => {

    const shell =
      getSession(sessionId);

    let output = "";

    const onData = (data) => {
      output += data;
    };

    shell.onData(onData);

    shell.write(command + "\n");

    setTimeout(() => {

      shell.offData(onData);

      resolve({
        success: true,
        output:
          trimOutput(output),
      });

    }, 2000);
  });
}

//
// READ FILE
//
function readFile(filePath) {

  try {

    const content =
      fs.readFileSync(
        filePath,
        "utf8"
      );

    return {
      success: true,

      content:
        trimOutput(content),
    };

  } catch (err) {

    return {
      success: false,
      error: err.message,
    };
  }
}

//
// WRITE FILE
//
function writeFile(
  filePath,
  content
) {

  try {

    const dir =
      path.dirname(filePath);

    fs.mkdirSync(dir, {
      recursive: true,
    });

    fs.writeFileSync(
      filePath,
      content
    );

    return {
      success: true,
    };

  } catch (err) {

    return {
      success: false,
      error: err.message,
    };
  }
}

//
// REPLACE IN FILE
//
function replaceInFile(
  filePath,
  oldText,
  newText
) {

  try {

    const content =
      fs.readFileSync(
        filePath,
        "utf8"
      );

    const updated =
      content.replace(
        oldText,
        newText
      );

    fs.writeFileSync(
      filePath,
      updated
    );

    return {
      success: true,
    };

  } catch (err) {

    return {
      success: false,
      error: err.message,
    };
  }
}

//
// LIST DIRECTORY
//
function listDir(dirPath = ".") {

  try {

    const files =
      fs.readdirSync(dirPath);

    return {
      success: true,

      files:
        files.slice(0, 200),
    };

  } catch (err) {

    return {
      success: false,
      error: err.message,
    };
  }
}

//
// WEB SEARCH
//
async function webSearch(query) {

  try {

    if (!process.env.TAVILY_API_KEY) {

      return {
        success: false,
        error:
          "Missing TAVILY_API_KEY",
      };
    }

    const response =
      await axios.post(
        "https://api.tavily.com/search",
        {
          api_key:
            process.env.TAVILY_API_KEY,

          query,

          search_depth: "basic",

          include_answer: true,

          max_results: 3,
        }
      );

    return {
      success: true,

      results:
        trimOutput(
          JSON.stringify(
            response.data
          )
        ),
    };

  } catch (err) {

    return {
      success: false,
      error: err.message,
    };
  }
}

module.exports = {
  runShell,
  readFile,
  writeFile,
  replaceInFile,
  listDir,
  webSearch,
};
