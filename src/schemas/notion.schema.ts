import { z } from "zod";

export const feedbackPayloadSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "La descripción debe tener al menos 3 caracteres")
    .max(200, "La descripción no puede superar los 200 caracteres"),
  type: z.enum(["Bug", "Sugerencia", "Mejora Tecnica", "Roadmap"]),
  priority: z.enum(["Alta", "Media", "Baja"]).default("Media"),
  origin: z.enum(["WhatsApp", "Agente", "Manual"]).default("WhatsApp"),
  author: z.string().trim().min(1).default("Anónimo"),
  detail: z.string().trim().max(4000).optional(),
});

export type FeedbackPayload = z.infer<typeof feedbackPayloadSchema>;

export const notionConfigSchema = z.object({
  apiKey: z.string().min(10),
  databaseId: z.string().min(10),
});
