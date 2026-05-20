function extractText(messages) {
  const last = messages[messages.length - 1];

  if (!last) return "";

  const content = last.content;

  if (typeof content === "string") {
    return content.toLowerCase();
  }

  if (Array.isArray(content)) {
    return content
      .filter((x) => x.type === "text")
      .map((x) => x.text)
      .join(" ")
      .toLowerCase();
  }

  return "";
}

function routeModel(messages) {
  const text = extractText(messages);

  //
  // SEARCH
  //
  if (
    ["search", "google", "latest", "internet", "web"].some((k) =>
      text.includes(k)
    )
  ) {
    return "search-agent";
  }

  //
  // EDITING
  //
  if (
    ["refactor", "rewrite", "cleanup", "improve"].some((k) =>
      text.includes(k)
    )
  ) {
    return "edit-agent";
  }

  //
  // DEBUGGING
  //
  if (
    [
      "debug",
      "kubernetes",
      "architecture",
      "crash",
      "optimize",
      "security",
    ].some((k) => text.includes(k))
  ) {
    return "debug-agent";
  }

  //
  // DEFAULT
  //
  return "shell-agent";
}

module.exports = {
  routeModel,
};
