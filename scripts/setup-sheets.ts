/**
 * One-time Google Sheets setup script.
 * Creates sheet tabs, headers, ARRAYFORMULA columns, formatting,
 * and does an initial full sync of all existing Supabase data.
 *
 * Usage:
 *   npm run setup-sheets
 */

import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const DAYS_SR = ['Nedjelja', 'Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota'];

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Sheet definitions ────────────────────────────────────────────────────────

const SHEET_DEFS = {
  Članice: {
    headers: ['Ime', 'Telefon', 'Status', 'Paket', 'Ukupno treninga', 'Datum dodavanja', 'Iskorišćeno', 'Preostalo', 'Zarada (KM)'],
    // Columns G, H, I are ARRAYFORMULA — only A-F are written by app
    frozenRows: 1,
    colWidths: [180, 130, 90, 120, 110, 130, 100, 90, 100],
  },
  Termini: {
    headers: ['Datum', 'Dan', 'Ime', 'Termin', 'Tip', 'Upisano'],
    frozenRows: 1,
    colWidths: [100, 110, 180, 70, 80, 130],
  },
  Uplate: {
    headers: ['Datum', 'Ime', 'Paket', 'Iznos (KM)', 'Br. treninga', 'Upisano'],
    frozenRows: 1,
    colWidths: [100, 180, 120, 90, 90, 130],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function col(letter: string, row: number) {
  return `${letter}${row}`;
}

async function ensureSheets(existingSheets: { id: number; title: string }[]) {
  const existingTitles = existingSheets.map(s => s.title);
  const toCreate = Object.keys(SHEET_DEFS).filter(t => !existingTitles.includes(t));

  if (toCreate.length === 0) {
    console.log('  All sheets already exist.');
    return;
  }

  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: toCreate.map(title => ({ addSheet: { properties: { title } } })),
    },
  });
  console.log(`  Created sheets: ${toCreate.join(', ')}`);

  // Add newly created sheets to our list
  res.data.replies?.forEach((reply, i) => {
    const props = reply.addSheet?.properties;
    if (props?.sheetId != null && props.title) {
      existingSheets.push({ id: props.sheetId, title: props.title });
    }
  });
}

async function writeHeaders() {
  const data = Object.entries(SHEET_DEFS).map(([name, def]) => ({
    range: `'${name}'!A1`,
    values: [def.headers],
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });
  console.log('  Headers written.');
}

async function writeFormulas() {
  // Članice: G, H, I are formula columns (ARRAYFORMULA starting at row 2)
  // G = Iskorišćeno: count non-trial sessions from Termini
  // H = Preostalo: total_sessions (col E) - iskorišćeno
  // I = Zarada: sum from Uplate
  const formulas = [
    {
      range: "'Članice'!G2",
      values: [['=ARRAYFORMULA(IF(A2:A<>"",COUNTIFS(Termini!C:C,A2:A,Termini!E:E,"Redovni"),""))']],
    },
    {
      range: "'Članice'!H2",
      values: [['=ARRAYFORMULA(IF(A2:A<>"",E2:E-COUNTIFS(Termini!C:C,A2:A,Termini!E:E,"Redovni"),""))']],
    },
    {
      range: "'Članice'!I2",
      values: [['=ARRAYFORMULA(IF(A2:A<>"",SUMIF(Uplate!B:B,A2:A,Uplate!D:D),""))']],
    },
  ];

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data: formulas },
  });
  console.log('  ARRAYFORMULA written to Članice G2, H2, I2.');
}

async function applyFormatting(sheetList: { id: number; title: string }[]) {
  const getSheetId = (title: string) => sheetList.find(s => s.title === title)?.id ?? 0;

  const headerBg = { red: 0.13, green: 0.10, blue: 0.16 }; // dark purple ~#211929
  const headerFg = { red: 0.88, green: 0.77, blue: 0.60 }; // bronze ~#E0C499

  const requests: object[] = [];

  for (const [sheetTitle, def] of Object.entries(SHEET_DEFS)) {
    const sheetId = getSheetId(sheetTitle);

    // Freeze header row
    requests.push({
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: def.frozenRows } },
        fields: 'gridProperties.frozenRowCount',
      },
    });

    // Bold + background + text color for header row
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: headerBg,
            textFormat: { bold: true, foregroundColor: headerFg, fontSize: 10 },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    });

    // Column widths
    def.colWidths.forEach((px, i) => {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
          properties: { pixelSize: px },
          fields: 'pixelSize',
        },
      });
    });

    // For Članice: shade formula columns (G, H, I) slightly differently
    if (sheetTitle === 'Članice') {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 6, endColumnIndex: 9 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.16, green: 0.18, blue: 0.22 },
              textFormat: { bold: true, foregroundColor: { red: 0.50, green: 0.85, blue: 0.63 }, fontSize: 10 },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      });
    }
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests },
  });
  console.log('  Formatting applied.');
}

