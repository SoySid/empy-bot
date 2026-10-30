import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const client = new pg.Client({ connectionString: process.env.DIRECT_URL });

async function testPgVector() {
  await client.connect();
  console.log("Connected to Neon DB for pgvector test...");

  // 1. Create HNSW index if not exists
  console.log("Creating HNSW index for vector_cosine_ops...");
  await client.query(`
    CREATE INDEX IF NOT EXISTS "MessageEmbedding_embedding_hnsw_idx"
    ON "MessageEmbedding"
    USING hnsw ("embedding" vector_cosine_ops);
  `);
  console.log("✅ HNSW index created or verified!");

  // 2. Test inserting a test vector of 768 dimensions
  const dummyVector = Array.from({ length: 768 }, (_, i) => Number((Math.sin(i) * 0.05).toFixed(6)));
  const vectorStr = `[${dummyVector.join(",")}]`;

  console.log("Inserting test vector record...");
  const insertRes = await client.query(`
    INSERT INTO "MessageEmbedding" ("id", "userJid", "senderName", "body", "vector", "embedding", "createdAt")
    VALUES (gen_random_uuid(), 'test@s.whatsapp.net', 'Tester', 'Prueba de memoria vectorial pgvector', $1, $2::vector, NOW())
    RETURNING "id", "senderName", "body";
  `, [vectorStr, vectorStr]);
  console.log("✅ Inserted record:", insertRes.rows[0]);

  // 3. Test cosine distance search (<=>)
  console.log("Running cosine similarity query (<=>)...");
  const searchRes = await client.query(`
    SELECT
      "id",
      "senderName",
      "body",
      "createdAt",
      1 - ("embedding" <=> $1::vector) AS similarity
    FROM "MessageEmbedding"
    WHERE "embedding" IS NOT NULL
    ORDER BY "embedding" <=> $1::vector ASC
    LIMIT 3;
  `, [vectorStr]);

  console.log("✅ Search results with cosine similarity:");
  for (const row of searchRes.rows) {
    console.log(`- ${row.senderName}: "${row.body}" (similitud: ${Number(row.similarity).toFixed(4)})`);
  }

  // 4. Clean up test record
  await client.query(`DELETE FROM "MessageEmbedding" WHERE "userJid" = 'test@s.whatsapp.net';`);
  console.log("🧹 Test record cleaned up.");

  await client.end();
}

testPgVector().catch(console.error);
