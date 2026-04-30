import { google } from 'googleapis';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const DAYS_SR = ['Nedjelja', 'Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota'];

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

async function append(sheetName: string, row: (string | number)[]) {
  const client = getClient();
  if (!client) return;
  try {
    await client.spreadsheets.values.append({
      spreadsheetId: SHEET_ID!,
      range: `'${sheetName}'!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
  } catch (e) {
    console.error('[Sheets] append error:', (e as Error).message);
  }
}

async function findRowAndUpdate(sheetName: string, memberName: string, updates: Record<string, string | number>) {
  const client = getClient();
  if (!client) return;
  try {
    const res = await client.spreadsheets.values.get({
      spreadsheetId: SHEET_ID!,
      range: `'${sheetName}'!A:A`,
    });
    const rows = res.data.values ?? [];
    const rowIdx = rows.findIndex((r, i) => i > 0 && r[0] === memberName);
    if (rowIdx < 1) return;
    const rowNum = rowIdx + 1;

    await client.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID!,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: Object.entries(updates).map(([col, val]) => ({
          range: `'${sheetName}'!${col}${rowNum}`,
          values: [[val]],
        })),
      },
    });
  } catch (e) {
    console.error('[Sheets] update error:', (e as Error).message);
  }
}

function timestamp() {
  return new Date().toLocaleString('sr-Latn', {
    timeZone: 'Europe/Sarajevo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Called when a new member is created (trial)
export function syncNewMember(name: string, phone: string, date: string) {
  append('Članice', [name, phone || '-', 'Probni', '-', 0, date]).catch(() => {});
}

// Called when a payment is added — updates Uplate sheet and member row in Članice
export function syncPayment(
  memberName: string,
  pkg: string,
  amount: number,
  sessions: number,
  newTotalSessions: number,
  date: string,
) {
  append('Uplate', [date, memberName, pkg, amount, sessions, timestamp()]).catch(() => {});
  findRowAndUpdate('Članice', memberName, {
    C: 'Aktivna',
    D: pkg,
    E: newTotalSessions,
  }).catch(() => {});
}

// Called when a session is booked
export function syncSession(memberName: string, date: string, time: string, trial: boolean) {
  const d = new Date(date);
  append('Termini', [
    date,
    DAYS_SR[d.getDay()],
    memberName,
    time,
    trial ? 'Probni' : 'Redovni',
    timestamp(),
  ]).catch(() => {});
}
