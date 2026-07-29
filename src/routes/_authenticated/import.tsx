import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, X, UploadCloud } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, EmptyState } from "@/components/page-blocks";
import { supabase } from "@/integrations/supabase/client";
import { fetchCustomers, fetchInvoices, fetchSettings, qk } from "@/lib/data";
import { addDaysISO, fmtKES } from "@/lib/format";
import { useAuthz } from "@/hooks/use-authz";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({
    meta: [
      { title: "Excel Import — Foxtrot Aging Accounts" },
      { name: "description", content: "Import invoices from Excel with column mapping, validation preview and duplicate detection." },
      { property: "og:title", content: "Excel Import — Foxtrot Aging Accounts" },
      { property: "og:description", content: "Import invoices from Excel with column mapping, validation preview and duplicate detection." },
    ],
  }),
  component: ImportPage,
});

const FIELDS = [
  { key: "customer_name", label: "Customer / business name", required: true },
  { key: "customer_code", label: "Customer code", required: false },
  { key: "invoice_number", label: "Invoice number", required: true },
  { key: "invoice_date", label: "Invoice date", required: true },
  { key: "due_date", label: "Due date", required: false },
  { key: "credit_days", label: "Credit days", required: false },
  { key: "invoice_amount", label: "Invoice amount (KES)", required: true },
  { key: "amount_paid", label: "Amount already paid", required: false },
  { key: "notes", label: "Notes", required: false },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];
type RawRow = Record<string, unknown>;

function toISODate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return isFinite(n) ? n : null;
}

function autoGuess(header: string): FieldKey | "" {
  const h = header.toLowerCase();
  if (h.includes("code")) return "customer_code";
  if (h.includes("customer") || h.includes("business") || h.includes("client")) return "customer_name";
  if (h.includes("invoice") && (h.includes("no") || h.includes("num") || h.includes("#"))) return "invoice_number";
  if (h.includes("due")) return "due_date";
  if (h.includes("credit")) return "credit_days";
  if (h.includes("date")) return "invoice_date";
  if (h.includes("paid")) return "amount_paid";
  if (h.includes("amount") || h.includes("total") || h.includes("value")) return "invoice_amount";
  if (h.includes("note") || h.includes("remark")) return "notes";
  return "";
}

