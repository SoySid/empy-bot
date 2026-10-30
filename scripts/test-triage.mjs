import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function testTriage() {
  const start = Date.now();
  const completion = await groq.chat.completions.create({
    model: "qwen/qwen3.8-27b",
    messages: [
      {
        role: "system",
        content: `Sos el evaluador de triage para el bot Empy en un grupo de WhatsApp.
Dado el historial reciente de 5 mensajes, decidí si Empy debe intervenir.
Respondé ÚNICAMENTE un JSON con este formato:
{
  "should_intervene": boolean,
  "intent": "broma" | "opinion" | "consejo" | "chicana" | "recuerdo" | "silencio",
  "reason": "breve motivo"
}`,
      },
      {
        role: "user",
        content: `Historial de los últimos 5 mensajes:
[UserA]: che quien juega ajedrez hoy?
[UserB]: yo no puedo, tengo que laburar
[UserA]: uffa siempre ocupado vos
[UserC]: yo juego una si quieren
[UserA]: dale conectate`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 150,
  });

  const duration = Date.now() - start;
  console.log(`⏱️ Duration: ${duration}ms`);
  console.log("Result:", completion.choices[0].message.content);
}

testTriage().catch(console.error);
