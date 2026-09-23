import { pool } from "@workspace/db";
import { hashPassword } from "./middleware/auth";
import { logger } from "./lib/logger";

const dateOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * Creates only the minimum data required to log in and demonstrate the app.
 * Operational figures such as sales, revenue and transactions are NOT seeded.
 * They are calculated from PostgreSQL and change when the user records real
 * purchases/sales through the application.
 */
export async function ensureSeeded() {
  const existing = await pool.query(`SELECT COUNT(*)::int AS count FROM users`);
  if ((existing.rows[0]?.count ?? 0) > 0) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const categories = ["Analgesic", "Antibiotic", "Allergy"];
    const categoryIds = new Map<string, number>();
    for (const name of categories) {
      const row = (await client.query(
        `INSERT INTO categories (name) VALUES ($1) RETURNING id`,
        [name],
      )).rows[0];
      categoryIds.set(name, row.id);
    }

    // Demo accounts are authentication fixtures only. Business metrics remain empty.
    const users = [
      ["Admin User", "admin@carepoint.test", "ADMIN", "admin123"],
      ["Maya Pharmacist", "pharmacist@carepoint.test", "PHARMACIST", "pharma123"],
      ["Ravi Staff", "staff@carepoint.test", "STAFF", "staff123"],
    ];
    const userIds = new Map<string, number>();
    for (const [name, email, role, password] of users) {
      const row = (await client.query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id`,
        [name, email, hashPassword(password), role],
      )).rows[0];
      userIds.set(email, row.id);
    }

    const suppliers = [
      ["Medline Distributors", "Aarav Shah", "+91 98765 10001", "sales@medline.test", "12 Medical Market, Mumbai", "27AABCM1234L1ZP"],
      ["Nova Healthcare Supply", "Ishita Rao", "+91 98765 10002", "orders@novahealth.test", "44 Wellness Road, Pune", "27AABCN5678Q1ZR"],
    ];
    const supplierIds: number[] = [];
    for (const supplier of suppliers) {
      const row = (await client.query(
        `INSERT INTO suppliers (company_name, contact_person, phone, email, address, gst_number) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        supplier,
      )).rows[0];
      supplierIds.push(row.id);
    }

    const medicines = [
      ["Paracetamol 500mg", "Paracetamol", "Medico", "Acme Labs", "Tablet", "500 mg", "Analgesic", "890100000001", 12, 10, 50],
      ["Azithromycin 500mg", "Azithromycin", "AziCare", "Nova Pharma", "Tablet", "500 mg", "Antibiotic", "890100000002", 5, 10, 30],
      ["Cetirizine 10mg", "Cetirizine", "Cetzine", "Wellness Labs", "Tablet", "10 mg", "Allergy", "890100000003", 5, 10, 40],
    ];

    for (let index = 0; index < medicines.length; index += 1) {
      const [name, genericName, brand, manufacturer, dosageForm, strength, category, barcode, gst, reorderLevel, quantity] = medicines[index];
      const medicine = (await client.query(
        `INSERT INTO medicines (name, generic_name, brand, manufacturer, category_id, dosage_form, strength, barcode, gst_percent, prescription_required, reorder_level, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [name, genericName, brand, manufacturer, categoryIds.get(category as string), dosageForm, strength, barcode, gst, false, reorderLevel, `${name} - initial inventory item`],
      )).rows[0];

      await client.query(
        `INSERT INTO batches (medicine_id, supplier_id, batch_number, manufacturing_date, expiry_date, purchase_price, selling_price, mrp, quantity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [medicine.id, supplierIds[index % supplierIds.length], `INIT-${String(index + 1).padStart(3, "0")}`, dateOffset(-30), dateOffset(365), 20 + index * 5, 25 + index * 5, 30 + index * 5, quantity],
      );
    }

    await client.query(`INSERT INTO customers (name, phone, email, address) VALUES ('Walk-in Customer', '0000000000', NULL, 'Local')`);
    await client.query(`INSERT INTO pharmacy_settings (pharmacy_name, address, phone, gst_number) VALUES ('CarePoint Pharmacy', '18 Residency Road, Bengaluru', '+91 80 4000 2200', '29AABCCP7788H1ZQ')`);

    await client.query("COMMIT");
    logger.info("Initialized pharmacy master data; sales and revenue start at zero");
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error({ error }, "Unable to initialize pharmacy data");
    throw error;
  } finally {
    client.release();
  }
}
