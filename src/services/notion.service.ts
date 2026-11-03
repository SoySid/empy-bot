import axios from "axios";
import { feedbackPayloadSchema, notionConfigSchema, FeedbackPayload } from "../schemas/notion.schema.js";

const DEFAULT_FEEDBACK_DB_ID = "5baf57e7c9304cf5bd563404571b04d2";

export interface NotionFeedbackResult {
  success: boolean;
  pageId?: string;
  url?: string;
  error?: string;
}

export interface FeedbackItem {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  author: string;
  detail?: string;
  url?: string;
  createdAt: string;
}

export async function getFeedbackItems(statusFilter?: string): Promise<{ success: boolean; items: FeedbackItem[]; error?: string }> {
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = (process.env.NOTION_FEEDBACK_DB_ID || DEFAULT_FEEDBACK_DB_ID).replace(/-/g, "");

  const configResult = notionConfigSchema.safeParse({ apiKey, databaseId });
  if (!configResult.success) {
    return { success: false, items: [], error: "Servicio de Notion no configurado." };
  }

  try {
    const filter = statusFilter
      ? {
          property: "Estado",
          status: { equals: statusFilter },
        }
      : undefined;

    const res = await axios.post(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      filter ? { filter } : {},
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    const items: FeedbackItem[] = (res.data?.results || []).map((page: any) => {
      const props = page.properties;
      return {
        id: page.id,
        title: props.Titulo?.title?.[0]?.plain_text || "Sin título",
        type: props.Tipo?.select?.name || "Sugerencia",
        status: props.Estado?.status?.name || "Nuevo",
        priority: props.Prioridad?.select?.name || "Media",
        author: props.Autor?.rich_text?.[0]?.plain_text || "Anónimo",
        detail: props.Detalle?.rich_text?.[0]?.plain_text || "",
        url: page.url,
        createdAt: page.created_time,
      };
    });

    return { success: true, items };
  } catch (err: any) {
    const detail = err?.response?.data?.message || err?.message || "Error al consultar Notion";
    console.error("[Notion Service] Error al obtener items:", detail);
    return { success: false, items: [], error: detail };
  }
}

export async function updateFeedbackStatus(
  pageId: string,
  status: "Nuevo" | "En Progreso" | "Resuelto" | "Descartado"
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) return { success: false, error: "NOTION_API_KEY no configurada." };

  try {
    await axios.patch(
      `https://api.notion.com/v1/pages/${pageId}`,
      {
        properties: {
          Estado: {
            status: { name: status },
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );
    return { success: true };
  } catch (err: any) {
    const detail = err?.response?.data?.message || err?.message || "Error al actualizar estado";
    return { success: false, error: detail };
  }
}

export async function archiveFeedbackItem(pageId: string): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) return { success: false, error: "NOTION_API_KEY no configurada." };

  try {
    await axios.patch(
      `https://api.notion.com/v1/pages/${pageId}`,
      { archived: true },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );
    return { success: true };
  } catch (err: any) {
    const detail = err?.response?.data?.message || err?.message || "Error al archivar item";
    return { success: false, error: detail };
  }
}

export async function createFeedbackItem(rawInput: unknown): Promise<NotionFeedbackResult> {
  const parseResult = feedbackPayloadSchema.safeParse(rawInput);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.errors.map((e) => e.message).join(", ");
    return { success: false, error: errorMsg };
  }

  const payload: FeedbackPayload = parseResult.data;
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = (process.env.NOTION_FEEDBACK_DB_ID || DEFAULT_FEEDBACK_DB_ID).replace(/-/g, "");

  const configResult = notionConfigSchema.safeParse({ apiKey, databaseId });
  if (!configResult.success) {
    console.warn("[Notion Service] Servicio no configurado. NOTION_API_KEY ausente o inválida.");
    return { success: false, error: "Servicio de Notion no configurado en el servidor." };
  }

  try {
    const res = await axios.post(
      "https://api.notion.com/v1/pages",
      {
        parent: { database_id: databaseId },
        properties: {
          Titulo: {
            title: [{ text: { content: payload.title } }],
          },
          Tipo: {
            select: { name: payload.type },
          },
          Estado: {
            status: { name: "Nuevo" },
          },
          Prioridad: {
            select: { name: payload.priority },
          },
          Origen: {
            select: { name: payload.origin },
          },
          Autor: {
            rich_text: [{ text: { content: payload.author } }],
          },
          Detalle: {
            rich_text: payload.detail ? [{ text: { content: payload.detail.slice(0, 2000) } }] : [],
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    const pageId = res.data?.id;
    const url = res.data?.url;
    return { success: true, pageId, url };
  } catch (err: any) {
    const detail = err?.response?.data?.message || err?.message || "Error desconocido";
    console.error("[Notion Service] Error al registrar página:", detail);
    return { success: false, error: detail };
  }
}
