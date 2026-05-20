require("dotenv").config();

const fs = require("fs");

const express = require("express");
const cors = require("cors");

const OpenAI = require("openai");

const { routeModel } = require("./router");

const {
  runShell,
  readFile,
  writeFile,
  replaceInFile,
  listDir,
  webSearch,
} = require("./tools");

const app = express();

app.use(cors());

app.use(express.json({
  limit: "50mb",
}));

//
// SYSTEM PROMPT
//
const SYSTEM_PROMPT =
  fs.readFileSync(
    "./prompts/system.txt",
    "utf8"
  );

//
// OPENAI CLIENT
//
const client = new OpenAI({
  apiKey:
    process.env.LITELLM_API_KEY,

  baseURL:
    process.env.LITELLM_BASE_URL,
});

//
// HEALTH
//
app.get("/", async (_, res) => {

  res.json({
    status: "ok",
  });
});

app.head("/", async (_, res) => {

  res.status(200).end();
});

//
// TOOL DEFINITIONS
//
const TOOL_DEFINITIONS = [

  {
    type: "function",

    function: {

      name: "web_search",

      description:
        "Search web",

      parameters: {
        type: "object",

        properties: {

          query: {
            type: "string",
          },
        },

        required: ["query"],
      },
    },
  },

  {
    type: "function",

    function: {

      name: "run_shell",

      description:
        "Run shell command",

      parameters: {
        type: "object",

        properties: {

          command: {
            type: "string",
          },

          session_id: {
            type: "string",
          },
        },

        required: ["command"],
      },
    },
  },

  {
    type: "function",

    function: {

      name: "read_file",

      description:
        "Read file",

      parameters: {
        type: "object",

        properties: {

          path: {
            type: "string",
          },
        },

        required: ["path"],
      },
    },
  },

  {
    type: "function",

    function: {

      name: "write_file",

      description:
        "Write file",

      parameters: {
        type: "object",

        properties: {

          path: {
            type: "string",
          },

          content: {
            type: "string",
          },
        },

        required: [
          "path",
          "content",
        ],
      },
    },
  },

  {
    type: "function",

    function: {

      name: "replace_in_file",

      description:
        "Replace file text",

      parameters: {
        type: "object",

        properties: {

          path: {
            type: "string",
          },

          oldText: {
            type: "string",
          },

          newText: {
            type: "string",
          },
        },

        required: [
          "path",
          "oldText",
          "newText",
        ],
      },
    },
  },

  {
    type: "function",

    function: {

      name: "list_dir",

      description:
        "List directory",

      parameters: {
        type: "object",

        properties: {

          path: {
            type: "string",
          },
        },
      },
    },
  },
];

//
// EXECUTE TOOL
//
async function executeTool(toolCall) {

  const name =
    toolCall.function.name;

  const args =
    JSON.parse(
      toolCall.function.arguments
    );

  console.log(
    `[TOOL] ${name}`
  );

  //
  // WEB SEARCH
  //
  if (name === "web_search") {

    return await webSearch(
      args.query
    );
  }

  //
  // SHELL
  //
  if (name === "run_shell") {

    return await runShell(
      args.command,
      args.session_id || "default"
    );
  }

  //
  // READ FILE
  //
  if (name === "read_file") {

    return readFile(
      args.path
    );
  }

  //
  // WRITE FILE
  //
  if (name === "write_file") {

    return writeFile(
      args.path,
      args.content
    );
  }

  //
  // REPLACE FILE
  //
  if (name === "replace_in_file") {

    return replaceInFile(
      args.path,
      args.oldText,
      args.newText
    );
  }

  //
  // LIST DIR
  //
  if (name === "list_dir") {

    return listDir(
      args.path
    );
  }

  return {
    success: false,
    error: "Unknown tool",
  };
}

//
// HARD CONTEXT TRIM
//
function trimMessages(messages) {

  //
  // KEEP SYSTEM
  //
  const system =
    messages.find(
      x => x.role === "system"
    );

  //
  // KEEP RECENT
  //
  const recent =
    messages
      .filter(
        x => x.role !== "system"
      )
      .slice(-12);

  return [
    system,
    ...recent,
  ];
}

