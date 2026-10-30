import "dotenv/config";
import pg from "pg";

const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!directUrl) {
  console.error("Falta DIRECT_URL o DATABASE_URL en las variables de entorno.");
  process.exit(1);
}

async function testConnection() {
  const client = new pg.Client({ connectionString: directUrl });
  try {
    console.log("Connecting to Neon PostgreSQL...");
    await client.connect();
    console.log("Connected successfully!");

    const versionRes = await client.query("SELECT version();");
    console.log("PostgreSQL Version:", versionRes.rows[0].version);

    console.log("Enabling pgvector extension...");
    await client.query("CREATE EXTENSION IF NOT EXISTS vector;");
    console.log("pgvector extension enabled successfully!");

    const extRes = await client.query("SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';");
    console.log("Extension details:", extRes.rows[0]);
  } catch (err) {
    console.error("Connection/Extension error:", err);
  } finally {
    await client.end();
  }
}

testConnection();
