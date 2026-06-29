const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const { getPrismaClient } = require('../utils/database');

// ─── Brand palette (matches landing page index.css) ─────────────────────────
const BRAND_INDIGO = '#1700AD';
const BRAND_CRIMSON = '#CC0014';
const BRAND_WARM = '#EEEBE3';
const TEXT_DARK = '#18181B';
const TEXT_MUTED = '#71717A';
const LINE_COLOR = '#E4E4E7';
const SUCCESS_GREEN = '#16A34A';
const SUCCESS_BG = '#F0FDF4';

// Logo absolute path (frontend public assets)
const LOGO_PATH = path.resolve(
  __dirname,
  '../../../sweep-pro-frontend/public/assets/logo-black.png'
);

// ─── Invoice Number Generator ────────────────────────────────────────────────
function generateInvoiceNumber() {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `INV-${ym}-${rand}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function drawHRule(doc, y, color = LINE_COLOR, lx = 50, rx = 545) {
  doc.save()
    .strokeColor(color)
    .lineWidth(0.5)
    .moveTo(lx, y)
    .lineTo(rx, y)
    .stroke()
    .restore();
}

function rightText(doc, text, y, rightEdge = 545) {
  const w = doc.widthOfString(text);
  doc.text(text, rightEdge - w, y, { lineBreak: false });
}

// ─── Gradient band using thin horizontal rects ───────────────────────────────
function drawGradientBand(doc, x, y, w, h, hexFrom, hexTo) {
  const steps = 60;
  const fw = w / steps;
  const fr = parseInt(hexFrom.slice(1, 3), 16);
  const fg = parseInt(hexFrom.slice(3, 5), 16);
  const fb = parseInt(hexFrom.slice(5, 7), 16);
  const tr = parseInt(hexTo.slice(1, 3), 16);
  const tg = parseInt(hexTo.slice(3, 5), 16);
  const tb = parseInt(hexTo.slice(5, 7), 16);

  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const r = Math.round(fr + (tr - fr) * t);
    const g = Math.round(fg + (tg - fg) * t);
    const b = Math.round(fb + (tb - fb) * t);
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    doc.rect(x + i * fw, y, fw + 1, h).fill(hex);
  }
}

// ─── Build line items ─────────────────────────────────────────────────────────
function buildLineItems(payment) {
  if (payment.booking?.service) {
    return [{
      description: payment.booking.service.name,
      detail: payment.booking.service.description
        ? payment.booking.service.description.slice(0, 80)
        : (payment.booking.service.category ? `Category: ${payment.booking.service.category}` : ''),
      qty: 1,
      unitPrice: payment.amount,
      subtotal: payment.amount
    }];
  }

  if (payment.subscription?.plan) {
    return [{
      description: `${payment.subscription.plan.name} — Subscription Plan`,
      detail: `Billing cycle: ${(payment.subscription.billingCycle || 'MONTHLY').toLowerCase()}`,
      qty: 1,
      unitPrice: payment.amount,
      subtotal: payment.amount
    }];
  }

  return [{
    description: payment.paymentType === 'SUBSCRIPTION'
      ? 'Subscription Payment'
      : 'Professional Cleaning Service',
    detail: '',
    qty: 1,
    unitPrice: payment.amount,
    subtotal: payment.amount
  }];
}

// ─── Main: generate PDF buffer ───────────────────────────────────────────────
async function generateInvoicePDF(paymentId) {
  const db = getPrismaClient();

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: {
      customer: {
        select: {
          id: true, name: true, email: true,
          phone: true, address: true, city: true, state: true
        }
      },
      booking: {
        include: {
          service: { select: { name: true, description: true, category: true } }
        }
      },
      subscription: {
        include: {
          plan: { select: { name: true, description: true, sessionsPerMonth: true } }
        }
      }
    }
  });

  if (!payment) throw new Error('Payment not found');

  // Ensure / generate invoice number
  let invoiceNumber = payment.invoiceNumber;
  if (!invoiceNumber) {
    invoiceNumber = generateInvoiceNumber();
    try {
      await db.payment.update({ where: { id: paymentId }, data: { invoiceNumber } });
    } catch (_) { /* column may not be migrated yet – in-memory fallback */ }
  }

  const lineItems = buildLineItems(payment);
  const subtotal = payment.amount;
  const discount = payment.discount || 0;
  const tax = payment.tax || 0;
  const total = payment.finalAmount || subtotal - discount + tax;
  const paidDate = new Date(payment.updatedAt || payment.createdAt);
  const dateStr = paidDate.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  // Check logo availability
  const hasLogo = fs.existsSync(LOGO_PATH);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 30, left: 50, right: 50 }, bufferPages: true });
    const chunks = [];

    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;   // 595
    const pH = doc.page.height;  // 842

    // ── Header Section (Gradient background) ─────────────────────────────────
    const HEADER_H = 115;

    // Top full gradient band (Indigo -> Crimson)
    drawGradientBand(doc, 0, 0, W, HEADER_H, BRAND_INDIGO, BRAND_CRIMSON);

    // Warm accent line below the header
    doc.rect(0, HEADER_H, W, 3).fill(BRAND_WARM);

    // ── Logo & Brand Text ─────────────────────────────────────────────────────
    const HEADER_Y = 32;
    if (hasLogo) {
      const LOGO_W = 140;
      const LOGO_H = 44;
      // logo-black.png is actually white text/icon, so it looks perfect directly on the gradient!
      doc.image(LOGO_PATH, 50, HEADER_Y, { width: LOGO_W, height: LOGO_H });
    } else {
      // Fallback text brand
      doc.fillColor('#FFFFFF')
        .fontSize(28)
        .font('Helvetica-Bold')
        .text('Sweepro', 50, HEADER_Y, { lineBreak: false });

      doc.fillColor('rgba(255,255,255,0.8)')
        .fontSize(10)
        .font('Helvetica')
        .text('Professional Cleaning Services', 50, HEADER_Y + 34, { lineBreak: false });
    }

    // ── "INVOICE" label + number on right ────────────────────────────────────
    doc.fillColor('#FFFFFF')
      .fontSize(28)
      .font('Helvetica-Bold');
    rightText(doc, 'INVOICE', HEADER_Y);

    doc.fillColor('rgba(255,255,255,0.85)')
      .fontSize(11)
      .font('Helvetica-Bold');
    rightText(doc, invoiceNumber, HEADER_Y + 34);

    // ── Status pill ───────────────────────────────────────────────────────────
    const statusLabel = payment.status === 'COMPLETED' ? 'PAID'
      : payment.status === 'REFUNDED' ? 'REFUNDED'
        : payment.status === 'FAILED' ? 'FAILED'
          : payment.status;

    const pillColor = payment.status === 'COMPLETED' ? SUCCESS_BG
      : payment.status === 'REFUNDED' ? '#EFF6FF'
        : '#FEF2F2';

    const pillTextColor = payment.status === 'COMPLETED' ? SUCCESS_GREEN
      : payment.status === 'REFUNDED' ? '#3B82F6'
        : '#EF4444';

    const pillW = 60;
    const pillX = W - 50 - pillW;
    // Position pill right beneath the header line on the right side
    const PILL_Y = HEADER_H + 18;
    doc.roundedRect(pillX, PILL_Y, pillW, 20, 10).fill(pillColor);
    doc.fillColor(pillTextColor).fontSize(8.5).font('Helvetica-Bold')
      .text(statusLabel, pillX, PILL_Y + 5, { width: pillW, align: 'center', lineBreak: false });

    // ── Billed To ─────────────────────────────────────────────────────────────
    // Move slightly down since header takes 115
    const CONTENT_Y = HEADER_H + 20;

    doc.fillColor(TEXT_MUTED).font('Helvetica-Bold').fontSize(8)
      .text('BILLED TO', 50, CONTENT_Y, { lineBreak: false });

    doc.fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(13)
      .text(payment.customer?.name || 'Customer', 50, CONTENT_Y + 14);

    doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(9.5);
    let addrY = CONTENT_Y + 32;
    if (payment.customer?.email) { doc.text(payment.customer.email, 50, addrY); addrY += 14; }
    if (payment.customer?.phone) { doc.text(payment.customer.phone, 50, addrY); addrY += 14; }
    if (payment.customer?.address) {
      doc.text(
        [payment.customer.address, payment.customer.city, payment.customer.state].filter(Boolean).join(', '),
        50, addrY, { width: 230 }
      );
    }

    // ── Invoice meta (right column) ───────────────────────────────────────────
    const META_X = 355;
    const LABEL_W = 95;
    // Start below the status pill
    let metaY = PILL_Y + 35;

    const metaRow = (label, value) => {
      doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(8.5)
        .text(label, META_X, metaY, { lineBreak: false });
      doc.fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(8.5)
        .text(value, META_X + LABEL_W, metaY, { lineBreak: false });
      metaY += 16;
    };

    metaRow('Invoice Date:', dateStr);
    metaRow('Payment Method:', (payment.paymentMethod || 'ONLINE').replace(/_/g, ' '));
    if (payment.transactionId) metaRow('Transaction ID:', `#${payment.transactionId.slice(-10)}`);
    if (payment.gateway) metaRow('Gateway:', payment.gateway.charAt(0).toUpperCase() + payment.gateway.slice(1));

    // ── Table header row ──────────────────────────────────────────────────────
    const tableY = Math.max(addrY + 20, metaY + 20);

    // Light gray background for table header
    doc.rect(50, tableY, W - 100, 24).fill('#F4F4F5');

    doc.fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(8.5);
    doc.text('DESCRIPTION', 60, tableY + 8, { lineBreak: false });
    doc.text('QTY', 352, tableY + 8, { lineBreak: false });
    doc.text('UNIT PRICE', 392, tableY + 8, { lineBreak: false });
    doc.text('AMOUNT', 490, tableY + 8, { lineBreak: false });

    // Bottom border for table header
    drawHRule(doc, tableY + 24, '#D4D4D8');

    // ── Line items ────────────────────────────────────────────────────────────
    let rowY = tableY + 36;
    for (const item of lineItems) {
      doc.fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(9.5)
        .text(item.description, 60, rowY, { width: 285 });
      if (item.detail) {
        doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(8)
          .text(item.detail, 60, rowY + 14, { width: 285 });
        rowY += 12;
      }
      doc.fillColor(TEXT_DARK).font('Helvetica').fontSize(9.5);
      doc.text(String(item.qty), 352, rowY, { lineBreak: false });
      doc.text(`₹${item.unitPrice.toFixed(2)}`, 392, rowY, { lineBreak: false });
      doc.text(`₹${item.subtotal.toFixed(2)}`, 490, rowY, { lineBreak: false });
      rowY += 32;
      drawHRule(doc, rowY - 8, LINE_COLOR);
    }

    // ── Totals block ──────────────────────────────────────────────────────────
    rowY += 8;
    const TOTALS_X = 380;

    const totalsRow = (label, value, isBold = false, color = null) => {
      doc.fillColor(color || (isBold ? TEXT_DARK : TEXT_MUTED))
        .font(isBold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(isBold ? 11 : 9);
      doc.text(label, TOTALS_X, rowY, { lineBreak: false });
      rightText(doc, value, rowY);
      rowY += isBold ? 24 : 18;
    };

    totalsRow('Subtotal:', `₹${subtotal.toFixed(2)}`);
    if (discount > 0) totalsRow('Discount:', `-₹${discount.toFixed(2)}`, false, BRAND_CRIMSON);
    if (tax > 0) totalsRow('GST / Tax (18%):', `₹${tax.toFixed(2)}`);

    // Total row separator
    drawHRule(doc, rowY, '#D4D4D8', TOTALS_X, 545);
    rowY += 8;

    // Draw total with emphasis
    doc.fillColor(BRAND_INDIGO).font('Helvetica-Bold').fontSize(12);
    doc.text('Total Amount:', TOTALS_X, rowY, { lineBreak: false });
    rightText(doc, `₹${total.toFixed(2)}`, rowY);
    rowY += 28;

    // ── Payment received banner ───────────────────────────────────────────────
    if (payment.status === 'COMPLETED') {
      rowY += 12;
      // Soft green banner
      doc.roundedRect(50, rowY, W - 100, 42, 6).fill(SUCCESS_BG);
      doc.rect(50, rowY, 4, 42).fill(SUCCESS_GREEN);

      doc.fillColor(SUCCESS_GREEN).font('Helvetica-Bold').fontSize(10)
        .text('✓ Payment Received in Full', 64, rowY + 10, { lineBreak: false });
      doc.fillColor('#166534').font('Helvetica').fontSize(8.5)
        .text(
          `Processed on ${dateStr} via ${(payment.gateway || 'ONLINE').toUpperCase()}`,
          64, rowY + 24
        );
      rowY += 58;
    }

    // ── Legal note & Footer ───────────────────────────────────────────────────
    // Push closer to bottom margin
    const FOOTER_Y = pH - 75;

    drawGradientBand(doc, 50, FOOTER_Y, W - 100, 1.5, BRAND_INDIGO, BRAND_CRIMSON);

    doc.fillColor(TEXT_MUTED).font('Helvetica-Oblique').fontSize(7.5)
      .text(
        'This is a system-generated invoice and does not require a physical signature.',
        50, FOOTER_Y + 12, { width: W - 100, align: 'center' }
      );

    doc.fillColor(TEXT_DARK).font('Helvetica').fontSize(8)
      .text(
        'Sweepro • Professional Cleaning Services • support@sweepro.in • +91 98765 43210',
        50, FOOTER_Y + 26,
        { width: W - 100, align: 'center', lineBreak: false }
      );

    doc.end();
  });
}

module.exports = { generateInvoicePDF, generateInvoiceNumber };
