import { SchemaType } from "@google/generative-ai";

export const geminiTools: any[] = [
  {
    functionDeclarations: [
      {
        name: "download_tiktok",
        description: "Descarga un video de TikTok desde un enlace provisto.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            url: { type: SchemaType.STRING, description: "URL completa del video de TikTok." },
          },
          required: ["url"],
        },
      },
    ],
  },
];

export const groqTools: any[] = [
  {
    type: "function",
    function: {
      name: "download_tiktok",
      description: "Descarga un video de TikTok.",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
    },
  },
];