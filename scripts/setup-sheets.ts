/**
 * Google Sheets setup — jedan sheet "Evidencija"
 * Kreira strukturu, dropdowne, formule i sinkronizuje sve podatke iz Supabase.
 *
 * Usage: npm run setup-sheets
 */

import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const SHEET_NAME = 'Evidencija';
const PACKAGES = ['Set 4', 'Set 6', 'Set 6+2', 'Set 8', 'Set 8+2', 'Set 10+2', 'Set 12', 'Set 12+2', 'Set 12 ind.', 'Pojedinačni'];

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

function fmtDate(d: string) {
  if (!d) return '';
  const [y, m, dd] = d.split('-');
  return `${dd}.${m}.${y}`;
}

function countUsed(sessions: { date: string; time: string; trial: boolean }[]) {
  const today = new Date().toISOString().split('T')[0];
  return sessions.filter(s => !s.trial && s.date <= today).length;
}

async function getOrCreateSheet(): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existing = meta.data.sheets?.find(s => s.properties?.title === SHEET_NAME);
  if (existing) {
    console.log(`  Sheet "${SHEET_NAME}" već postoji — brišem podatke...`);
    // Clear all data except nothing (we'll overwrite)
    await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `'${SHEET_NAME}'!A1:Z10000` });
    return existing.properties!.sheetId!;
  }

  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
  });
  const newId = res.data.replies![0].addSheet!.properties!.sheetId!;
  console.log(`  Sheet "${SHEET_NAME}" kreiran.`);
  return newId;
}

async function writeHeadersAndFormula() {
  const headers = ['Ime', 'Telefon', 'Status', 'Paket', 'Ukupno treninga', 'Iskorišćeno', 'Preostalo', 'Zarada (KM)', 'Datum upisa', 'Zadnja uplata'];

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: `'${SHEET_NAME}'!A1`, values: [headers] },
        // G2: Preostalo = Ukupno - Iskorišćeno (ARRAYFORMULA pokriva sve redove)
        { range: `'${SHEET_NAME}'!G2`, values: [['=ARRAYFORMULA(IF(A2:A<>"",E2:E-F2:F,""))']] },
      ],
    },
  });
  console.log('  Headeri i ARRAYFORMULA (Preostalo) upisani.');
}

async function applyFormatting(sheetId: number) {
  const headerBg  = { red: 0.13, green: 0.10, blue: 0.16 }; // tamno ljubičasta
  const headerFg  = { red: 0.88, green: 0.77, blue: 0.60 }; // brončana
  const formulaBg = { red: 0.10, green: 0.15, blue: 0.13 }; // tamno zelena
  const formulaFg = { red: 0.49, green: 0.84, blue: 0.62 }; // zelena

  const colWidths = [170, 120, 90, 120, 110, 100, 90, 100, 110, 110];

  const requests: object[] = [
    // Zamrzni header red
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    // Header format — cijeli red 1
    {
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
    },
    // Kolona G (Preostalo) header — zelena nijansa
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 6, endColumnIndex: 7 },
        cell: {
          userEnteredFormat: {
            backgroundColor: formulaBg,
            textFormat: { bold: true, foregroundColor: formulaFg, fontSize: 10 },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    },
    // Bold za kolonu A (Ime) u svim redovima
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: 'userEnteredFormat.textFormat.bold',
      },
    },
    // Centriranje za E, F, G, H
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 4, endColumnIndex: 8 },
        cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
        fields: 'userEnteredFormat.horizontalAlignment',
      },
    },
    // Dropdown za C (Status)
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 2, endColumnIndex: 3 },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: [
              { userEnteredValue: 'Aktivna' },
              { userEnteredValue: 'Probni' },
              { userEnteredValue: 'Neaktivna' },
            ],
          },
          showCustomUi: true,
          strict: false,
        },
      },
    },
    // Dropdown za D (Paket)
    {
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 3, endColumnIndex: 4 },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: PACKAGES.map(p => ({ userEnteredValue: p })),
          },
          showCustomUi: true,
          strict: false,
        },
      },
    },
  ];

  // Širine kolona
  colWidths.forEach((px, i) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: px },
        fields: 'pixelSize',
      },
    });
  });

  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } });
  console.log('  Formatiranje, dropdowni i širine kolona primijenjeni.');
}

async function syncData() {
  const { data: members, error } = await supabase
    .from('members')
    .select('*, sessions(*), payments(*)')
    .order('created_at', { ascending: true });

  if (error) { console.error('  Supabase greška:', error.message); return; }
  if (!members?.length) { console.log('  Nema članova u bazi.'); return; }

  const rows: (string | number)[][] = members.map(m => {
    const sessions = (m.sessions ?? []) as { date: string; time: string; trial: boolean }[];
    const payments = (m.payments ?? []) as { date: string; amount: number }[];
    const used = countUsed(sessions);
    const lastPayment = payments.sort((a, b) => b.date.localeCompare(a.date))[0];

    return [
      m.name,
      m.phone || '-',
      m.status === 'active' ? 'Aktivna' : 'Probni',
      m.package || '-',
      m.total_sessions || 0,
      used,
      // G (Preostalo) je formula — ne upisujemo vrijednost
      '',
      m.paid || 0,
      fmtDate(m.trial_date || m.created_at?.split('T')[0] || ''),
      lastPayment ? fmtDate(lastPayment.date) : '-',
    ];
  });

  // Pišemo A-F i H-J (preskačemo G koji je formula)
  // Strategija: pišemo sve kolone, G ostavimo prazan — ARRAYFORMULA ga pokriva
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${SHEET_NAME}'!A2`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });

  console.log(`  Sinkronizovano: ${members.length} članica.`);
}

async function main() {
  console.log('\n🔧 Linea Pilates — Google Sheets setup (jedan sheet)\n');

  if (!SHEET_ID) { console.error('❌ GOOGLE_SHEET_ID nije postavljen'); process.exit(1); }

  console.log('1. Kreiranje/resetovanje sheet-a...');
  const sheetId = await getOrCreateSheet();

  console.log('2. Pisanje headera i formule za Preostalo...');
  await writeHeadersAndFormula();

  console.log('3. Formatiranje, dropdowni (Status, Paket), širine kolona...');
  await applyFormatting(sheetId);

  console.log('4. Sinkronizacija podataka iz Supabase...');
  await syncData();

  console.log('\n✅ Gotovo!');
  console.log(`   Sheet: https://docs.google.com/spreadsheets/d/${SHEET_ID}\n`);
}

main().catch(e => { console.error('❌ Greška:', e.message); process.exit(1); });
