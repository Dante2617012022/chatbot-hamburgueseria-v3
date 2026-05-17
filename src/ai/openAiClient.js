import OpenAI from "openai";

let openAiClient = null;

export function getOpenAiClient() {
  if (openAiClient) {
    return openAiClient;
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Falta OPENAI_API_KEY.");
  }

  openAiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  return openAiClient;
}

export async function createStructuredIntentCompletion({
  input,
  schema,
  model = process.env.OPENAI_MODEL || "gpt-5.5"
}) {
  const client = getOpenAiClient();

  const response = await client.responses.create({
    model,
    input,
    text: {
      format: {
        type: "json_schema",
        name: "customer_intent",
        strict: true,
        schema
      }
    }
  });

  const outputText = extractOutputText(response);

  if (!outputText) {
    throw new Error("OpenAI no devolvió texto interpretable.");
  }

  return JSON.parse(outputText);
}

function extractOutputText(response) {
  if (response.output_text) {
    return response.output_text;
  }

  const output = response.output || [];

  const parts = [];

  for (const item of output) {
    const content = item.content || [];

    for (const part of content) {
      if (part.text) {
        parts.push(part.text);
      }
    }
  }

  return parts.join("").trim();
}
