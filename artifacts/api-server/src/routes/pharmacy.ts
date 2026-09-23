import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import {
  CreateCustomerBody,
  CreateMedicineBody,
  CreatePurchaseBody,
  CreateSaleBody,
  CreateSupplierBody,
  GetCurrentUserResponse,
  GetCustomerParams,
  GetMedicineParams,
  GetReportSummaryQueryParams,
  GetSaleInvoiceParams,
  GetSaleParams,
  GetSalesChartQueryParams,
  ListCustomersQueryParams,
  ListInventoryQueryParams,
  ListMedicinesQueryParams,
  ListPurchasesQueryParams,
  ListSalesQueryParams,
  ListSuppliersQueryParams,
  LoginBody,
  LoginResponse,
  UpdateMedicineBody,
  UpdateMedicineParams,
} from "@workspace/api-zod";
import {
  auditHash,
  clearSessionCookie,
  createSessionId,
  hashPassword,
  requireAuth,
  requireRoles,
  resolveUser,
  setSessionCookie,
  verifyPassword,
} from "../middleware/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asInt = (value: unknown, fallback = 0) => Math.trunc(asNumber(value, fallback));
const money = (value: unknown) => Math.round(asNumber(value) * 100) / 100;
const dateOnly = (value: unknown) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10));

function userPayload(user: { id: number; name: string; email: string; role: string }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function queryParams(req: Request) {
  return req.query as Record<string, string | undefined>;
}

async function writeAudit(userId: number | undefined, action: string, entity: string, entityId?: number, metadata: Record<string, unknown> = {}) {
  await pool.query(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata) VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [userId ?? null, action, entity, entityId ?? null, JSON.stringify(metadata)],
  );
}

async function medicineById(id: number) {
  const result = await pool.query(
    `SELECT m.*, c.name AS category_name,
      COALESCE((SELECT SUM(quantity) FROM batches b WHERE b.medicine_id = m.id), 0)::int AS stock,
      COALESCE((SELECT SUM(quantity * purchase_price) FROM batches b WHERE b.medicine_id = m.id), 0)::numeric AS inventory_value,
      (SELECT MIN(expiry_date) FROM batches b WHERE b.medicine_id = m.id AND b.quantity > 0) AS nearest_expiry
     FROM medicines m JOIN categories c ON c.id = m.category_id WHERE m.id = $1`,
    [id],
  );
  return result.rows[0];
}

function medicinePayload(row: any) {
  return {
    id: row.id,
    name: row.name,
    genericName: row.generic_name,
    brand: row.brand,
    manufacturer: row.manufacturer,
    categoryId: row.category_id,
    categoryName: row.category_name,
    dosageForm: row.dosage_form,
    strength: row.strength,
    barcode: row.barcode,
    gstPercent: asNumber(row.gst_percent),
    prescriptionRequired: row.prescription_required,
    reorderLevel: row.reorder_level,
    description: row.description,
    active: row.active,
    stock: asInt(row.stock),
    inventoryValue: money(row.inventory_value),
    nearestExpiry: row.nearest_expiry,
    createdAt: row.created_at,
  };
}

async function supplierPayload(row: any) {
  const stats = await pool.query(
    `SELECT COUNT(*)::int AS purchase_count, COALESCE(SUM(total), 0)::numeric AS total_purchased
     FROM purchases WHERE supplier_id = $1`,
    [row.id],
  );
  const stat = stats.rows[0];
  return {
    id: row.id,
    companyName: row.company_name,
    contactPerson: row.contact_person,
    phone: row.phone,
    email: row.email,
    address: row.address,
    gstNumber: row.gst_number,
    purchaseCount: stat?.purchase_count ?? 0,
    totalPurchased: money(stat?.total_purchased),
  };
}

async function customerPayload(row: any) {
  const stats = await pool.query(
    `SELECT COUNT(*)::int AS purchase_count, COALESCE(SUM(total), 0)::numeric AS total_spent,
            MAX(sale_date) AS last_purchase_date
     FROM sales WHERE customer_id = $1`,
    [row.id],
  );
  const stat = stats.rows[0];
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    purchaseCount: stat?.purchase_count ?? 0,
    totalSpent: money(stat?.total_spent),
    lastPurchaseDate: stat?.last_purchase_date ?? null,
  };
}

