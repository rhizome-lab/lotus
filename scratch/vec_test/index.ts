import { Database } from "bun:sqlite";
import * as sqliteVec from "sqlite-vec";

const db = new Database(":memory:");

sqliteVec.load(db);

const version = db.prepare("select vec_version()").get();
console.log(`sqlite-vec version: ${JSON.stringify(version)}`);

db.run("CREATE VIRTUAL TABLE vec_items USING vec0(embedding float[4])");

const stmt = db.prepare("INSERT INTO vec_items(rowid, embedding) VALUES (?, ?)");
stmt.run(1, new Float32Array([0.1, 0.2, 0.3, 0.4]));
stmt.run(2, new Float32Array([0.5, 0.6, 0.7, 0.8]));

const query = db.prepare(`
  SELECT
    rowid,
    distance
  FROM vec_items
  WHERE embedding MATCH ?
  ORDER BY distance
  LIMIT 5
`);

const results = query.all(new Float32Array([0.1, 0.2, 0.3, 0.4]));
console.log("Results:", results);