function ImportPage() {
  const queryClient = useQueryClient();
  const { isManager } = useAuthz();
  const { data: customers } = useQuery({ queryKey: qk.customers, queryFn: fetchCustomers });
  const { data: invoices } = useQuery({ queryKey: qk.invoices, queryFn: fetchInvoices });
  const { data: settings } = useQuery({ queryKey: qk.settings, queryFn: fetchSettings });

  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [parsing, setParsing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState("");
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [raw, setRaw] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({} as Record<FieldKey, string>);

  function loadSheet(wb: XLSX.WorkBook, name: string) {
    const rows = XLSX.utils.sheet_to_json<RawRow>(wb.Sheets[name], { defval: "" });
    const hdrs = rows.length ? Object.keys(rows[0]) : [];
    setRaw(rows);
    setHeaders(hdrs);
    const guessed = {} as Record<FieldKey, string>;
    for (const h of hdrs) {
      const g = autoGuess(h);
      if (g && !guessed[g]) guessed[g] = h;
    }
    setMapping(guessed);
  }

  function resetFile() {
    setRaw([]);
    setHeaders([]);
    setFileName("");
    setFileSize(0);
    setWorkbook(null);
    setSheets([]);
    setSheet("");
    setMapping({} as Record<FieldKey, string>);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext ?? "")) {
      toast.error("Unsupported file type. Upload an .xlsx, .xls or .csv file.");
      return;
    }
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      if (!wb.SheetNames.length) throw new Error("The workbook has no sheets");
      setWorkbook(wb);
      setFileName(file.name);
      setFileSize(file.size);
      setSheets(wb.SheetNames);
      setSheet(wb.SheetNames[0]);
      loadSheet(wb, wb.SheetNames[0]);
      toast.success(`${file.name} loaded`);
    } catch (e) {
      resetFile();
      toast.error(e instanceof Error ? e.message : "Could not read that file");
    } finally {
      setParsing(false);
    }
  }


  const existingInvoiceNumbers = useMemo(
    () => new Set((invoices ?? []).map((i) => i.invoice_number.toLowerCase())),
    [invoices],
  );

  const preview = useMemo(() => {
    const seen = new Set<string>();
    return raw.map((r, idx) => {
      const get = (k: FieldKey) => (mapping[k] ? r[mapping[k]] : undefined);
      const name = String(get("customer_name") ?? "").trim();
      const code = String(get("customer_code") ?? "").trim();
      const number = String(get("invoice_number") ?? "").trim();
      const invDate = toISODate(get("invoice_date"));
      const creditDays = toNumber(get("credit_days")) ?? settings?.default_credit_days ?? 30;
      const dueDate = toISODate(get("due_date")) ?? (invDate ? addDaysISO(invDate, creditDays) : null);
      const amount = toNumber(get("invoice_amount"));
      const paid = toNumber(get("amount_paid")) ?? 0;
      const notes = String(get("notes") ?? "").trim();

      const messages: string[] = [];
      if (!name && !code) messages.push("Missing customer");
      if (!number) messages.push("Missing invoice number");
      if (!invDate) messages.push("Invalid invoice date");
      if (amount == null || amount <= 0) messages.push("Invalid amount");
      if (paid < 0) messages.push("Negative amount paid");
      if (amount != null && paid > amount) messages.push("Paid exceeds invoice amount");

      let status: "valid" | "warning" | "duplicate" | "rejected" = messages.length ? "rejected" : "valid";
      const key = number.toLowerCase();
      if (status === "valid" && (existingInvoiceNumbers.has(key) || seen.has(key))) {
        status = "duplicate";
        messages.push("Invoice number already exists");
      }
      if (status === "valid" && !code) {
        status = "warning";
        messages.push("No customer code — matched or created by name");
      }
      if (number) seen.add(key);

      return { idx, name, code, number, invDate, dueDate, creditDays, amount, paid, notes, status, messages };
    });
  }, [raw, mapping, settings, existingInvoiceNumbers]);

  const counts = {
    total: preview.length,
    valid: preview.filter((p) => p.status === "valid" || p.status === "warning").length,
    warning: preview.filter((p) => p.status === "warning").length,
    duplicate: preview.filter((p) => p.status === "duplicate").length,
    rejected: preview.filter((p) => p.status === "rejected").length,
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const importable = preview.filter((p) => p.status === "valid" || p.status === "warning");
      if (importable.length === 0) throw new Error("No valid rows to import");

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      const { data: batch, error: batchErr } = await supabase
        .from("import_batches")
        .insert({
          file_name: fileName,
          total_rows: counts.total,
          approved_rows: importable.length,
          duplicate_rows: counts.duplicate,
          rejected_rows: counts.rejected,
          warning_rows: counts.warning,
          status: "processing",
          uploaded_by: userId,
        })
        .select("*")
        .single();
      if (batchErr) throw batchErr;

      // Resolve or create customers
      const byName = new Map((customers ?? []).map((c) => [c.business_name.toLowerCase(), c]));
      const byCode = new Map((customers ?? []).map((c) => [c.customer_code.toLowerCase(), c]));
      const resolved = new Map<string, string>();

      for (const row of importable) {
        const key = (row.code || row.name).toLowerCase();
        if (resolved.has(key)) continue;
        const existing = (row.code && byCode.get(row.code.toLowerCase())) || byName.get(row.name.toLowerCase());
        if (existing) {
          resolved.set(key, existing.id);
          continue;
        }
        const code = row.code || `C-${row.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const { data: created, error: cErr } = await supabase
          .from("customers")
          .insert({
            business_name: row.name || code,
            customer_code: code,
            credit_days: row.creditDays,
          })
          .select("*")
          .single();
        if (cErr) throw cErr;
        resolved.set(key, created.id);
      }

      const invoiceRows = importable.map((row) => ({
        customer_id: resolved.get((row.code || row.name).toLowerCase())!,
        invoice_number: row.number,
        invoice_date: row.invDate!,
        due_date: row.dueDate!,
        credit_days: row.creditDays,
        invoice_amount: row.amount!,
        amount_paid: row.paid,
        notes: row.notes || null,
        import_batch_id: batch.id,
        source_sheet: sheet,
        source_row: row.idx + 2,
        created_by: userId,
      }));

      const { error: invErr } = await supabase.from("invoices").insert(invoiceRows);
      if (invErr) throw invErr;

      const { error: rowsErr } = await supabase.from("import_rows").insert(
        preview.map((p) => ({
          import_batch_id: batch.id,
          sheet_name: sheet,
          source_row: p.idx + 2,
          raw_data: raw[p.idx] as never,
          mapped_data: {
            customer: p.name,
            invoice_number: p.number,
            invoice_date: p.invDate,
            due_date: p.dueDate,
            invoice_amount: p.amount,
            amount_paid: p.paid,
          } as never,
          validation_status: p.status,
          validation_messages: p.messages,
        })),
      );
      if (rowsErr) throw rowsErr;

      await supabase.from("import_batches").update({ status: "completed" }).eq("id", batch.id);
      return importable.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} invoices imported`);
      resetFile();
      queryClient.invalidateQueries({ queryKey: qk.invoices });
      queryClient.invalidateQueries({ queryKey: qk.customers });
    },

    onError: (e: Error) => toast.error(e.message),
  });

  const missingRequired = FIELDS.filter((f) => f.required && !mapping[f.key]).map((f) => f.label);

  return (
    <div>
      <PageHeader
        title="Excel Import"
        description="Upload an invoice workbook, map the columns, review the validation preview and import."
      />

      <Card className="mb-4">
        <CardHeader className="pb-2"><CardTitle className="text-base">1. Upload workbook</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Excel or CSV file</Label>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={!isManager}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
          </div>
          {sheets.length > 1 && (
            <div>
              <Label className="text-xs">Sheet</Label>
              <Select
                value={sheet}
                onValueChange={(v) => { setSheet(v); if (workbook) loadSheet(workbook, v); }}
              >
                <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sheets.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {fileName && <p className="text-sm text-muted-foreground">{fileName} · {raw.length} rows</p>}
        </CardContent>
      </Card>

      {headers.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="text-base">2. Map columns</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <Label className="text-xs">
                  {f.label}{f.required && <span className="text-destructive"> *</span>}
                </Label>
                <Select
                  value={mapping[f.key] ?? "__none"}
                  onValueChange={(v) => setMapping({ ...mapping, [f.key]: v === "__none" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Not mapped" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Not mapped</SelectItem>
                    {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {preview.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">3. Preview & import</CardTitle>
            <div className="flex flex-wrap gap-2 pt-2">
              <Badge variant="outline">{counts.total} rows</Badge>
              <Badge variant="outline" className="bg-success/15 text-success border-success/30">{counts.valid} importable</Badge>
              <Badge variant="outline" className="bg-warning/15 text-warning-foreground border-warning/40">{counts.warning} warnings</Badge>
              <Badge variant="outline" className="bg-muted text-muted-foreground">{counts.duplicate} duplicates</Badge>
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">{counts.rejected} rejected</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Invoice date</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead>Validation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.slice(0, 200).map((p) => (
                    <TableRow key={p.idx}>
                      <TableCell className="text-xs text-muted-foreground">{p.idx + 2}</TableCell>
                      <TableCell>{p.name || p.code || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{p.number || "—"}</TableCell>
                      <TableCell>{p.invDate ?? "—"}</TableCell>
                      <TableCell>{p.dueDate ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.amount != null ? fmtKES(p.amount) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtKES(p.paid)}</TableCell>
                      <TableCell className="text-xs">
                        <Badge
                          variant="outline"
                          className={
                            p.status === "valid"
                              ? "bg-success/15 text-success border-success/30"
                              : p.status === "warning"
                                ? "bg-warning/15 text-warning-foreground border-warning/40"
                                : p.status === "duplicate"
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-destructive/10 text-destructive border-destructive/30"
                          }
                        >
                          {p.status}
                        </Badge>
                        {p.messages.length > 0 && <span className="ml-2 text-muted-foreground">{p.messages.join("; ")}</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
              <p className="text-sm text-muted-foreground">
                {missingRequired.length > 0
                  ? `Map required columns: ${missingRequired.join(", ")}`
                  : `${counts.valid} rows will be imported. Duplicates and rejected rows are skipped.`}
              </p>
              <Button
                disabled={!isManager || missingRequired.length > 0 || counts.valid === 0 || importMutation.isPending}
                onClick={() => importMutation.mutate()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {importMutation.isPending ? "Importing…" : `Import ${counts.valid} invoices`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {preview.length === 0 && !fileName && (
        <EmptyState title="No file selected" description="Choose an Excel or CSV file to begin the import." />
      )}
    </div>
  );
}
