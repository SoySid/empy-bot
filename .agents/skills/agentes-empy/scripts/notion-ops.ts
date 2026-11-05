import "dotenv/config";
import { getFeedbackItems, updateFeedbackStatus, archiveFeedbackItem, createFeedbackItem } from "../../../../src/services/notion.service.js";

const [, , action, arg1, arg2, arg3] = process.argv;

async function main() {
  switch (action) {
    case "list": {
      const statusFilter = arg1 && arg1 !== "all" ? arg1 : undefined;
      const res = await getFeedbackItems(statusFilter);
      if (!res.success) {
        console.error(`❌ Error Notion: ${res.error}`);
        process.exit(1);
      }
      const activeItems = statusFilter
        ? res.items
        : res.items.filter((i) => i.status === "Nuevo" || i.status === "En Progreso");

      console.log(JSON.stringify({ total: activeItems.length, items: activeItems }, null, 2));
      break;
    }

    case "status": {
      if (!arg1 || !arg2) {
        console.error("Uso: npx tsx .agents/skills/agentes-empy/scripts/notion-ops.ts status <pageId> <Nuevo|En Progreso|Resuelto|Descartado>");
        process.exit(1);
      }
      const validStatuses = ["Nuevo", "En Progreso", "Resuelto", "Descartado"] as const;
      if (!validStatuses.includes(arg2 as any)) {
        console.error(`Estado inválido: ${arg2}. Valores permitidos: ${validStatuses.join(", ")}`);
        process.exit(1);
      }
      const res = await updateFeedbackStatus(arg1, arg2 as any);
      console.log(JSON.stringify(res));
      break;
    }

    case "archive": {
      if (!arg1) {
        console.error("Uso: npx tsx .agents/skills/agentes-empy/scripts/notion-ops.ts archive <pageId>");
        process.exit(1);
      }
      const res = await archiveFeedbackItem(arg1);
      console.log(JSON.stringify(res));
      break;
    }

    case "create": {
      if (!arg1) {
        console.error("Uso: npx tsx .agents/skills/agentes-empy/scripts/notion-ops.ts create <titulo> [Bug|Sugerencia|Roadmap|Mejora Técnica] [Alta|Media|Baja]");
        process.exit(1);
      }
      const res = await createFeedbackItem({
        title: arg1,
        type: (arg2 as any) || "Mejora Técnica",
        priority: (arg3 as any) || "Media",
        author: "Jefe Sid (Squad)",
        detail: "Creado desde el Orquestador /agentes-empy",
      });
      console.log(JSON.stringify(res));
      break;
    }

    default:
      console.log(
        "Comandos disponibles:\n" +
          "  list [Nuevo|En Progreso|Resuelto|all]\n" +
          "  status <pageId> <Nuevo|En Progreso|Resuelto|Descartado>\n" +
          "  archive <pageId>\n" +
          "  create <titulo> [Tipo] [Prioridad]"
      );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
