'use strict';

/**
 * scripts/importBackup.js
 *
 * Importa um ficheiro de backup JSON para o MongoDB Atlas (Render).
 * Usa upsert por _id — nunca cria duplicados, faz update se o doc já existir.
 *
 * USO:
 *   node scripts/importBackup.js                      # usa o ficheiro mais recente em backup/
 *   node scripts/importBackup.js backup/backup-....json  # ficheiro específico
 *   npm run db:import
 *
 * VARIÁVEIS DE AMBIENTE (.env):
 *   MONGO_ATLAS_URI  — URI do MongoDB Atlas / Render (obrigatório)
 *                      ex: mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/AzoresScorepap
 *
 * COMPORTAMENTO:
 *   - Lê o ficheiro JSON gerado por exportBackup.js
 *   - Para cada coleção: bulkWrite com updateOne + upsert:true (por _id)
 *   - Inseridos = novos documentos; Modificados = documentos já existentes atualizados
 *   - Erros numa coleção não param a importação das restantes
 *   - Logs detalhados por coleção + tabela de resumo no final
 *   - Idempotente: pode ser executado múltiplas vezes sem criar duplicados
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { MongoClient } = require('mongodb');
const fs   = require('fs');
const path = require('path');

// ─── Configuração ─────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;
const BACKUP_DIR = path.join(__dirname, '../backup');

// Coleções a não importar (internas ou de controlo)
const SKIP_IMPORT = new Set(['system.indexes', 'system.users', 'system.version']);

// ─── Utilitários ──────────────────────────────────────────────────────────────

/** Mascara a password numa URI MongoDB para logs seguros. */
function maskUri(uri) {
  try {
    return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
  } catch {
    return '(URI inválida)';
  }
}

/** Loga uma linha formatada com timestamp. */
function log(level, msg) {
  const ts    = new Date().toISOString();
  const icons = { INFO: 'ℹ', OK: '✅', WARN: '⚠', ERR: '❌', DATA: '📦' };
  const icon  = icons[level] ?? '•';
  console.log(`[${ts}] ${icon}  ${msg}`);
}

/**
 * Descobre o ficheiro de backup mais recente em backup/
 * @returns {string|null} caminho absoluto ou null se não existir
 */
function findLatestBackup() {
  if (!fs.existsSync(BACKUP_DIR)) return null;

  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
    .sort() // ordem lexicográfica = ordem cronológica dado o formato backup-YYYY-MM-DD_HH-MM-SS
    .reverse();

  return files.length > 0 ? path.join(BACKUP_DIR, files[0]) : null;
}

/**
 * Executa bulkWrite com upsert em batches de BATCH_SIZE.
 * @returns {{ inserted: number, modified: number, errors: number }}
 */
async function upsertCollectionInBatches(collection, docs, colName) {
  let inserted = 0;
  let modified = 0;
  let errors   = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batchDocs = docs.slice(i, i + BATCH_SIZE);

    const operations = batchDocs.map((doc) => ({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: doc },
        upsert: true,
      },
    }));

    try {
      const result = await collection.bulkWrite(operations, { ordered: false });
      inserted += result.upsertedCount  ?? 0;
      modified += result.modifiedCount  ?? 0;
      // matchedCount inclui os upserted, mas modifiedCount é o que realmente mudou
    } catch (err) {
      // BulkWriteError: pode ter resultados parciais
      if (err.result) {
        inserted += err.result.upsertedCount ?? 0;
        modified += err.result.modifiedCount ?? 0;
        errors   += err.result.writeErrors?.length ?? batchDocs.length;
        log('WARN', `  "${colName}" — batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.result.writeErrors?.length ?? '?'} erros parciais`);
      } else {
        errors += batchDocs.length;
        log('ERR', `  "${colName}" — batch ${Math.floor(i / BATCH_SIZE) + 1} falhou: ${err.message}`);
      }
    }

    const done = Math.min(i + BATCH_SIZE, docs.length);
    if (docs.length > BATCH_SIZE) {
      log('DATA', `  "${colName}" — ${done}/${docs.length} documentos processados...`);
    }
  }

  return { inserted, modified, errors };
}

