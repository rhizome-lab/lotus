import { defineFullOpcode } from "@viwo/scripting";
import {
  generateText,
  generateObject,
  jsonSchema,
  experimental_generateImage,
  embed,
  experimental_generateSpeech,
  experimental_transcribe,
} from "ai";
import {
  getImageModel,
  getLanguageModel,
  getSpeechModel,
  getTextEmbeddingModel,
  getTranscriptionModel,
} from "./models";

export const aiText = defineFullOpcode<[string, string, string?], string>("ai.text", {
  metadata: {
    label: "Generate Text Response",
    category: "AI",
    slots: [
      { name: "Model", type: "string" },
      { name: "Prompt", type: "string" },
      { name: "System", type: "string" },
    ],
    parameters: [
      { name: "model", type: "string", description: "The model to use." },
      { name: "prompt", type: "string", description: "The prompt to generate text from." },
      { name: "system", type: "string", optional: true, description: "The system prompt." },
    ],
    returnType: "string",
    description: "Generates text.",
  },
  handler: async ([modelName, prompt, systemPrompt]) => {
    const model = getLanguageModel(modelName);
    const { text } = await generateText({
      model,
      prompt,
      ...(systemPrompt ? { system: systemPrompt } : {}),
    });
    return text;
  },
});

export const aiJson = defineFullOpcode<[string, string, object?], any>("ai.json", {
  metadata: {
    label: "Generate JSON Response",
    category: "AI",
    slots: [
      { name: "Model", type: "string" },
      { name: "Prompt", type: "string" },
      { name: "Schema", type: "block" },
    ],
    parameters: [
      { name: "model", type: "string", description: "The model to use." },
      { name: "prompt", type: "string", description: "The prompt to generate JSON from." },
      // TODO: Opcodes to construct JSON schemas.
      { name: "schema", type: "object", optional: true, description: "The JSON schema." },
    ],
    returnType: "object",
    description: "Generates a JSON object.",
  },
  handler: async ([modelName, prompt, schema]) => {
    const model = getLanguageModel(modelName);
    const { object } = schema
      ? await generateObject({ model, schema: jsonSchema(schema), prompt })
      : await generateObject<never, "no-schema">({ model, prompt });
    return object;
  },
});

export const aiEmbeddingText = defineFullOpcode<[string, string], number[]>("ai.embedding.text", {
  metadata: {
    label: "Generate Text Embedding",
    category: "AI",
    slots: [
      { name: "Model", type: "string" },
      { name: "Text", type: "string" },
    ],
    parameters: [
      { name: "model", type: "string", description: "The model to use." },
      { name: "text", type: "string", description: "The text to embed." },
    ],
    returnType: "number[]",
    description: "Generates an embedding for the given text.",
  },
  handler: async ([modelName, text]) => {
    const model = getTextEmbeddingModel(modelName);
    const { embedding } = await embed({ model, value: text });
    return embedding;
  },
});

export const aiImage = defineFullOpcode<[string, string], object>("ai.image", {
  metadata: {
    label: "Generate Image",
    category: "AI",
    slots: [
      { name: "Model", type: "string" },
      { name: "Prompt", type: "string" },
    ],
    parameters: [
      { name: "model", type: "string", description: "The model to use." },
      { name: "prompt", type: "string", description: "The prompt to generate image from." },
    ],
    returnType: "object",
    description: "Generates an image.",
  },
  handler: async ([modelName, prompt]) => {
    const model = getImageModel(modelName);
    const { image } = await experimental_generateImage({ model, prompt });
    // TODO: Support specifying width and height
    // TODO: Return in an actually usable format
    return image;
  },
});

export const aiGenerateSpeech = defineFullOpcode<[string, string], object>("ai.generate_speech", {
  metadata: {
    label: "Generate Speech",
    category: "AI",
    slots: [
      { name: "Model", type: "string" },
      { name: "Text", type: "string" },
    ],
    parameters: [
      { name: "model", type: "string", description: "The model to use." },
      { name: "text", type: "string", description: "The text to generate speech from." },
    ],
    returnType: "object",
    description: "Generates speech from text.",
  },
  handler: async ([modelName, text]) => {
    const model = getSpeechModel(modelName);
    const { audio } = await experimental_generateSpeech({ model, text });
    // TODO: Return in an actually usable format
    return audio;
  },
});

export const aiTranscribe = defineFullOpcode<[string, string], object>("ai.transcribe", {
  metadata: {
    label: "Transcribe Audio",
    category: "AI",
    slots: [
      { name: "Model", type: "string" },
      { name: "Audio", type: "block" },
    ],
    parameters: [
      { name: "model", type: "string", description: "The model to use." },
      { name: "audio", type: "object", description: "The audio to transcribe." },
    ],
    returnType: "string",
    description: "Transcribes audio to text.",
  },
  handler: async ([modelName, audio]) => {
    const model = getTranscriptionModel(modelName);
    const { text } = await experimental_transcribe({ model, audio });
    return text;
  },
});
