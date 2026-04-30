import { google } from 'googleapis';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Evidencija';

function getClient() {
  if (!SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    return null;
  }
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function append(row: (string | number)[]) {
  const client = getClient();
  if (!client) return;
  try {
    await client.spreadsheets.values.append({
      spreadsheetId: SHEET_ID!,
      range: `'${SHEET_NAME}'!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
  } catch (e) {
    console.error('[Sheets] append error:', (e as Error).message);
  }
}

async function findRowIndex(memberName: string): Promise<number | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const res = await client.spreadsheets.values.get({
      spreadsheetId: SHEET_ID!,
      range: `'${SHEET_NAME}'!A:A`,
    });
    const rows = res.data.values ?? [];
    const idx = rows.findIndex((r, i) => i > 0 && r[0] === memberName);
    return idx > 0 ? idx + 1 : null; // 1-indexed
  } catch {
    return null;
  }
}

async function updateRow(rowNum: number, updates: Record<string, string | number>) {
  const client = getClient();
  if (!client) return;
  try {
    await client.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID!,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: Object.entries(updates).map(([col, val]) => ({
          range: `'${SHEET_NAME}'!${col}${rowNum}`,
          values: [[val]],
        })),
      },
    });
  } catch (e) {
    console.error('[Sheets] update error:', (e as Error).message);
  }
}

function fmtDate(d: string) {
  if (!d) return '';
  const [y, m, dd] = d.split('-');
  return `${dd}.${m}.${y}`;
}

// ─── Public sync functions ────────────────────────────────────────────────────

// Called when a new member is created
export function syncNewMember(name: string, phone: string, date: string) {
  append([name, phone || '-', 'Probni', '-', 0, 0, '', 0, fmtDate(date), '-']).catch(() => {});
  // Cols: A=Ime, B=Tel, C=Status, D=Paket, E=Ukupno, F=Iskorišćeno, G=Preostalo(formula), H=Zarada, I=Datum upisa, J=Zadnja uplata
}

// Called when a payment is added
export function syncPayment(
  memberName: string,
  pkg: string,
  newTotalSessions: number,
  usedSessions: number,
  totalPaid: number,
  paymentDate: string,
) {
  findRowIndex(memberName).then(rowNum => {
    if (!rowNum) return;
    updateRow(rowNum, {
      C: 'Aktivna',
      D: pkg,
      E: newTotalSessions,
      F: usedSessions,
      H: totalPaid,
      J: fmtDate(paymentDate),
    });
  }).catch(() => {});
}

// Called when a session is booked (updates used count)
export function syncSessionBooked(memberName: string, usedSessions: number) {
  findRowIndex(memberName).then(rowNum => {
    if (!rowNum) return;
    updateRow(rowNum, { F: usedSessions });
  }).catch(() => {});
}
