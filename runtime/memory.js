function estimateTokens(messages) {
  return Math.floor(
    JSON.stringify(messages).length / 3
  );
}

async function condenseMessages(
  messages,
  client,
  model
) {

  //
  // HARD LIMIT
  //
  const MAX_INPUT_TOKENS = 24000;

  //
  // REMOVE GIANT CONTENT
  //
  let cleaned =
    messages.map((m) => {

      //
      // REMOVE HUGE TOOL RESULTS
      //
      if (
        typeof m.content === "string" &&
        m.content.length > 8000
      ) {

        return {
          ...m,
          content:
            m.content.slice(0, 2000) +
            "\n\n[TRUNCATED]"
        };
      }

      return m;
    });

  //
  // HARD TRIM LOOP
  //
  while (
    estimateTokens(cleaned) >
    MAX_INPUT_TOKENS
  ) {

    //
    // REMOVE OLDEST NON-SYSTEM
    //
    let removed = false;

    for (let i = 0; i < cleaned.length; i++) {

      if (
        cleaned[i].role !== "system"
      ) {

        cleaned.splice(i, 1);

        removed = true;

        break;
      }
    }

    if (!removed) {
      break;
    }
  }

  console.log(
    `[MEMORY] Final tokens: ${
      estimateTokens(cleaned)
    }`
  );

  return cleaned;
}

module.exports = {
  condenseMessages
};