//
// ANTHROPIC API
//
app.post(
  "/v1/messages",
  async (req, res) => {

    try {

      //
      // MESSAGES
      //
      let messages = [

        {
          role: "system",
          content: SYSTEM_PROMPT,
        },

        ...(req.body.messages || [])
      ];

      //
      // HARD TRIM
      //
      messages =
        trimMessages(messages);

      console.log(
        "[DEBUG TOKENS]",
        Math.floor(
          JSON.stringify(messages).length / 3
        )
      );

      //
      // ROUTING
      //
      const model =
        routeModel(messages);

      console.log(
        `[ROUTER] Routed to ${model}`
      );

      //
      // STREAM
      //
      const stream =
        req.body.stream ?? true;

      //
      // LOOP
      //
      let completion;

      let iterations = 0;

      const MAX_ITERATIONS = 5;

      while (
        iterations < MAX_ITERATIONS
      ) {

        iterations++;

        console.log(
          `[LOOP] Iteration ${iterations}`
        );

        //
        // TRIM AGAIN
        //
        messages =
          trimMessages(messages);

        console.log(
          "[DEBUG TOKENS]",
          Math.floor(
            JSON.stringify(messages).length / 3
          )
        );

        completion =
          await client.chat.completions.create({

            model,

            messages,

            //
            // TEMPORARILY DISABLED
            //
            tools: [],

            tool_choice:
              "auto",

            stream: false,

            max_tokens: 4000,

            temperature: 0.2,
          });

        const assistantMessage =
          completion
            .choices?.[0]?.message;

        const toolCalls =
          assistantMessage
            ?.tool_calls || [];

        //
        // STORE MESSAGE
        //
        messages.push(
          assistantMessage
        );

        //
        // DONE
        //
        if (!toolCalls.length) {

          console.log(
            "[LOOP] No more tool calls"
          );

          break;
        }

        //
        // EXECUTE TOOLS
        //
        for (const toolCall of toolCalls) {

          const result =
            await executeTool(
              toolCall
            );

          //
          // COMPACT
          //
          if (result.compact) {

            console.log(
              "[MEMORY] Compact triggered"
            );

            messages = [

              {
                role: "system",

                content:
                  "Conversation compacted. Continue from latest state."
              },

              ...messages.slice(-6)
            ];
          }

          messages.push({

            role: "tool",

            tool_call_id:
              toolCall.id,

            content:
              JSON.stringify(result),
          });
        }
      }

      //
      // FINAL TEXT
      //
      const finalText =
        completion
          ?.choices?.[0]
          ?.message
          ?.content || "";

      //
      // SSE
      //
      if (stream) {

        res.setHeader(
          "Content-Type",
          "text/event-stream"
        );

        res.setHeader(
          "Cache-Control",
          "no-cache"
        );

        res.setHeader(
          "Connection",
          "keep-alive"
        );

        //
        // START
        //
        res.write(
          `event: message_start\n`
        );

        res.write(
          `data: ${JSON.stringify({

            type: "message_start",

            message: {

              id: "msg_123",

              type: "message",

              role: "assistant",

              model,

              content: [],

              stop_reason: null,

              stop_sequence: null,

              usage: {
                input_tokens: 0,
                output_tokens: 0,
              },
            },
          })}\n\n`
        );

        //
        // CONTENT START
        //
        res.write(
          `event: content_block_start\n`
        );

        res.write(
          `data: ${JSON.stringify({

            type:
              "content_block_start",

            index: 0,

            content_block: {
              type: "text",
              text: "",
            },
          })}\n\n`
        );

        //
        // CONTENT DELTA
        //
        res.write(
          `event: content_block_delta\n`
        );

        res.write(
          `data: ${JSON.stringify({

            type:
              "content_block_delta",

            index: 0,

            delta: {
              type: "text_delta",
              text: finalText,
            },
          })}\n\n`
        );

        //
        // CONTENT STOP
        //
        res.write(
          `event: content_block_stop\n`
        );

        res.write(
          `data: ${JSON.stringify({

            type:
              "content_block_stop",

            index: 0,
          })}\n\n`
        );

        //
        // MESSAGE DELTA
        //
        res.write(
          `event: message_delta\n`
        );

        res.write(
          `data: ${JSON.stringify({

            type:
              "message_delta",

            delta: {

              stop_reason:
                "end_turn",

              stop_sequence: null,
            },

            usage: {
              output_tokens: 0,
            },
          })}\n\n`
        );

        //
        // STOP
        //
        res.write(
          `event: message_stop\n`
        );

        res.write(
          `data: ${JSON.stringify({

            type: "message_stop",
          })}\n\n`
        );

        res.end();

        return;
      }

      //
      // NON STREAM
      //
      return res.json({

        id: "msg_123",

        type: "message",

        role: "assistant",

        model,

        content: [
          {
            type: "text",
            text: finalText,
          },
        ],

        stop_reason: "end_turn",
      });

    } catch (err) {

      console.error(err);

      return res.status(500).json({
        error: err.message,
      });
    }
  }
);

//
// START
//
const PORT =
  process.env.PORT || 8001;

app.listen(PORT, () => {

  console.log(
    `Gateway listening on ${PORT}`
  );
});