async function salePayload(id: number) {
  const sale = await pool.query(
    `SELECT s.*, c.name AS customer_name, c.phone AS customer_phone,
            u.id AS cashier_id, u.name AS cashier_name, u.email AS cashier_email, u.role AS cashier_role
     FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id
     JOIN users u ON u.id = s.cashier_id
     WHERE s.id = $1`,
    [id],
  );
  if (!sale.rows[0]) return undefined;
  const row = sale.rows[0];
  const items = await pool.query(
    `SELECT si.*, m.name AS medicine_name
     FROM sale_items si JOIN medicines m ON m.id = si.medicine_id
     WHERE si.sale_id = $1 ORDER BY si.id`,
    [id],
  );
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    saleDate: row.sale_date,
    customer: row.customer_name ? {
      id: row.customer_id,
      name: row.customer_name,
      phone: row.customer_phone,
      email: null,
      address: "",
      purchaseCount: 0,
      totalSpent: 0,
      lastPurchaseDate: null,
    } : null,
    subtotal: money(row.subtotal),
    discountAmount: money(row.discount_amount),
    gstTotal: money(row.gst_total),
    total: money(row.total),
    paymentMethod: row.payment_method,
    items: items.rows.map((item) => ({
      id: item.id,
      medicineId: item.medicine_id,
      medicineName: item.medicine_name,
      quantity: item.quantity,
      discountPercent: asNumber(item.discount_percent),
      batchNumber: item.batch_number,
      unitPrice: money(item.unit_price),
      gstAmount: money(item.gst_amount),
      lineTotal: money(item.line_total),
    })),
    cashier: {
      id: row.cashier_id,
      name: row.cashier_name,
      email: row.cashier_email,
      role: row.cashier_role,
    },
  };
}