/** Formata número com separador de milhar para legibilidade. */
function fmt(n) { return Number(n).toLocaleString('pt-PT'); }

// ─── Script principal ─────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         AzoresScore — Importação para Atlas/Render       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // ── 1. Validação das variáveis de ambiente ────────────────────────────────
  const atlasUri = process.env.MONGO_ATLAS_URI;

  if (!atlasUri) {
    log('ERR', 'MONGO_ATLAS_URI não está definida no ficheiro .env');
    log('ERR', 'Exemplo: MONGO_ATLAS_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/AzoresScorepap?retryWrites=true&w=majority');
    process.exit(1);
  }

  log('INFO', `Destino: ${maskUri(atlasUri)}`);

  // ── 2. Encontrar o ficheiro de backup ─────────────────────────────────────
  let backupPath = process.argv[2] ?? null;

  if (backupPath) {
    // Torna o caminho absoluto se for relativo (relativo à pasta do projeto)
    if (!path.isAbsolute(backupPath)) {
      backupPath = path.join(__dirname, '..', backupPath);
    }
    if (!fs.existsSync(backupPath)) {
      log('ERR', `Ficheiro não encontrado: ${backupPath}`);
      process.exit(1);
    }
    log('INFO', `Ficheiro especificado: ${backupPath}`);
  } else {
    backupPath = findLatestBackup();
    if (!backupPath) {
      log('ERR', 'Nenhum ficheiro de backup encontrado em backup/');
      log('ERR', 'Execute primeiro: npm run db:export');
      process.exit(1);
    }
    log('INFO', `Ficheiro mais recente: ${path.basename(backupPath)}`);
  }

  // ── 3. Ler e validar o ficheiro JSON ──────────────────────────────────────
  console.log('');
  log('INFO', 'A ler o ficheiro de backup...');

  let backup;
  try {
    const raw = fs.readFileSync(backupPath, 'utf8');
    backup = JSON.parse(raw);
  } catch (err) {
    log('ERR', `Não foi possível ler/parsear o ficheiro: ${err.message}`);
    process.exit(1);
  }

  if (!backup.metadata || !backup.data) {
    log('ERR', 'Formato do ficheiro inválido. Certifique-se que foi gerado por exportBackup.js.');
    process.exit(1);
  }

  const { metadata, data } = backup;
  log('OK', `Backup de: ${metadata.exportedAt}`);
  log('INFO', `BD de origem: ${metadata.dbName}`);
  log('INFO', `Total de documentos no backup: ${fmt(metadata.totalDocuments)}`);
  log('INFO', `Coleções no backup: ${metadata.totalCollections}`);
  console.log('');

  // ── 4. Ligação ao Atlas ───────────────────────────────────────────────────
  let client;
  try {
    log('INFO', 'A ligar ao Atlas...');
    client = new MongoClient(atlasUri, {
      serverSelectionTimeoutMS: 15_000,
      connectTimeoutMS: 15_000,
    });
    await client.connect();
    log('OK', 'Ligação ao Atlas estabelecida.');
    console.log('');
  } catch (err) {
    log('ERR', `Não foi possível ligar ao Atlas: ${err.message}`);
    log('ERR', 'Verifique MONGO_ATLAS_URI e as permissões de rede (IP whitelist).');
    process.exit(1);
  }

  // Extrai nome da BD do URI do Atlas (fallback: nome da BD local do backup)
  let dbName;
  try {
    const normalized = atlasUri
      .replace(/^mongodb\+srv:\/\//, 'http://')
      .replace(/^mongodb:\/\//, 'http://');
    const url = new URL(normalized);
    dbName = url.pathname.slice(1).split('?')[0] || metadata.dbName;
  } catch {
    dbName = metadata.dbName;
  }

  const db = client.db(dbName);
  log('INFO', `A importar para a BD: ${dbName}`);
  console.log('');

  // ── 5. Importar coleção a coleção ─────────────────────────────────────────
  const collectionNames = Object.keys(data);
  const stats           = [];
  let   totalInserted   = 0;
  let   totalModified   = 0;
  let   totalErrors     = 0;
  let   collectionsOk   = 0;
  let   collectionsErr  = 0;
  const startTime       = Date.now();

  for (const colName of collectionNames) {
    if (SKIP_IMPORT.has(colName)) {
      log('WARN', `A saltar "${colName}" (coleção de sistema).`);
      continue;
    }

    const docs = data[colName];

    if (!Array.isArray(docs) || docs.length === 0) {
      log('INFO', `"${colName}" — sem documentos, a saltar.`);
      stats.push({ name: colName, docs: 0, inserted: 0, modified: 0, errors: 0, status: 'VAZIO' });
      continue;
    }

    log('INFO', `A importar "${colName}" (${fmt(docs.length)} docs)...`);

    try {
      const result = await upsertCollectionInBatches(
        db.collection(colName),
        docs,
        colName,
      );

      totalInserted += result.inserted;
      totalModified += result.modified;
      totalErrors   += result.errors;

      const hasErr = result.errors > 0;
      if (hasErr) collectionsErr++; else collectionsOk++;

      stats.push({
        name:     colName,
        docs:     docs.length,
        inserted: result.inserted,
        modified: result.modified,
        errors:   result.errors,
        status:   hasErr ? 'AVISO' : 'OK',
      });

      log(hasErr ? 'WARN' : 'OK',
        `  "${colName}" — inseridos: ${fmt(result.inserted)} | atualizados: ${fmt(result.modified)} | erros: ${result.errors}`);

    } catch (err) {
      collectionsErr++;
      totalErrors += docs.length;
      stats.push({ name: colName, docs: docs.length, inserted: 0, modified: 0, errors: docs.length, status: 'ERRO' });
      log('ERR', `  "${colName}" — falha total: ${err.message}`);
    }
  }

  await client.close();

  const elapsedMs = Date.now() - startTime;

  // ── 6. Tabela de resumo ───────────────────────────────────────────────────
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                          RESUMO DA IMPORTAÇÃO                               ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');

  // Cabeçalho da tabela
  console.log('║  ' + 'Coleção'.padEnd(28) + '  ' + 'Docs'.padStart(7) + '  ' + 'Inseridos'.padStart(9) + '  ' + 'Atualizados'.padStart(11) + '  ' + 'Erros'.padStart(5) + '  ' + 'Estado'.padEnd(6) + '  ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');

  for (const s of stats) {
    const name = s.name.length > 28 ? s.name.slice(0, 25) + '...' : s.name.padEnd(28);
    const icon = s.status === 'OK' ? '✅' : s.status === 'AVISO' ? '⚠ ' : s.status === 'VAZIO' ? '—  ' : '❌';
    console.log(
      '║  ' +
      name                          + '  ' +
      fmt(s.docs).padStart(7)       + '  ' +
      fmt(s.inserted).padStart(9)   + '  ' +
      fmt(s.modified).padStart(11)  + '  ' +
      String(s.errors).padStart(5)  + '  ' +
      icon                          + '      ║',
    );
  }

  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
  console.log(`║  ${'TOTAL'.padEnd(28)}  ${fmt(metadata.totalDocuments).padStart(7)}  ${fmt(totalInserted).padStart(9)}  ${fmt(totalModified).padStart(11)}  ${String(totalErrors).padStart(5)}        ║`);
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
  console.log(`║  Coleções OK: ${String(collectionsOk).padEnd(5)}  Coleções c/ erros: ${String(collectionsErr).padEnd(5)}  Duração: ${String(elapsedMs + ' ms').padEnd(12)}║`);
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  if (totalErrors > 0) {
    log('WARN', `${totalErrors} documento(s) com erros. Verifique os logs acima para detalhes.`);
  } else {
    log('OK', 'Importação concluída sem erros!');
  }
  console.log('');
}

main().catch((err) => {
  log('ERR', `Erro inesperado: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
