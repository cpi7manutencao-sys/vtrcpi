// Backup atômico do SQLite via API .backup() (consistente com WAL)
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = path.join(__dirname, 'viaturas.db');
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(__dirname, 'backup');
  fs.mkdirSync(outDir, { recursive: true });

  const mainBak = path.join(outDir, `viaturas-${ts}.db`);
  const db = new Database(src);
  db.pragma('wal_checkpoint(TRUNCATE)'); // flush WAL pro .db principal

  // Stats ANTES do backup
  const stats = {
    units: db.prepare('SELECT COUNT(*) as c FROM units').get().c,
    viaturas: db.prepare('SELECT COUNT(*) as c FROM viaturas').get().c,
    emDescarga: db.prepare('SELECT COUNT(*) as c FROM viaturas WHERE emDescarga=1').get().c,
    agendamentos: db.prepare('SELECT COUNT(*) as c FROM agendamentos').get().c,
    users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    auditLog: db.prepare('SELECT COUNT(*) as c FROM auditLog').get().c,
    rondas: db.prepare('SELECT COUNT(*) as c FROM rondas').get().c,
    ifctAbast: db.prepare('SELECT COUNT(*) as c FROM ifctAbastecimentos').get().c,
    ifctEncer: db.prepare('SELECT COUNT(*) as c FROM ifctEncerramentos').get().c,
  };

  // Backup atômico (Promise no better-sqlite3 v9+)
  await db.backup(mainBak);

  console.log('=== BACKUP ATÔMICO ===');
  console.log('Source:', src);
  console.log('Backup:', mainBak);
  console.log('Size:  ', fs.statSync(mainBak).size, 'bytes');
  console.log('');
  console.log('=== CONTEÚDO DO BACKUP ===');
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k.padEnd(15)} ${v}`);
  }

  // Verifica que o backup abre
  const verify = new Database(mainBak, { readonly: true });
  const vUnits = verify.prepare('SELECT COUNT(*) as c FROM units').get().c;
  const vViaturas = verify.prepare('SELECT COUNT(*) as c FROM viaturas').get().c;
  verify.close();
  console.log('');
  console.log('Verify:', vUnits === stats.units && vViaturas === stats.viaturas ? 'OK ✓' : 'FAIL ✗');

  // Backup do .pre-descarga também (850 viaturas)
  const preDescargaBak = path.join(__dirname, 'viaturas.db.pre-descarga-1789577932824.bak');
  if (fs.existsSync(preDescargaBak)) {
    const dest = path.join(outDir, `viaturas-pre-descarga-850viaturas.db`);
    fs.copyFileSync(preDescargaBak, dest);
    console.log('');
    console.log('Backup pré-descarga:', dest);
    console.log('  size:', fs.statSync(dest).size, 'bytes');
  }

  db.close();
  console.log('');
  console.log('DONE! Backups prontos em:', outDir);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
