import ExcelJS from "exceljs";

// Step 1 of the import: read the sheets into plain rows keyed by header name.
// No interpretation happens here; every value is kept as written.

export type Cell = string | number | boolean | null;

export interface SourceRow {
  sheet: string;
  rowNumber: number;
  cells: Record<string, Cell>;
}

export interface StockBook {
  stock: SourceRow[];
  jobs: SourceRow[];
  minLevels: SourceRow[];
  vans: SourceRow[];
}

const SHEETS = {
  stock: { name: "Stock", headers: ["van", "sku", "qty", "last_counted"] },
  jobs: { name: "Jobs", headers: ["job_ref", "requested", "date", "type", "status"] },
  minLevels: { name: "Min levels", headers: ["sku", "min_per_van", "serialised"] },
  vans: { name: "Vans", headers: ["van", "plate", "status"] },
} as const;

export async function readStockBook(data: ArrayBuffer): Promise<StockBook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);

  const read = (key: keyof typeof SHEETS) => {
    const { name, headers } = SHEETS[key];
    const sheet = workbook.getWorksheet(name);
    if (!sheet) throw new Error(`The workbook has no "${name}" sheet`);
    return readSheet(sheet, headers);
  };

  return { stock: read("stock"), jobs: read("jobs"), minLevels: read("minLevels"), vans: read("vans") };
}

/** Finds the header row by its column names (the title rows above it vary), then reads every row below. */
function readSheet(sheet: ExcelJS.Worksheet, requiredHeaders: readonly string[]): SourceRow[] {
  let headerRow = 0;
  let headers: string[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (headerRow) return;
    const names = rowValues(row).map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""));
    if (requiredHeaders.every((h) => names.includes(h))) {
      headerRow = rowNumber;
      headers = names;
    }
  });
  if (!headerRow) throw new Error(`Sheet "${sheet.name}" has no header row with ${requiredHeaders.join(", ")}`);

  const rows: SourceRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    const values = rowValues(row);
    if (values.every((v) => v === null || v === "")) return;
    const cells: Record<string, Cell> = {};
    headers.forEach((header, index) => {
      if (header) cells[header] = values[index] ?? null;
    });
    rows.push({ sheet: sheet.name, rowNumber, cells });
  });
  return rows;
}

function rowValues(row: ExcelJS.Row): Cell[] {
  const values: Cell[] = [];
  for (let column = 1; column <= row.cellCount; column++) values.push(toCell(row.getCell(column).value));
  return values;
}

function toCell(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("result" in value) return toCell(value.result as ExcelJS.CellValue);
  if ("text" in value) return String(value.text);
  return null; // error cells
}
