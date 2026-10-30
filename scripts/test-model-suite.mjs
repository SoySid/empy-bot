import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq, { toFile } from 'groq-sdk';
import fs from 'fs';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });

async function runTestSuite() {
  console.log('=== TEST SUITE DE MODELOS Y OPTIMIZACIONES ===\n');

  // 1. Test Gemini Flash Lite Latest
  try {
    const t0 = Date.now();
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });
    const res = await model.generateContent('Deci hola en una sola palabra');
    console.log(`[1] gemini-flash-lite-latest: OK (${Date.now() - t0}ms) -> "${res.response.text().trim()}"`);
  } catch (err) {
    console.error('[1] gemini-flash-lite-latest ERROR:', err.message);
  }

  // 2. Test Groq Whisper Large V3 Turbo
  try {
    const sampleRate = 16000;
    const numSamples = sampleRate * 1;
    const dataSize = numSamples * 2;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    const file = await toFile(buffer, 'test.wav', { type: 'audio/wav' });
    const t0 = Date.now();
    const res = await groq.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3-turbo',
      language: 'es'
    });
    console.log(`[2] Groq whisper-large-v3-turbo: OK (${Date.now() - t0}ms) -> "${res.text.trim()}"`);
  } catch (err) {
    console.error('[2] whisper-large-v3-turbo ERROR:', err.message);
  }

  // 3. Test Groq 120B Reasoning (openai/gpt-oss-120b)
  try {
    const t0 = Date.now();
    const res = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: '¿Quién tiene razón en una discusión entre alguien que dice que la Tierra es redonda y alguien que dice que es plana? Respondé en 1 sola oración.' }],
      max_tokens: 150
    });
    const content = res.choices[0]?.message?.content?.trim();
    console.log(`[3] Groq openai/gpt-oss-120b: OK (${Date.now() - t0}ms) -> "${content}"`);
  } catch (err) {
    console.error('[3] openai/gpt-oss-120b ERROR:', err.message);
  }

  // 4. Test Gemini Code Execution
  try {
    const t0 = Date.now();
    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-lite-latest',
      tools: [{ codeExecution: {} }]
    });
    const res = await model.generateContent('Calculá exactamente (450 * 12) + (180 / 4) y decime solo el resultado final.');
    console.log(`[4] Gemini codeExecution: OK (${Date.now() - t0}ms) -> "${res.response.text().trim().replace(/\n+/g, ' ')}"`);
  } catch (err) {
    console.error('[4] Gemini codeExecution ERROR:', err.message);
  }

  // 5. Test Audio Multimodal Ingestion (Gemini Flash Lite con archivo real)
  try {
    const audioData = fs.readFileSync('sounds/bocina.mp3');
    const t0 = Date.now();
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });
    const audioPart = {
      inlineData: {
        data: audioData.toString('base64'),
        mimeType: 'audio/mp3',
      }
    };
    const res = await model.generateContent(['¿Qué sonido es este? Describilo en 5 palabras.', audioPart]);
    console.log(`[5] Gemini Multimodal Audio: OK (${Date.now() - t0}ms) -> "${res.response.text().trim()}"`);
  } catch (err) {
    console.error('[5] Gemini Multimodal Audio ERROR:', err.message);
  }

  console.log('\n=== FIN DE LA SUITE DE PRUEBAS ===');
}

runTestSuite();