// ─── Initial data sync ────────────────────────────────────────────────────────

function ts(dateStr: string) {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

async function syncAllData() {
  const { data: members, error } = await supabase
    .from('members')
    .select('*, sessions(*), payments(*)')
    .order('created_at', { ascending: true });

  if (error) { console.error('  Supabase error:', error.message); return; }
  if (!members || members.length === 0) { console.log('  No members found in DB.'); return; }

  // Clear existing data (keep headers + formulas)
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: "'Članice'!A2:F" });
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: "'Termini'!A2:F" });
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: "'Uplate'!A2:F" });

  // Build rows
  const memberRows: (string | number)[][] = [];
  const sessionRows: (string | number)[][] = [];
  const paymentRows: (string | number)[][] = [];

  for (const m of members) {
    memberRows.push([
      m.name,
      m.phone || '-',
      m.status === 'active' ? 'Aktivna' : 'Probni',
      m.package || '-',
      m.total_sessions || 0,
      ts(m.trial_date || m.created_at),
    ]);

    for (const s of (m.sessions ?? [])) {
      const d = new Date(s.date);
      sessionRows.push([s.date, DAYS_SR[d.getDay()], m.name, s.time, s.trial ? 'Probni' : 'Redovni', '']);
    }

    for (const p of (m.payments ?? [])) {
      paymentRows.push([p.date, m.name, p.package, p.amount, p.sessions, '']);
    }
  }

  // Write in one batchUpdate
  const data = [];
  if (memberRows.length)  data.push({ range: "'Članice'!A2",  values: memberRows });
  if (sessionRows.length) data.push({ range: "'Termini'!A2",  values: sessionRows });
  if (paymentRows.length) data.push({ range: "'Uplate'!A2",   values: paymentRows });

  if (data.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data },
    });
  }

  console.log(`  Synced: ${memberRows.length} članica, ${sessionRows.length} termina, ${paymentRows.length} uplata.`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔧 Linea Pilates — Google Sheets setup\n');

  if (!SHEET_ID) { console.error('❌ GOOGLE_SHEET_ID nije postavljen u .env.local'); process.exit(1); }
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) { console.error('❌ GOOGLE_SERVICE_ACCOUNT_EMAIL nije postavljen'); process.exit(1); }
  if (!process.env.GOOGLE_PRIVATE_KEY) { console.error('❌ GOOGLE_PRIVATE_KEY nije postavljen'); process.exit(1); }

  // Get existing spreadsheet metadata
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheetList = (meta.data.sheets ?? []).map(s => ({
    id: s.properties?.sheetId ?? 0,
    title: s.properties?.title ?? '',
  }));

  console.log('1. Kreiranje sheet tabova...');
  await ensureSheets(sheetList);

  // Refresh list after creation
  const metaFresh = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheetListFresh = (metaFresh.data.sheets ?? []).map(s => ({
    id: s.properties?.sheetId ?? 0,
    title: s.properties?.title ?? '',
  }));

  console.log('2. Pisanje headera...');
  await writeHeaders();

  console.log('3. Pisanje ARRAYFORMULA (Iskorišćeno, Preostalo, Zarada)...');
  await writeFormulas();

  console.log('4. Formatiranje (boje, bold, zamrznuti redovi, širine kolona)...');
  await applyFormatting(sheetListFresh);

  console.log('5. Inicijalni sync svih podataka iz Supabase...');
  await syncAllData();

  console.log('\n✅ Setup završen!');
  console.log(`   Sheet URL: https://docs.google.com/spreadsheets/d/${SHEET_ID}\n`);
}

main().catch(e => { console.error('❌ Greška:', e.message); process.exit(1); });