router.post("/auth/login", async (req, res) => {
  try {
    const body = LoginBody.parse(req.body);
    const result = await pool.query(`SELECT id, name, email, role, password_hash FROM users WHERE LOWER(email) = LOWER($1) AND active = true LIMIT 1`, [body.email]);
    const user = result.rows[0];
    if (!user || !verifyPassword(body.password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const sessionId = createSessionId();
    await pool.query(`INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '8 hours')`, [sessionId, user.id]);
    setSessionCookie(res, sessionId);
    await writeAudit(user.id, "LOGIN", "User", user.id);
    return res.json(LoginResponse.parse({ user: userPayload(user) }));
  } catch (error) {
    logger.error({ error }, "Login failed");
    return res.status(400).json({ error: "Unable to log in" });
  }
});

router.get("/auth/me", async (req, res) => {
  const user = await resolveUser(req);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  return res.json(GetCurrentUserResponse.parse(userPayload(user)));
});

router.post("/auth/logout", async (req, res) => {
  const session = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("pharmacy_session="));
  if (session) await pool.query(`DELETE FROM sessions WHERE id = $1`, [decodeURIComponent(session.slice("pharmacy_session=".length))]);
  clearSessionCookie(res);
  return res.status(204).send();
});

router.get("/dashboard/summary", requireAuth, async (_req, res) => {
  const [metrics, lowStock, recentSales, topSelling] = await Promise.all([
    pool.query(
      `SELECT
        (SELECT COUNT(*) FROM sales WHERE sale_date::date = CURRENT_DATE)::int AS today_sales,
        (SELECT COALESCE(SUM(total), 0) FROM sales WHERE sale_date::date = CURRENT_DATE)::numeric AS today_revenue,
        (SELECT COALESCE(SUM(total), 0) FROM sales WHERE sale_date >= date_trunc('month', CURRENT_DATE))::numeric AS monthly_revenue,
        (SELECT COUNT(*) FROM sales)::int AS transaction_count,
        (SELECT COALESCE(SUM(quantity * purchase_price), 0) FROM batches WHERE quantity > 0)::numeric AS inventory_value,
        (SELECT COUNT(*) FROM medicines m WHERE COALESCE((SELECT SUM(quantity) FROM batches b WHERE b.medicine_id = m.id), 0) <= m.reorder_level AND m.active = true)::int AS low_stock_count,
        (SELECT COUNT(*) FROM batches WHERE quantity > 0 AND expiry_date < CURRENT_DATE)::int AS expired_count,
        (SELECT COUNT(*) FROM batches WHERE quantity > 0 AND expiry_date >= CURRENT_DATE AND expiry_date <= CURRENT_DATE + INTERVAL '90 days')::int AS expiring_count`,
    ),
    pool.query(`SELECT m.*, c.name AS category_name, COALESCE(SUM(b.quantity), 0)::int AS stock, COALESCE(SUM(b.quantity * b.purchase_price), 0)::numeric AS inventory_value, MIN(b.expiry_date) AS nearest_expiry
      FROM medicines m JOIN categories c ON c.id = m.category_id LEFT JOIN batches b ON b.medicine_id = m.id
      WHERE m.active = true GROUP BY m.id, c.name HAVING COALESCE(SUM(b.quantity), 0) <= m.reorder_level ORDER BY stock ASC LIMIT 5`),
    pool.query(`SELECT id FROM sales ORDER BY sale_date DESC LIMIT 5`),
    pool.query(`SELECT m.id AS medicine_id, m.name AS medicine_name, SUM(si.quantity)::int AS quantity, SUM(si.line_total)::numeric AS revenue
      FROM sale_items si JOIN medicines m ON m.id = si.medicine_id GROUP BY m.id, m.name ORDER BY quantity DESC LIMIT 5`),
  ]);
  const metric = metrics.rows[0] ?? {};
  const recent = await Promise.all(recentSales.rows.map((row) => salePayload(row.id)));
  return res.json({
    todaySales: asInt(metric.today_sales),
    todayRevenue: money(metric.today_revenue),
    monthlyRevenue: money(metric.monthly_revenue),
    transactionCount: asInt(metric.transaction_count),
    inventoryValue: money(metric.inventory_value),
    lowStockCount: asInt(metric.low_stock_count),
    expiredCount: asInt(metric.expired_count),
    expiringCount: asInt(metric.expiring_count),
    lowStock: lowStock.rows.map(medicinePayload),
    recentSales: recent.filter(Boolean),
    topSelling: topSelling.rows.map((row) => ({ medicineId: row.medicine_id, medicineName: row.medicine_name, quantity: asInt(row.quantity), revenue: money(row.revenue) })),
  });
});

router.get("/dashboard/sales-chart", requireAuth, async (req, res) => {
  const query = GetSalesChartQueryParams.parse(queryParams(req));
  const days = query.days ?? 30;
  const result = await pool.query(
    `SELECT d::date AS date, COALESCE(SUM(s.total), 0)::numeric AS revenue, COUNT(s.id)::int AS transactions
     FROM generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, INTERVAL '1 day') d
     LEFT JOIN sales s ON s.sale_date::date = d::date
     GROUP BY d::date ORDER BY d::date`,
    [days],
  );
  return res.json(result.rows.map((row) => ({ date: row.date, revenue: money(row.revenue), transactions: asInt(row.transactions) })));
});

router.get("/categories", requireAuth, async (_req, res) => {
  const result = await pool.query(`SELECT c.id, c.name, COUNT(m.id)::int AS medicine_count FROM categories c LEFT JOIN medicines m ON m.category_id = c.id GROUP BY c.id ORDER BY c.name`);
  return res.json(result.rows.map((row) => ({ id: row.id, name: row.name, medicineCount: row.medicine_count })));
});

router.get("/medicines", requireAuth, async (req, res) => {
  const query = ListMedicinesQueryParams.parse(queryParams(req));
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const offset = (page - 1) * pageSize;
  const search = query.search ?? "";
  const conditions = ["($1 = '' OR m.name ILIKE '%' || $1 || '%' OR m.generic_name ILIKE '%' || $1 || '%' OR m.barcode ILIKE '%' || $1 || '%')", "($2::int IS NULL OR m.category_id = $2)"];
  const values: unknown[] = [search, query.categoryId ?? null];
  if (query.status === "active") conditions.push("m.active = true");
  if (query.status === "inactive") conditions.push("m.active = false");
  if (query.status === "low_stock") conditions.push("COALESCE((SELECT SUM(quantity) FROM batches b2 WHERE b2.medicine_id = m.id), 0) <= m.reorder_level");
  if (query.status === "expired") conditions.push("EXISTS (SELECT 1 FROM batches b2 WHERE b2.medicine_id = m.id AND b2.quantity > 0 AND b2.expiry_date < CURRENT_DATE)");
  if (query.status === "expiring") conditions.push("EXISTS (SELECT 1 FROM batches b2 WHERE b2.medicine_id = m.id AND b2.quantity > 0 AND b2.expiry_date >= CURRENT_DATE AND b2.expiry_date <= CURRENT_DATE + INTERVAL '90 days')");
  const where = conditions.join(" AND ");
  const [rows, count] = await Promise.all([
    pool.query(`SELECT m.*, c.name AS category_name, COALESCE((SELECT SUM(quantity) FROM batches b WHERE b.medicine_id = m.id), 0)::int AS stock, COALESCE((SELECT SUM(quantity * purchase_price) FROM batches b WHERE b.medicine_id = m.id), 0)::numeric AS inventory_value, (SELECT MIN(expiry_date) FROM batches b WHERE b.medicine_id = m.id AND b.quantity > 0) AS nearest_expiry FROM medicines m JOIN categories c ON c.id = m.category_id WHERE ${where} ORDER BY m.name LIMIT $3 OFFSET $4`, [...values, pageSize, offset]),
    pool.query(`SELECT COUNT(*)::int AS total FROM medicines m WHERE ${where}`, values),
  ]);
  return res.json({ items: rows.rows.map(medicinePayload), page, pageSize, total: count.rows[0]?.total ?? 0 });
});

router.post("/medicines", requireAuth, requireRoles("ADMIN", "PHARMACIST"), async (req, res) => {
  try {
    const body = CreateMedicineBody.parse(req.body);
    const result = await pool.query(`INSERT INTO medicines (name, generic_name, brand, manufacturer, category_id, dosage_form, strength, barcode, gst_percent, prescription_required, reorder_level, description, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`, [body.name, body.genericName ?? "", body.brand ?? "", body.manufacturer ?? "", body.categoryId, body.dosageForm, body.strength ?? "", body.barcode?.trim() || null, body.gstPercent, body.prescriptionRequired, body.reorderLevel, body.description ?? "", body.active]);
    const id = result.rows[0].id;
    await writeAudit(req.user!.id, "CREATE", "Medicine", id);
    return res.status(201).json(medicinePayload(await medicineById(id)));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid medicine" });
  }
});

router.get("/medicines/:id", requireAuth, async (req, res) => {
  const params = GetMedicineParams.parse(req.params);
  const row = await medicineById(params.id);
  if (!row) return res.status(404).json({ error: "Medicine not found" });
  const batches = await pool.query(`SELECT b.*, s.company_name AS supplier_name FROM batches b JOIN suppliers s ON s.id = b.supplier_id WHERE b.medicine_id = $1 ORDER BY b.expiry_date`, [params.id]);
  return res.json({ ...medicinePayload(row), batches: batches.rows.map((batch) => ({ id: batch.id, batchNumber: batch.batch_number, manufacturingDate: batch.manufacturing_date, expiryDate: batch.expiry_date, purchasePrice: money(batch.purchase_price), sellingPrice: money(batch.selling_price), mrp: money(batch.mrp), quantity: batch.quantity, supplierName: batch.supplier_name })) });
});

router.patch("/medicines/:id", requireAuth, requireRoles("ADMIN", "PHARMACIST"), async (req, res) => {
  try {
    const params = UpdateMedicineParams.parse(req.params);
    const body = UpdateMedicineBody.parse(req.body);
    await pool.query(`UPDATE medicines SET name=$1, generic_name=$2, brand=$3, manufacturer=$4, category_id=$5, dosage_form=$6, strength=$7, barcode=$8, gst_percent=$9, prescription_required=$10, reorder_level=$11, description=$12, active=$13, updated_at=NOW() WHERE id=$14`, [body.name, body.genericName ?? "", body.brand ?? "", body.manufacturer ?? "", body.categoryId, body.dosageForm, body.strength ?? "", body.barcode?.trim() || null, body.gstPercent, body.prescriptionRequired, body.reorderLevel, body.description ?? "", body.active, params.id]);
    const row = await medicineById(params.id);
    if (!row) return res.status(404).json({ error: "Medicine not found" });
    await writeAudit(req.user!.id, "UPDATE", "Medicine", params.id);
    return res.json(medicinePayload(row));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid medicine" });
  }
});

router.post("/medicines/:id/deactivate", requireAuth, requireRoles("ADMIN", "PHARMACIST"), async (req, res) => {
  const id = asInt(req.params.id);
  await pool.query(`UPDATE medicines SET active = false, updated_at = NOW() WHERE id = $1`, [id]);
  const row = await medicineById(id);
  if (!row) return res.status(404).json({ error: "Medicine not found" });
  await writeAudit(req.user!.id, "DEACTIVATE", "Medicine", id);
  return res.json(medicinePayload(row));
});

router.get("/inventory", requireAuth, async (req, res) => {
  const query = ListInventoryQueryParams.parse(queryParams(req));
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const search = query.search ?? "";
  const result = await pool.query(`SELECT m.id, m.name, m.generic_name, m.brand, m.manufacturer, m.category_id, m.dosage_form, m.strength, m.barcode, m.gst_percent, m.prescription_required, m.reorder_level, m.description, m.active, m.created_at, c.name AS category_name, COALESCE(SUM(b.quantity), 0)::int AS stock, COALESCE(SUM(b.quantity * b.purchase_price), 0)::numeric AS inventory_value, MIN(b.expiry_date) AS nearest_expiry FROM medicines m JOIN categories c ON c.id = m.category_id LEFT JOIN batches b ON b.medicine_id = m.id WHERE m.name ILIKE '%' || $1 || '%' OR m.generic_name ILIKE '%' || $1 || '%' GROUP BY m.id, c.name ORDER BY m.name`, [search]);
  const items = [];
  for (const row of result.rows) {
    const batches = await pool.query(`SELECT b.*, s.company_name AS supplier_name FROM batches b JOIN suppliers s ON s.id = b.supplier_id WHERE b.medicine_id = $1 ORDER BY b.expiry_date`, [row.id]);
    const hasExpired = batches.rows.some((batch) => batch.quantity > 0 && String(batch.expiry_date) < new Date().toISOString().slice(0, 10));
    const nearest = batches.rows.find((batch) => batch.quantity > 0);
    const days = nearest ? Math.ceil((new Date(String(nearest.expiry_date)).getTime() - Date.now()) / 86400000) : null;
    const status = hasExpired ? "expired" : days !== null && days <= 90 ? "expiring" : asInt(row.stock) <= row.reorder_level ? "low_stock" : "healthy";
    if (query.status !== "all" && query.status !== status) continue;
    items.push({ medicine: medicinePayload(row), batches: batches.rows.map((batch) => ({ id: batch.id, batchNumber: batch.batch_number, manufacturingDate: batch.manufacturing_date, expiryDate: batch.expiry_date, purchasePrice: money(batch.purchase_price), sellingPrice: money(batch.selling_price), mrp: money(batch.mrp), quantity: batch.quantity, supplierName: batch.supplier_name })), status, daysUntilExpiry: days });
  }
  const start = (page - 1) * pageSize;
  return res.json({ items: items.slice(start, start + pageSize), page, pageSize, total: items.length });
});

router.get("/suppliers", requireAuth, async (req, res) => {
  const query = ListSuppliersQueryParams.parse(queryParams(req));
  const result = await pool.query(`SELECT * FROM suppliers WHERE $1 = '' OR company_name ILIKE '%' || $1 || '%' OR contact_person ILIKE '%' || $1 || '%' ORDER BY company_name`, [query.search ?? ""]);
  return res.json(await Promise.all(result.rows.map(supplierPayload)));
});

router.post("/suppliers", requireAuth, requireRoles("ADMIN", "PHARMACIST"), async (req, res) => {
  try {
    const body = CreateSupplierBody.parse(req.body);
    const result = await pool.query(`INSERT INTO suppliers (company_name, contact_person, phone, email, address, gst_number) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [body.companyName, body.contactPerson, body.phone, body.email ?? null, body.address, body.gstNumber ?? ""]);
    await writeAudit(req.user!.id, "CREATE", "Supplier", result.rows[0].id);
    return res.status(201).json(await supplierPayload(result.rows[0]));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid supplier" });
  }
});

router.get("/customers", requireAuth, async (req, res) => {
  const query = ListCustomersQueryParams.parse(queryParams(req));
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const search = query.search ?? "";
  const [rows, count] = await Promise.all([
    pool.query(`SELECT * FROM customers WHERE $1 = '' OR name ILIKE '%' || $1 || '%' OR phone ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%' ORDER BY name LIMIT $2 OFFSET $3`, [search, pageSize, (page - 1) * pageSize]),
    pool.query(`SELECT COUNT(*)::int AS total FROM customers WHERE $1 = '' OR name ILIKE '%' || $1 || '%' OR phone ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%'`, [search]),
  ]);
  return res.json({ items: await Promise.all(rows.rows.map(customerPayload)), page, pageSize, total: count.rows[0]?.total ?? 0 });
});

router.post("/customers", requireAuth, async (req, res) => {
  try {
    const body = CreateCustomerBody.parse(req.body);
    const result = await pool.query(`INSERT INTO customers (name, phone, email, address) VALUES ($1,$2,$3,$4) RETURNING *`, [body.name, body.phone, body.email ?? null, body.address]);
    await writeAudit(req.user!.id, "CREATE", "Customer", result.rows[0].id);
    return res.status(201).json(await customerPayload(result.rows[0]));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid customer" });
  }
});

router.get("/customers/:id", requireAuth, async (req, res) => {
  const params = GetCustomerParams.parse(req.params);
  const result = await pool.query(`SELECT * FROM customers WHERE id = $1`, [params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: "Customer not found" });
  const sales = await pool.query(`SELECT id FROM sales WHERE customer_id = $1 ORDER BY sale_date DESC`, [params.id]);
  return res.json({ ...(await customerPayload(result.rows[0])), sales: (await Promise.all(sales.rows.map((sale) => salePayload(sale.id)))).filter(Boolean) });
});

router.post("/purchases", requireAuth, requireRoles("ADMIN", "PHARMACIST"), async (req, res) => {
  const client = await pool.connect();
  try {
    const body = CreatePurchaseBody.parse(req.body);
    await client.query("BEGIN");
    let subtotal = 0;
    let gstTotal = 0;
    const prepared: any[] = [];
    for (const item of body.items) {
      const medicine = await client.query(`SELECT id FROM medicines WHERE id = $1 FOR UPDATE`, [item.medicineId]);
      if (!medicine.rows[0]) throw new HttpError(400, "Medicine not found");
      const line = money(item.quantity * item.purchasePrice);
      const gst = money(line * item.gstPercent / 100);
      subtotal += line;
      gstTotal += gst;
      let batch = (await client.query(`SELECT id FROM batches WHERE medicine_id = $1 AND supplier_id = $2 AND batch_number = $3 AND expiry_date = $4 LIMIT 1`, [item.medicineId, body.supplierId, item.batchNumber, item.expiryDate])).rows[0];
      if (batch) {
        await client.query(`UPDATE batches SET quantity = quantity + $1, purchase_price = $2, selling_price = $3, mrp = $4 WHERE id = $5`, [item.quantity, item.purchasePrice, item.sellingPrice, item.mrp, batch.id]);
      } else {
        batch = (await client.query(`INSERT INTO batches (medicine_id, supplier_id, batch_number, manufacturing_date, expiry_date, purchase_price, selling_price, mrp, quantity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [item.medicineId, body.supplierId, item.batchNumber, item.manufacturingDate, item.expiryDate, item.purchasePrice, item.sellingPrice, item.mrp, item.quantity])).rows[0];
      }
      prepared.push({ ...item, batchId: batch.id, lineTotal: money(line + gst) });
    }
    const total = money(subtotal + gstTotal);
    const purchase = (await client.query(`INSERT INTO purchases (supplier_id, invoice_number, purchase_date, subtotal, gst_total, total, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [body.supplierId, body.invoiceNumber, dateOnly(body.purchaseDate), subtotal, gstTotal, total, body.notes ?? "", req.user!.id])).rows[0];
    for (const item of prepared) {
      await client.query(`INSERT INTO purchase_items (purchase_id, medicine_id, batch_id, batch_number, manufacturing_date, expiry_date, quantity, purchase_price, selling_price, mrp, gst_percent, line_total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [purchase.id, item.medicineId, item.batchId, item.batchNumber, item.manufacturingDate, item.expiryDate, item.quantity, item.purchasePrice, item.sellingPrice, item.mrp, item.gstPercent, item.lineTotal]);
    }
    await client.query(`INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata) VALUES ($1,'CREATE','Purchase',$2,$3::jsonb)`, [req.user!.id, purchase.id, JSON.stringify({ invoiceNumber: body.invoiceNumber })]);
    await client.query("COMMIT");
    return res.status(201).json({ id: purchase.id, invoiceNumber: body.invoiceNumber, purchaseDate: dateOnly(body.purchaseDate), supplier: await supplierPayload((await pool.query(`SELECT * FROM suppliers WHERE id = $1`, [body.supplierId])).rows[0]), subtotal, gstTotal, total, items: prepared.map((item, index) => ({ ...item, id: index + 1, medicineName: "" })), createdAt: new Date().toISOString() });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to complete purchase" });
  } finally {
    client.release();
  }
});

router.get("/purchases", requireAuth, async (req, res) => {
  const query = ListPurchasesQueryParams.parse(queryParams(req));
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const result = await pool.query(`SELECT p.*, s.company_name, s.contact_person, s.phone, s.email, s.address, s.gst_number FROM purchases p JOIN suppliers s ON s.id = p.supplier_id WHERE ($1 = '' OR p.invoice_number ILIKE '%' || $1 || '%' OR s.company_name ILIKE '%' || $1 || '%') AND ($2::date IS NULL OR p.purchase_date >= $2::date) AND ($3::date IS NULL OR p.purchase_date <= $3::date) ORDER BY p.purchase_date DESC, p.id DESC LIMIT $4 OFFSET $5`, [query.search ?? "", query.from ?? null, query.to ?? null, pageSize, (page - 1) * pageSize]);
  const count = await pool.query(`SELECT COUNT(*)::int AS total FROM purchases p JOIN suppliers s ON s.id = p.supplier_id WHERE ($1 = '' OR p.invoice_number ILIKE '%' || $1 || '%' OR s.company_name ILIKE '%' || $1 || '%') AND ($2::date IS NULL OR p.purchase_date >= $2::date) AND ($3::date IS NULL OR p.purchase_date <= $3::date)`, [query.search ?? "", query.from ?? null, query.to ?? null]);
  return res.json({ items: await Promise.all(result.rows.map(async (row) => ({ id: row.id, invoiceNumber: row.invoice_number, purchaseDate: row.purchase_date, supplier: await supplierPayload(row), subtotal: money(row.subtotal), gstTotal: money(row.gst_total), total: money(row.total), items: [], createdAt: row.created_at }))), page, pageSize, total: count.rows[0]?.total ?? 0 });
});

router.post("/sales", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const body = CreateSaleBody.parse(req.body);
    await client.query("BEGIN");
    const allocations: any[] = [];
    let subtotal = 0;
    let gstTotal = 0;
    for (const item of body.items) {
      const requested = item.quantity;
      let remaining = requested;
      const batches = await client.query(`SELECT b.*, m.name AS medicine_name, m.gst_percent FROM batches b JOIN medicines m ON m.id = b.medicine_id WHERE b.medicine_id = $1 AND b.quantity > 0 AND b.expiry_date >= CURRENT_DATE ORDER BY b.expiry_date ASC, b.id ASC FOR UPDATE`, [item.medicineId]);
      for (const batch of batches.rows) {
        if (remaining <= 0) break;
        const quantity = Math.min(remaining, batch.quantity);
        const beforeDiscount = money(quantity * asNumber(batch.selling_price));
        const itemDiscount = money(beforeDiscount * item.discountPercent / 100);
        const taxable = beforeDiscount - itemDiscount;
        const gst = money(taxable * asNumber(batch.gst_percent) / 100);
        allocations.push({ ...item, batchId: batch.id, batchNumber: batch.batch_number, medicineName: batch.medicine_name, quantity, unitPrice: asNumber(batch.selling_price), gst, lineTotal: money(taxable + gst) });
        subtotal += beforeDiscount;
        gstTotal += gst;
        remaining -= quantity;
      }
      if (remaining > 0) throw new HttpError(409, `Insufficient non-expired stock for medicine ${item.medicineId}`);
    }
    const discountAmount = money(body.discountAmount);
    const total = money(subtotal - discountAmount + gstTotal);
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const sale = (await client.query(`INSERT INTO sales (invoice_number, customer_id, cashier_id, subtotal, discount_amount, gst_total, total, payment_method) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [invoiceNumber, body.customerId ?? null, req.user!.id, subtotal, discountAmount, gstTotal, total, body.paymentMethod])).rows[0];
    for (const item of allocations) {
      await client.query(`UPDATE batches SET quantity = quantity - $1 WHERE id = $2 AND quantity >= $1`, [item.quantity, item.batchId]);
      await client.query(`INSERT INTO sale_items (sale_id, medicine_id, batch_id, batch_number, quantity, unit_price, discount_percent, gst_amount, line_total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [sale.id, item.medicineId, item.batchId, item.batchNumber, item.quantity, item.unitPrice, item.discountPercent, item.gst, item.lineTotal]);
    }
    await client.query(`INSERT INTO payments (sale_id, method, amount) VALUES ($1,$2,$3)`, [sale.id, body.paymentMethod, total]);
    await client.query(`INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata) VALUES ($1,'CREATE','Sale',$2,$3::jsonb)`, [req.user!.id, sale.id, JSON.stringify({ invoiceNumber, total })]);
    await client.query("COMMIT");
    return res.status(201).json(await salePayload(sale.id));
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to complete sale" });
  } finally {
    client.release();
  }
});

router.get("/sales", requireAuth, async (req, res) => {
  const query = ListSalesQueryParams.parse(queryParams(req));
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const result = await pool.query(`SELECT s.id FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE ($1 = '' OR s.invoice_number ILIKE '%' || $1 || '%' OR c.name ILIKE '%' || $1 || '%') AND ($2::date IS NULL OR s.sale_date::date >= $2::date) AND ($3::date IS NULL OR s.sale_date::date <= $3::date) ORDER BY s.sale_date DESC LIMIT $4 OFFSET $5`, [query.search ?? "", query.from ?? null, query.to ?? null, pageSize, (page - 1) * pageSize]);
  const count = await pool.query(`SELECT COUNT(*)::int AS total FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE ($1 = '' OR s.invoice_number ILIKE '%' || $1 || '%' OR c.name ILIKE '%' || $1 || '%') AND ($2::date IS NULL OR s.sale_date::date >= $2::date) AND ($3::date IS NULL OR s.sale_date::date <= $3::date)`, [query.search ?? "", query.from ?? null, query.to ?? null]);
  return res.json({ items: (await Promise.all(result.rows.map((row) => salePayload(row.id)))).filter(Boolean), page, pageSize, total: count.rows[0]?.total ?? 0 });
});

router.get("/sales/:id", requireAuth, async (req, res) => {
  const params = GetSaleParams.parse(req.params);
  const sale = await salePayload(params.id);
  if (!sale) return res.status(404).json({ error: "Sale not found" });
  return res.json(sale);
});

router.get("/sales/:id/invoice", requireAuth, async (req, res) => {
  const params = GetSaleInvoiceParams.parse(req.params);
  const sale = await salePayload(params.id);
  if (!sale) return res.status(404).json({ error: "Sale not found" });
  const settings = (await pool.query(`SELECT * FROM pharmacy_settings ORDER BY id LIMIT 1`)).rows[0];
  return res.json({ pharmacyName: settings?.pharmacy_name ?? "CarePoint Pharmacy", pharmacyAddress: settings?.address ?? "", pharmacyPhone: settings?.phone ?? "", sale });
});

router.get("/reports/summary", requireAuth, async (req, res) => {
  const query = GetReportSummaryQueryParams.parse(queryParams(req));
  const result = await pool.query(
    `SELECT
      COALESCE((SELECT SUM(total) FROM sales WHERE ($1::date IS NULL OR sale_date::date >= $1::date) AND ($2::date IS NULL OR sale_date::date <= $2::date)), 0)::numeric AS sales_revenue,
      COALESCE((SELECT SUM(total) FROM purchases WHERE ($1::date IS NULL OR purchase_date >= $1::date) AND ($2::date IS NULL OR purchase_date <= $2::date)), 0)::numeric AS purchase_cost,
      (SELECT COUNT(*) FROM sales WHERE ($1::date IS NULL OR sale_date::date >= $1::date) AND ($2::date IS NULL OR sale_date::date <= $2::date))::int AS sales_count,
      (SELECT COUNT(*) FROM purchases WHERE ($1::date IS NULL OR purchase_date >= $1::date) AND ($2::date IS NULL OR purchase_date <= $2::date))::int AS purchase_count,
      (SELECT COALESCE(SUM(quantity * purchase_price), 0) FROM batches WHERE quantity > 0)::numeric AS inventory_value,
      (SELECT COALESCE(SUM(quantity * purchase_price), 0) FROM batches WHERE quantity > 0 AND expiry_date < CURRENT_DATE)::numeric AS expired_value,
      (SELECT COALESCE(SUM(quantity * purchase_price), 0) FROM batches WHERE quantity > 0 AND expiry_date >= CURRENT_DATE AND expiry_date <= CURRENT_DATE + INTERVAL '90 days')::numeric AS expiring_value`,
    [query.from ?? null, query.to ?? null],
  );
  const row = result.rows[0];
  const salesRevenue = money(row.sales_revenue);
  const purchaseCost = money(row.purchase_cost);
  return res.json({ salesRevenue, purchaseCost, profit: money(salesRevenue - purchaseCost), salesCount: asInt(row.sales_count), purchaseCount: asInt(row.purchase_count), inventoryValue: money(row.inventory_value), expiredValue: money(row.expired_value), expiringValue: money(row.expiring_value) });
});

router.get("/reports/export", requireAuth, async (req, res) => {
  const type = typeof req.query.type === "string" ? req.query.type : "sales";
  const query = { from: typeof req.query.from === "string" ? req.query.from : null, to: typeof req.query.to === "string" ? req.query.to : null };
  if (!["sales", "purchases", "inventory", "expiry", "profit"].includes(type)) return res.status(400).json({ error: "Invalid report type" });
  let rows: any[] = [];
  if (type === "sales" || type === "profit") rows = (await pool.query(`SELECT invoice_number, sale_date, total, payment_method FROM sales WHERE ($1::date IS NULL OR sale_date::date >= $1::date) AND ($2::date IS NULL OR sale_date::date <= $2::date) ORDER BY sale_date DESC`, [query.from, query.to])).rows;
  if (type === "purchases") rows = (await pool.query(`SELECT invoice_number, purchase_date, total FROM purchases WHERE ($1::date IS NULL OR purchase_date >= $1::date) AND ($2::date IS NULL OR purchase_date <= $2::date) ORDER BY purchase_date DESC`, [query.from, query.to])).rows;
  if (type === "inventory" || type === "expiry") rows = (await pool.query(`SELECT m.name, b.batch_number, b.expiry_date, b.quantity, b.purchase_price FROM batches b JOIN medicines m ON m.id = b.medicine_id ${type === "expiry" ? "WHERE b.expiry_date <= CURRENT_DATE + INTERVAL '90 days'" : ""} ORDER BY b.expiry_date`)).rows;
  const headers = rows.length ? Object.keys(rows[0]) : ["message"];
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => JSON.stringify(row[header] ?? "")).join(","))].join("\n");
  return res.type("text/csv").send(csv);
});

router.use((error: unknown, _req: Request, res: Response, _next: unknown) => {
  logger.error({ error }, "Unhandled API error");
  return res.status(500).json({ error: "Unexpected server error" });
});

export default router;