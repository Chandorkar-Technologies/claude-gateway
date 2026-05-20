const pty = require("node-pty");
const { v4: uuidv4 } = require("uuid");

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

async function runShell(command, sessionId = "default") {

  return new Promise((resolve) => {

    const shell = getSession(sessionId);

    let output = "";

    const timeout = setTimeout(() => {
      resolve({
        success: true,
        output,
      });
    }, 2000);

    shell.onData((data) => {
      output += data;
    });

    shell.write(command + "\n");

    setTimeout(() => {
      clearTimeout(timeout);

      resolve({
        success: true,
        output,
      });
    }, 1500);
  });
}

module.exports = {
  runShell,
};
