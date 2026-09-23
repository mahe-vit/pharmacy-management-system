import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["ADMIN", "PHARMACIST", "STAFF"]);
export const paymentMethodEnum = pgEnum("payment_method", ["CASH", "UPI", "CARD"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("STAFF"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessionsTable = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categoriesTable = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  contactPerson: text("contact_person").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  address: text("address").notNull(),
  gstNumber: text("gst_number").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const medicinesTable = pgTable(
  "medicines",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    genericName: text("generic_name").notNull().default(""),
    brand: text("brand").notNull().default(""),
    manufacturer: text("manufacturer").notNull().default(""),
    categoryId: integer("category_id").notNull().references(() => categoriesTable.id),
    dosageForm: text("dosage_form").notNull(),
    strength: text("strength").notNull().default(""),
    barcode: text("barcode").notNull().default(""),
    gstPercent: numeric("gst_percent", { precision: 6, scale: 2, mode: "number" }).notNull().default(0),
    prescriptionRequired: boolean("prescription_required").notNull().default(false),
    reorderLevel: integer("reorder_level").notNull().default(10),
    description: text("description").notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    barcodeIdx: uniqueIndex("medicines_barcode_idx").on(table.barcode),
  }),
);

export const batchesTable = pgTable("batches", {
  id: serial("id").primaryKey(),
  medicineId: integer("medicine_id").notNull().references(() => medicinesTable.id),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id),
  batchNumber: text("batch_number").notNull(),
  manufacturingDate: date("manufacturing_date", { mode: "string" }).notNull(),
  expiryDate: date("expiry_date", { mode: "string" }).notNull(),
  purchasePrice: numeric("purchase_price", { precision: 12, scale: 2, mode: "number" }).notNull(),
  sellingPrice: numeric("selling_price", { precision: 12, scale: 2, mode: "number" }).notNull(),
  mrp: numeric("mrp", { precision: 12, scale: 2, mode: "number" }).notNull(),
  quantity: integer("quantity").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customersTable = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  address: text("address").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const purchasesTable = pgTable("purchases", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id),
  invoiceNumber: text("invoice_number").notNull(),
  purchaseDate: date("purchase_date", { mode: "string" }).notNull(),
  subtotal: numeric("subtotal", { precision: 12, scale: 2, mode: "number" }).notNull(),
  gstTotal: numeric("gst_total", { precision: 12, scale: 2, mode: "number" }).notNull(),
  total: numeric("total", { precision: 12, scale: 2, mode: "number" }).notNull(),
  notes: text("notes").notNull().default(""),
  createdBy: integer("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseItemsTable = pgTable("purchase_items", {
  id: serial("id").primaryKey(),
  purchaseId: integer("purchase_id").notNull().references(() => purchasesTable.id, { onDelete: "cascade" }),
  medicineId: integer("medicine_id").notNull().references(() => medicinesTable.id),
  batchId: integer("batch_id").notNull().references(() => batchesTable.id),
  batchNumber: text("batch_number").notNull(),
  manufacturingDate: date("manufacturing_date", { mode: "string" }).notNull(),
  expiryDate: date("expiry_date", { mode: "string" }).notNull(),
  quantity: integer("quantity").notNull(),
  purchasePrice: numeric("purchase_price", { precision: 12, scale: 2, mode: "number" }).notNull(),
  sellingPrice: numeric("selling_price", { precision: 12, scale: 2, mode: "number" }).notNull(),
  mrp: numeric("mrp", { precision: 12, scale: 2, mode: "number" }).notNull(),
  gstPercent: numeric("gst_percent", { precision: 6, scale: 2, mode: "number" }).notNull(),
  lineTotal: numeric("line_total", { precision: 12, scale: 2, mode: "number" }).notNull(),
});

export const salesTable = pgTable("sales", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  customerId: integer("customer_id").references(() => customersTable.id),
  cashierId: integer("cashier_id").notNull().references(() => usersTable.id),
  subtotal: numeric("subtotal", { precision: 12, scale: 2, mode: "number" }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2, mode: "number" }).notNull(),
  gstTotal: numeric("gst_total", { precision: 12, scale: 2, mode: "number" }).notNull(),
  total: numeric("total", { precision: 12, scale: 2, mode: "number" }).notNull(),
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  saleDate: timestamp("sale_date", { withTimezone: true }).notNull().defaultNow(),
});

export const saleItemsTable = pgTable("sale_items", {
  id: serial("id").primaryKey(),
  saleId: integer("sale_id").notNull().references(() => salesTable.id, { onDelete: "cascade" }),
  medicineId: integer("medicine_id").notNull().references(() => medicinesTable.id),
  batchId: integer("batch_id").notNull().references(() => batchesTable.id),
  batchNumber: text("batch_number").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2, mode: "number" }).notNull(),
  discountPercent: numeric("discount_percent", { precision: 6, scale: 2, mode: "number" }).notNull(),
  gstAmount: numeric("gst_amount", { precision: 12, scale: 2, mode: "number" }).notNull(),
  lineTotal: numeric("line_total", { precision: 12, scale: 2, mode: "number" }).notNull(),
});

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  saleId: integer("sale_id").notNull().references(() => salesTable.id, { onDelete: "cascade" }),
  method: paymentMethodEnum("method").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2, mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pharmacySettingsTable = pgTable("pharmacy_settings", {
  id: serial("id").primaryKey(),
  pharmacyName: text("pharmacy_name").notNull(),
  address: text("address").notNull(),
  phone: text("phone").notNull(),
  gstNumber: text("gst_number").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMedicineSchema = createInsertSchema(medicinesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCustomerSchema = createInsertSchema(customersTable).omit({ id: true, createdAt: true });
export const insertSupplierSchema = createInsertSchema(suppliersTable).omit({ id: true, createdAt: true });
export type InsertMedicine = z.infer<typeof insertMedicineSchema>;
export type Medicine = typeof medicinesTable.$inferSelect;
export type User = typeof usersTable.$inferSelect;
export type Category = typeof categoriesTable.$inferSelect;
export type Supplier = typeof suppliersTable.$inferSelect;
export type Batch = typeof batchesTable.$inferSelect;
export type Customer = typeof customersTable.$inferSelect;
export type Purchase = typeof purchasesTable.$inferSelect;
export type PurchaseItem = typeof purchaseItemsTable.$inferSelect;
export type Sale = typeof salesTable.$inferSelect;
export type SaleItem = typeof saleItemsTable.$inferSelect;
export type AuditLog = typeof auditLogsTable.$inferSelect;
export type PharmacySettings = typeof pharmacySettingsTable.$inferSelect;