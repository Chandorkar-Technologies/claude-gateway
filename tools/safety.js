const BLOCKED = [
  "rm -rf /",
  "shutdown",
  "reboot",
  "mkfs",
  ":(){ :|:& };:",
];

function isDangerous(command) {

  return BLOCKED.some((x) =>
    command.includes(x)
  );
}

module.exports = {
  isDangerous,
};
