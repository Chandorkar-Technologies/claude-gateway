require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const { routeModel } = require("./router");

const {
  runShell,
  readFile,
  writeFile,
  listDir,
  webSearch,
} = require("./tools");

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

const client = new OpenAI({
  apiKey: process.env.LITELLM_API_KEY,
  baseURL: process.env.LITELLM_BASE_URL,
});

//
// HEALTH
//
app.get("/", async (_, res) => {
  res.json({ status: "ok" });
});

app.head("/", async (_, res) => {
  res.status(200).end();
});

//
// TOOL DEFINITIONS
//
const TOOL_DEFINITIONS = [

  //
  // WEB SEARCH
  //
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the internet for latest information",
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

  //
  // SHELL
  //
  {
    type: "function",
    function: {
      name: "run_shell",
      description: "Execute shell commands in persistent shell session",
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

  //
  // READ FILE
  //
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file from filesystem",
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

  //
  // WRITE FILE
  //
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to file",
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
        required: ["path", "content"],
      },
    },
  },

  //
  // LIST DIR
  //
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List directory contents",
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

  const name = toolCall.function.name;

  const args =
    JSON.parse(toolCall.function.arguments);

  console.log(`[TOOL] ${name}`);

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
// ANTHROPIC MESSAGES API
//
app.post("/v1/messages", async (req, res) => {

  try {

    let messages =
      req.body.messages || [];

    const model =
      routeModel(messages);

    console.log(
      `[ROUTER] Routed to ${model}`
    );

    const stream =
      req.body.stream ?? true;

    //
    // RECURSIVE AGENT LOOP
    //
    let completion;

    let iterations = 0;

    const MAX_ITERATIONS = 10;

    while (iterations < MAX_ITERATIONS) {

      iterations++;

      console.log(
        `[LOOP] Iteration ${iterations}`
      );

      completion =
        await client.chat.completions.create({

          model,
          messages,

          tools: TOOL_DEFINITIONS,
          tool_choice: "auto",

          stream: false,

          max_tokens: 16000,
          temperature: 0.2,
        });

      const assistantMessage =
        completion.choices?.[0]?.message;

      const toolCalls =
        assistantMessage?.tool_calls || [];

      //
      // ADD ASSISTANT MESSAGE
      //
      messages.push(
        assistantMessage
      );

      //
      // NO MORE TOOLS
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
          await executeTool(toolCall);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    //
    // FINAL STREAMING RESPONSE
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
      // MESSAGE START
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
      // CONTENT BLOCK START
      //
      res.write(
        `event: content_block_start\n`
      );

      res.write(
        `data: ${JSON.stringify({
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "text",
            text: "",
          },
        })}\n\n`
      );

      //
      // FINAL TEXT
      //
      const finalText =
        completion?.choices?.[0]?.message?.content || "";

      //
      // STREAM TEXT
      //
      const chunks =
        finalText.match(/.{1,50}/g) || [];

      for (const text of chunks) {

        res.write(
          `event: content_block_delta\n`
        );

        res.write(
          `data: ${JSON.stringify({
            type: "content_block_delta",
            index: 0,
            delta: {
              type: "text_delta",
              text,
            },
          })}\n\n`
        );

        await new Promise(
          r => setTimeout(r, 10)
        );
      }

      //
      // CONTENT BLOCK STOP
      //
      res.write(
        `event: content_block_stop\n`
      );

      res.write(
        `data: ${JSON.stringify({
          type: "content_block_stop",
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
          type: "message_delta",
          delta: {
            stop_reason: "end_turn",
            stop_sequence: null,
          },
          usage: {
            output_tokens: 0,
          },
        })}\n\n`
      );

      //
      // MESSAGE STOP
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
    // NON STREAMING RESPONSE
    //
    return res.json({
      id: "msg_123",
      type: "message",
      role: "assistant",
      model,
      content: [
        {
          type: "text",
          text:
            completion?.choices?.[0]?.message?.content || "",
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
});

//
// START SERVER
//
const PORT =
  process.env.PORT || 8001;

app.listen(PORT, () => {

  console.log(
    `Gateway listening on ${PORT}`
  );
});
