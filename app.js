import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  inMemoryPersistence,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================================================
// 1. FIREBASE CONFIGURATION & INITIALIZATION
// ==========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyCk1M2mLQDyT2DoJuGOogjZYKOcGnendsU",
  authDomain: "pos-by-basit.firebaseapp.com",
  projectId: "pos-by-basit",
  storageBucket: "pos-by-basit.firebasestorage.app",
  messagingSenderId: "565421098587",
  appId: "1:565421098587:web:0bc1d69f52f3bab647217e",
  measurementId: "G-QH75X9ZVCL",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

setPersistence(auth, inMemoryPersistence).catch((error) => {
  showToast("Unable to set sign-in session: " + error.message, "error");
});

signOut(auth).catch(() => {});

// ==========================================================================
// 2. GLOBAL STATE MANAGEMENT
// ==========================================================================
let currentUser = null;
let currentBusiness = null;
let businessId = null;

let state = {
  products: [],
  categories: [
    "Grocery",
    "Beverages",
    "Dairy",
    "Bakery",
    "Snacks",
    "Household",
  ],
  customers: [],
  suppliers: [],
  sales: [],
  purchases: [],
  expenses: [],
  cart: [],
  selectedCategory: "ALL",
  posSearchQuery: "",
};

let salesChartInstance = null;
let topProductsChartInstance = null;

// ==========================================================================
// 3. UTILITY FUNCTIONS & MODAL HANDLERS
// ==========================================================================
const formatCurrency = (amount) => {
  return (
    "Rs. " +
    Number(amount || 0).toLocaleString("en-PK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
};

const showToast = (message, type = "info") => {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
};

const toggleLoader = (show, text = "Processing...") => {
  const loader = document.getElementById("global-loader");
  const loaderText = document.getElementById("loader-text");
  if (loaderText) loaderText.innerText = text;
  if (loader) {
    if (show) loader.classList.remove("hidden");
    else loader.classList.add("hidden");
  }
};

window.closeModal = () => {
  const modalContainer = document.getElementById("modal-container");
  if (modalContainer) modalContainer.classList.add("hidden");
};

const normalizeToStandardUnit = (qty, unit) => {
  const parsedQty = parseFloat(qty) || 0;
  if (unit === "Gram") return parsedQty / 1000;
  return parsedQty;
};

const populatePrintWindowContent = (
  printWindow,
  saleData,
  format = "thermal",
  autoPrint = true,
) => {
  if (!printWindow) return;

  const subtotalForCalc = saleData.subtotal || 0;

  const itemsHtmlSimple = saleData.items
    .map((item, idx) => {
      return `
      <tr>
        <td style="padding:6px 8px;">${idx + 1}</td>
        <td style="padding:6px 8px;">${item.name}</td>
        <td style="padding:6px 8px; text-align:right;">${formatCurrency(item.sellingPrice)}</td>
        <td style="padding:6px 8px; text-align:center;">${item.qty}</td>
        <td style="padding:6px 8px; text-align:center;">${subtotalForCalc ? (((item.lineTotal || 0) / subtotalForCalc) * (saleData.taxAmount || 0)).toFixed(2) : "0.00"}</td>
        <td style="padding:6px 8px; text-align:right;">${formatCurrency(item.lineTotal)}</td>
      </tr>
    `;
    })
    .join("");

  // Use the same styled template for A5 and A4, but adjust page size and max-width
  if (format === "A5" || format === "A4") {
    const pageSize = format === "A4" ? "A4" : "A5";
    const pageCss = `@page { size: ${pageSize} portrait; margin: 10mm; }`;

    const containerMaxWidth = format === "A4" ? "180mm" : "148mm";
    const titleSize = format === "A4" ? "36px" : "32px";
    const shopFontSize = format === "A4" ? "22px" : "20px";

    const html = `
      <html>
        <head>
          <title>Invoice - ${saleData.invoiceNumber}</title>
          <meta charset="utf-8">
          <style>
            ${pageCss}
            body { font-family: 'Georgia', 'Times New Roman', serif; color:#222; margin:0; padding:18px; display:flex; justify-content:center; }
            .invoice-wrap { width:100%; max-width:${containerMaxWidth}; border: 1px solid #e6d9c6; padding:22px; background: linear-gradient(180deg,#fff 0%, #fcfbf8 100%); box-sizing:border-box; }
            .inv-header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
            .logo { text-align:center; flex:1; }
            .logo h1 { margin:0; font-size:${shopFontSize}; letter-spacing:2px; color:#b8842a; }
            .inv-title { flex:1; }
            .inv-title h2 { margin:0; font-size:${titleSize}; font-weight:800; letter-spacing:2px; color:#333; }
            .inv-meta { text-align:right; flex:1; font-size:13px; color:#444; }

            .boxes { display:flex; gap:12px; margin-top:14px; }
            .box { flex:1; padding:12px; border:1px dashed #d2c3a8; background: rgba(0,0,0,0.01); }
            .box h4{ margin:0 0 8px 0; font-size:13px; color:#b8842a; }
            .box p{ margin:0; font-size:13px; }

            table.inv-items { width:100%; border-collapse:collapse; margin-top:16px; }
            table.inv-items thead th { border-bottom:2px solid #d2c3a8; padding:10px; text-align:left; font-size:13px; }
            table.inv-items tbody td { border-bottom:1px solid #eee; padding:8px 10px; font-size:13px; }

            .totals { width:100%; display:flex; justify-content:flex-end; margin-top:16px; }
            .totals .right { width:360px; }
            .totals .right .row { display:flex; justify-content:space-between; padding:8px 10px; font-size:14px; }
            .totals .right .grand { font-weight:800; font-size:18px; border-top:2px solid #d2c3a8; padding-top:12px; }

            .payment { display:flex; align-items:center; gap:16px; margin-top:20px; }
            .signature { flex:1; }
            .signature .sig-line { border-top:1px dashed #bdb2a0; width:260px; margin-top:28px; }
            .payment .methods { font-size:13px; color:#444; }

            .inv-footer { text-align:center; margin-top:22px; font-size:12px; color:#6b6b6b; border-top:1px solid #efe7da; padding-top:10px; }

            .inv-number { font-weight:700; color:#222; }
          </style>
        </head>
        <body>
          <div class="invoice-wrap">
            <div class="inv-header">
              <div class="inv-title">
                <h2>INVOICE</h2>
              </div>
              <div class="logo">
                <h1>${currentBusiness?.shopName || "PAKPOS"}</h1>
                <div style="font-size:12px; color:#7a5f3a;">${currentBusiness?.ownerName || ""}</div>
              </div>
              <div class="inv-meta">
                <div>Invoice Number: <span class="inv-number">${saleData.invoiceNumber}</span></div>
                <div>Date: <strong>${new Date().toLocaleDateString()}</strong></div>
              </div>
            </div>

            <div class="boxes">
              <div class="box">
                <h4>BILL TO</h4>
                <p><strong>${saleData.customerName}</strong></p>
                <p>Phone: ${saleData.customerPhone ? saleData.customerPhone : "N/A"}</p>
              </div>
              <div class="box">
                <h4>DATA FOR THE TRANSFER</h4>
                <p>${currentBusiness?.shopName || ""}</p>
                <p>Phone: ${currentBusiness?.phone || ""}</p>
                <p>Usage: Sale ${saleData.invoiceNumber}</p>
              </div>
            </div>

            <table class="inv-items">
              <thead>
                <tr>
                  <th style="width:40px;">No</th>
                  <th>Description</th>
                  <th style="width:110px; text-align:right;">Price</th>
                  <th style="width:70px; text-align:center;">Qty</th>
                  <th style="width:90px; text-align:center;">GST</th>
                  <th style="width:110px; text-align:right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtmlSimple}
              </tbody>
            </table>

            <div class="totals">
              <div class="right">
                <div class="row"><div>Subtotal</div><div>${formatCurrency(saleData.subtotal)}</div></div>
                ${saleData.discount > 0 ? `<div class="row"><div>Discount</div><div>-${formatCurrency(saleData.discount)}</div></div>` : ""}
                <div class="row"><div>GST</div><div>${formatCurrency(saleData.taxAmount || 0)}</div></div>
                <div class="row grand"><div>Total</div><div>${formatCurrency(saleData.grandTotal)}</div></div>
              </div>
            </div>

            <div class="payment">
              <div class="signature">
                <div>Payment Method: <strong>${saleData.paymentMethod || "Cash"}</strong></div>
                <div class="sig-line"></div>
                <div style="font-size:12px; color:#7a7a7a;">Signature</div>
              </div>
              <div class="methods">
                <div><strong>Paid:</strong> ${formatCurrency(saleData.paidAmount)}</div>
                <div><strong>Balance:</strong> ${formatCurrency(saleData.balanceDue)}</div>
              </div>
            </div>

            <div class="inv-footer">
              <div>${currentBusiness?.address || ""} • Phone: ${currentBusiness?.phone || ""}</div>
              <div>${currentBusiness?.invoiceFooter || ""}</div>
            </div>
          </div>
          <script>${autoPrint ? "window.onload = () => { setTimeout(() => { window.print(); }, 200); };" : ""}</script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    return;
  }

  // Fallback: use existing generic template for thermal/A4
  const itemsHtml = saleData.items
    .map(
      (item) => `
    <tr>
      <td style="width:70%;">${item.name} (${item.qty} ${item.unit})</td>
      <td style="text-align: right; width:30%;">${formatCurrency(item.lineTotal)}</td>
    </tr>
  `,
    )
    .join("");

  // Choose CSS based on requested format
  let pageCss = "";
  let bodyStyle = "";
  if (format === "A4") {
    pageCss = "@page { size: A4 portrait; margin: 10mm; }";
    bodyStyle = "width:210mm; font-family: Arial, sans-serif; font-size:12px;";
  } else {
    // thermal
    pageCss = "@page { size: 80mm auto; margin: 3mm; }";
    bodyStyle = "width:80mm; font-family: monospace; font-size:11px;";
  }

  printWindow.document.open();
  printWindow.document.write(`
    <html>
      <head>
        <title>Receipt - ${saleData.invoiceNumber}</title>
        <style>
          ${pageCss}
          body { ${bodyStyle} padding: 6px; color: #000; }
          h2, p { text-align: center; margin: 2px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          td { padding: 4px 0; vertical-align: top; }
          .border-top { border-top: 1px dashed #000; }
          .total-row { font-weight: bold; }
          .small { font-size: 10px; }
        </style>
      </head>
      <body>
        <h2>${currentBusiness?.shopName || "PakPOS Store"}</h2>
        <p class="small">${currentBusiness?.address || ""}</p>
        <p class="small">Phone: ${currentBusiness?.phone || "N/A"}</p>
        <p>--------------------------------</p>
        <p>Invoice: ${saleData.invoiceNumber}</p>
        <p>Customer: ${saleData.customerName}</p>
        <p>--------------------------------</p>
        <table>
          ${itemsHtml}
          <tr class="border-top">
            <td>Subtotal:</td>
            <td style="text-align: right;">${formatCurrency(saleData.subtotal)}</td>
          </tr>
          ${saleData.discount > 0 ? `<tr><td>Discount:</td><td style="text-align: right;">-${formatCurrency(saleData.discount)}</td></tr>` : ""}
          ${saleData.taxAmount > 0 ? `<tr><td>GST:</td><td style="text-align: right;">${formatCurrency(saleData.taxAmount)}</td></tr>` : ""}
          <tr class="total-row border-top">
            <td>Grand Total:</td>
            <td style="text-align: right;">${formatCurrency(saleData.grandTotal)}</td>
          </tr>
          <tr>
            <td>Paid:</td>
            <td style="text-align: right;">${formatCurrency(saleData.paidAmount)}</td>
          </tr>
          <tr>
            <td>Balance:</td>
            <td style="text-align: right;">${formatCurrency(saleData.balanceDue)}</td>
          </tr>
        </table>
        <p style="margin-top: 10px; text-align:center;">${currentBusiness?.invoiceFooter || "Thank you for shopping!"}</p>
        <script>
          // Auto-print on window load (user can cancel or choose printer);
          window.onload = () => { setTimeout(() => { window.print(); }, 200); };
        <\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
};

// ==========================================================================
// 4. AUTHENTICATION & NAVIGATION INITIALIZATION
// ==========================================================================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await loadUserProfileAndBusiness();
    document.getElementById("auth-screen")?.classList.add("hidden");
    document.getElementById("app-screen")?.classList.remove("hidden");
    initNavigation();
    initAppListeners();
    setupRealtimeListeners();
    startClock();
  } else {
    currentUser = null;
    currentBusiness = null;
    businessId = null;
    document.getElementById("app-screen")?.classList.add("hidden");
    document.getElementById("auth-screen")?.classList.remove("hidden");
  }
});

const startClock = () => {
  const clock = document.getElementById("clock-display");
  if (!clock) return;
  setInterval(() => {
    const now = new Date();
    clock.innerText = now.toLocaleTimeString("en-PK") + " PKT";
  }, 1000);
};

const loadUserProfileAndBusiness = async () => {
  try {
    const userRef = doc(db, "users", currentUser.uid);
    let userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      const newBizRef = doc(collection(db, "businesses"));
      await setDoc(newBizRef, {
        shopName: "My PakPOS Store",
        ownerName: currentUser.displayName || "Admin",
        phone: "",
        address: "",
        tax: 0,
        createdAt: serverTimestamp(),
      });

      await setDoc(userRef, {
        uid: currentUser.uid,
        name: currentUser.displayName || "Admin User",
        email: currentUser.email,
        businessId: newBizRef.id,
        role: "Admin",
      });

      userDoc = await getDoc(userRef);
    }

    const userData = userDoc.data() || {};
    businessId = userData.businessId || "default_biz";

    const bizDoc = await getDoc(doc(db, "businesses", businessId));
    if (bizDoc.exists()) {
      currentBusiness = bizDoc.data();
    } else {
      currentBusiness = {
        shopName: "My PakPOS Store",
        ownerName: "Admin",
        phone: "",
        address: "",
        tax: 0,
      };
    }

    const shopElem = document.getElementById("sidebar-shop-name");
    const roleElem = document.getElementById("sidebar-user-role");

    if (shopElem) shopElem.innerText = currentBusiness.shopName || "My Store";
    if (roleElem) roleElem.innerText = userData.role || "Admin";

    const setShopName = document.getElementById("set-shop-name");
    const setShopPhone = document.getElementById("set-shop-phone");
    const setShopAddress = document.getElementById("set-shop-address");
    const setShopTax = document.getElementById("set-shop-tax");

    if (setShopName) setShopName.value = currentBusiness.shopName || "";
    if (setShopPhone) setShopPhone.value = currentBusiness.phone || "";
    if (setShopAddress) setShopAddress.value = currentBusiness.address || "";
    if (setShopTax) setShopTax.value = currentBusiness.tax || 0;
  } catch (err) {
    if (err.code === "permission-denied") {
      showToast(
        "Firebase Rule Error: Update Firestore Rules in console.",
        "error",
      );
    } else {
      showToast("Error loading shop profile: " + err.message, "error");
    }
  }
};

const navigateTo = (pageId) => {
  const pages = document.querySelectorAll(".page-view");
  const navLinks = document.querySelectorAll(".sidebar-nav a");
  const title = document.getElementById("page-title");

  pages.forEach((p) => p.classList.remove("active"));
  navLinks.forEach((l) => l.classList.remove("active"));

  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) targetPage.classList.add("active");

  const activeLink = document.querySelector(
    `.sidebar-nav a[data-page="${pageId}"]`,
  );
  if (activeLink) activeLink.classList.add("active");

  if (title) {
    const titles = {
      dashboard: "Dashboard",
      pos: "POS Terminal",
      products: "Inventory Management",
      purchases: "Stock Purchases",
      "sales-history": "Sales History",
      customers: "Customers & Udhaar",
      suppliers: "Suppliers Directory",
      expenses: "Expense Tracker",
      reports: "Financial Reports",
      settings: "Store Settings",
    };
    title.innerText = titles[pageId] || "Dashboard";
  }

  document.getElementById("sidebar")?.classList.remove("open");
  document.getElementById("sidebar-overlay")?.classList.remove("open");
};

const initNavigation = () => {
  document.querySelectorAll(".sidebar-nav a").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const page = link.getAttribute("data-page");
      if (page) navigateTo(page);
    });
  });

  document
    .getElementById("quick-pos-btn")
    ?.addEventListener("click", () => navigateTo("pos"));

  const hamburger = document.getElementById("mobile-hamburger");
  const closeBtn = document.getElementById("sidebar-close-btn");
  const overlay = document.getElementById("sidebar-overlay");
  const sidebar = document.getElementById("sidebar");

  hamburger?.addEventListener("click", () => {
    sidebar?.classList.add("open");
    overlay?.classList.add("open");
  });

  closeBtn?.addEventListener("click", () => {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("open");
  });

  overlay?.addEventListener("click", () => {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("open");
  });

  const themeToggle = document.getElementById("theme-toggle");
  themeToggle?.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    const isDark = document.body.classList.contains("dark-mode");
    themeToggle.innerHTML = isDark
      ? `<i class="fa-solid fa-sun"></i> <span>Light Mode</span>`
      : `<i class="fa-solid fa-moon"></i> <span>Dark Mode</span>`;
  });
};

const initAppListeners = () => {
  const catFilter = document.getElementById("product-category-filter");
  const prodSearch = document.getElementById("product-search-input");
  if (catFilter) catFilter.addEventListener("change", renderProductsTable);
  if (prodSearch) prodSearch.addEventListener("input", renderProductsTable);

  const posSearch = document.getElementById("pos-search");
  const posCatSelect = document.getElementById("pos-category-filter");
  if (posSearch) {
    posSearch.addEventListener("input", (e) => {
      state.posSearchQuery = e.target.value;
      renderPosProducts();
    });
  }
  if (posCatSelect) {
    posCatSelect.addEventListener("change", (e) => {
      state.selectedCategory = e.target.value;
      renderPosProducts();
      renderCategoryChips();
    });
  }

  document
    .getElementById("pos-discount-input")
    ?.addEventListener("input", calculateCartTotals);
  document
    .getElementById("pos-tax-input")
    ?.addEventListener("input", calculateCartTotals);
  document
    .getElementById("pos-paid-amount")
    ?.addEventListener("input", calculateCartTotals);
  document.getElementById("pos-clear-cart")?.addEventListener("click", () => {
    state.cart = [];
    renderCart();
  });

  // Print preview of current cart (without completing sale)
  document
    .getElementById("pos-print-preview-btn")
    ?.addEventListener("click", () => {
      const format =
        document.getElementById("pos-print-format")?.value || "thermal";
      if (!state.cart || state.cart.length === 0) {
        showToast("Cart is empty", "error");
        return;
      }

      // Build temporary saleData object from current cart for preview
      let subtotal = 0;
      const saleItems = state.cart.map((item) => {
        const normalizedQty = normalizeToStandardUnit(item.qty, item.unit);
        const lineTotal = normalizedQty * item.sellingPrice;
        subtotal += lineTotal;
        return Object.assign({}, item, { normalizedQty, lineTotal });
      });
      const discount =
        parseFloat(document.getElementById("pos-discount-input")?.value) || 0;
      const taxPct =
        parseFloat(document.getElementById("pos-tax-input")?.value) || 0;
      const taxAmount = (subtotal - discount) * (taxPct / 100);
      const grandTotal = Math.max(0, subtotal - discount + taxAmount);
      const paidAmount =
        parseFloat(document.getElementById("pos-paid-amount")?.value) || 0;
      const balanceDue = grandTotal > paidAmount ? grandTotal - paidAmount : 0;
      const customerId =
        document.getElementById("pos-customer-select")?.value || "WALKIN";
      const customerObj = state.customers.find((c) => c.id === customerId);
      const customerName = customerObj ? customerObj.name : "Walk-in Customer";

      const salePreview = {
        invoiceNumber: "INV-" + Math.floor(1000 + Math.random() * 9000),
        customerName,
        items: saleItems,
        subtotal,
        discount,
        taxAmount,
        grandTotal,
        paidAmount,
        balanceDue,
        paymentMethod:
          document.getElementById("pos-payment-method")?.value || "Cash",
      };

      const printWindow = window.open("", "_blank", "width=400,height=600");
      populatePrintWindowContent(printWindow, salePreview, format, false);
    });

  document
    .getElementById("settings-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      toggleLoader(true, "Saving Settings...");
      try {
        const shopName = document.getElementById("set-shop-name").value;
        const phone = document.getElementById("set-shop-phone").value;
        const address = document.getElementById("set-shop-address").value;
        const tax =
          parseFloat(document.getElementById("set-shop-tax").value) || 0;

        await updateDoc(doc(db, "businesses", businessId), {
          shopName,
          phone,
          address,
          tax,
        });
        showToast("Settings updated successfully!", "success");
        loadUserProfileAndBusiness();
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        toggleLoader(false);
      }
    });

  document
    .getElementById("load-demo-data-btn")
    ?.addEventListener("click", seedDemoData);
  document
    .getElementById("export-products-csv")
    ?.addEventListener("click", exportProductsCSV);
  document
    .getElementById("export-sales-csv")
    ?.addEventListener("click", exportSalesCSV);
  document
    .getElementById("add-expense-btn")
    ?.addEventListener("click", () => openExpenseFormModal());
  document
    .getElementById("new-purchase-btn")
    ?.addEventListener("click", () => openPurchaseFormModal());
  document
    .getElementById("add-supplier-btn")
    ?.addEventListener("click", () => openSupplierFormModal());

  const posCustSearch = document.getElementById("pos-customer-search");
  if (posCustSearch) {
    posCustSearch.addEventListener("input", (e) => {
      const q = (e.target.value || "").toLowerCase();
      const select = document.getElementById("pos-customer-select");
      if (!select) return;
      select.innerHTML = `<option value="WALKIN">Walk-in Customer (Grahak)</option>`;
      state.customers
        .filter(
          (c) =>
            (c.name || "").toLowerCase().includes(q) ||
            (c.phone || "").toLowerCase().includes(q),
        )
        .forEach((c) => {
          select.innerHTML += `<option value="${c.id}">${c.name} (${c.phone || "No Phone"}) - Bal: ${formatCurrency(c.balance)}</option>`;
        });
    });
  }

  document
    .getElementById("pos-add-customer-btn")
    ?.addEventListener("click", () => {
      document.getElementById("add-customer-btn")?.click();
    });

  document
    .getElementById("generate-report-btn")
    ?.addEventListener("click", generateReport);

  // --- Mobile POS cart drawer toggle ---
  const createMobileCartToggle = () => {
    // Only create if not present
    if (document.getElementById("cart-toggle-btn")) return;

    const btn = document.createElement("button");
    btn.id = "cart-toggle-btn";
    btn.className = "cart-toggle-btn mobile-only";
    btn.innerHTML = `<i class="fa-solid fa-cart-shopping"></i> Cart`;
    document.body.appendChild(btn);

    const overlay = document.createElement("div");
    overlay.id = "cart-overlay";
    overlay.className = "cart-overlay";
    document.body.appendChild(overlay);

    const posRight = document.querySelector(".pos-right");
    if (!posRight) return;

    const openCart = () => {
      posRight.classList.add("open");
      overlay.classList.add("open");
    };
    const closeCart = () => {
      posRight.classList.remove("open");
      overlay.classList.remove("open");
    };

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (posRight.classList.contains("open")) closeCart();
      else openCart();
    });

    overlay.addEventListener("click", () => closeCart());

    // Close cart when navigating away from POS page
    document.querySelectorAll(".sidebar-nav a").forEach((link) => {
      link.addEventListener("click", () => closeCart());
    });

    // Auto-show/hide based on viewport
    const checkViewport = () => {
      if (window.innerWidth <= 600) {
        btn.classList.remove("hidden");
      } else {
        btn.classList.add("hidden");
        closeCart();
      }
    };

    window.addEventListener("resize", checkViewport);
    checkViewport();
  };

  createMobileCartToggle();
};

document.getElementById("login-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  toggleLoader(true, "Signing in...");
  try {
    const email = document.getElementById("login-email").value;
    const pass = document.getElementById("login-password").value;
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    toggleLoader(false);
  }
});

document
  .getElementById("register-form")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();
    toggleLoader(true, "Registering Store...");
    try {
      const name = document.getElementById("reg-name").value;
      const shopName = document.getElementById("reg-shop").value;
      const email = document.getElementById("reg-email").value;
      const pass = document.getElementById("reg-password").value;

      const userCred = await createUserWithEmailAndPassword(auth, email, pass);
      const uid = userCred.user.uid;
      const newBizRef = doc(collection(db, "businesses"));

      await setDoc(newBizRef, {
        shopName,
        ownerName: name,
        phone: "",
        address: "",
        tax: 0,
        createdAt: serverTimestamp(),
      });

      await setDoc(doc(db, "users", uid), {
        uid,
        name,
        email,
        businessId: newBizRef.id,
        role: "Admin",
      });

      showToast("Store setup successful!", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      toggleLoader(false);
    }
  });

document.getElementById("show-register")?.addEventListener("click", () => {
  document.getElementById("login-form")?.classList.add("hidden");
  document.getElementById("register-form")?.classList.remove("hidden");
});

document.getElementById("show-login")?.addEventListener("click", () => {
  document.getElementById("register-form")?.classList.add("hidden");
  document.getElementById("login-form")?.classList.remove("hidden");
});

document
  .getElementById("logout-btn")
  ?.addEventListener("click", () => signOut(auth));

// ==========================================================================
// 5. FIRESTORE REAL-TIME SUBSCRIPTIONS
// ==========================================================================
const setupRealtimeListeners = () => {
  if (!businessId) return;

  const handleErr = (err) => {
    if (err.code === "permission-denied") {
      showToast(
        "Access Denied: Please check Firestore Rules in Firebase Console.",
        "error",
      );
    }
  };

  const qProd = query(
    collection(db, "products"),
    where("businessId", "==", businessId),
  );
  onSnapshot(
    qProd,
    (snapshot) => {
      state.products = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      renderProductsTable();
      renderPosProducts();
      populateCategoryDropdowns();
      renderCategoryChips();
      updateDashboardMetrics();
    },
    handleErr,
  );

  const qCust = query(
    collection(db, "customers"),
    where("businessId", "==", businessId),
  );
  onSnapshot(
    qCust,
    (snapshot) => {
      state.customers = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      renderCustomersTable();
      renderPosCustomerDropdown();
    },
    handleErr,
  );

  const qSupp = query(
    collection(db, "suppliers"),
    where("businessId", "==", businessId),
  );
  onSnapshot(
    qSupp,
    (snapshot) => {
      state.suppliers = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      renderSuppliersTable();
    },
    handleErr,
  );

  const qSales = query(
    collection(db, "sales"),
    where("businessId", "==", businessId),
  );
  onSnapshot(
    qSales,
    (snapshot) => {
      state.sales = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderSalesHistoryTable();
      updateDashboardMetrics();
      renderCharts();
    },
    handleErr,
  );

  const qPurch = query(
    collection(db, "purchases"),
    where("businessId", "==", businessId),
  );
  onSnapshot(
    qPurch,
    (snapshot) => {
      state.purchases = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      renderPurchasesTable();
      updateDashboardMetrics();
    },
    handleErr,
  );

  const qExp = query(
    collection(db, "expenses"),
    where("businessId", "==", businessId),
  );
  onSnapshot(
    qExp,
    (snapshot) => {
      state.expenses = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      renderExpensesTable();
    },
    handleErr,
  );
};

const populateCategoryDropdowns = () => {
  const invSelect = document.getElementById("product-category-filter");
  const posSelect = document.getElementById("pos-category-filter");

  const options =
    `<option value="ALL">All Categories</option>` +
    state.categories.map((c) => `<option value="${c}">${c}</option>`).join("");

  if (invSelect) invSelect.innerHTML = options;
  if (posSelect) posSelect.innerHTML = options;
};

const renderCategoryChips = () => {
  const container = document.getElementById("pos-category-chips");
  if (!container) return;

  const cats = ["ALL", ...state.categories];
  container.innerHTML = cats
    .map(
      (c) => `
    <span class="chip ${state.selectedCategory === c ? "active" : ""}" onclick="window.selectCategoryChip('${c}')">${c}</span>
  `,
    )
    .join("");
};

window.selectCategoryChip = (cat) => {
  state.selectedCategory = cat;
  const posSelect = document.getElementById("pos-category-filter");
  if (posSelect) posSelect.value = cat;
  renderPosProducts();
  renderCategoryChips();
};

const renderSalesHistoryTable = () => {
  const tbody = document.getElementById("sales-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  state.sales.forEach((s) => {
    const tr = document.createElement("tr");
    const dateStr = s.createdAt?.toDate
      ? s.createdAt.toDate().toLocaleString()
      : "N/A";
    tr.innerHTML = `
      <td><strong>${s.invoiceNumber}</strong></td>
      <td>${dateStr}</td>
      <td>${s.customerName || "Walk-in"}</td>
      <td>${(s.items || []).length} items</td>
      <td><strong>${formatCurrency(s.grandTotal)}</strong></td>
      <td><span class="chip">${s.paymentMethod || "Cash"}</span></td>
      <td><span class="chip bg-green" style="color:#fff;">Completed</span></td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick='window.reprintInvoice(${JSON.stringify(s)})'><i class="fa-solid fa-print"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
};

window.reprintInvoice = (saleObj) => {
  const format =
    document.getElementById("pos-print-format")?.value || "thermal";
  const printWindow = window.open("", "_blank", "width=400,height=600");
  populatePrintWindowContent(printWindow, saleObj, format, true);
};

const renderPurchasesTable = () => {
  const tbody = document.getElementById("purchases-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  state.purchases.forEach((p) => {
    const tr = document.createElement("tr");
    const dateStr = p.createdAt?.toDate
      ? p.createdAt.toDate().toLocaleDateString()
      : "N/A";
    tr.innerHTML = `
      <td><strong>${p.invoiceNumber || "PUR-001"}</strong></td>
      <td>${dateStr}</td>
      <td>${p.supplierName}</td>
      <td>${formatCurrency(p.totalAmount)}</td>
      <td>${formatCurrency(p.paidAmount)}</td>
      <td><strong class="text-red">${formatCurrency(p.balanceDue)}</strong></td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="window.editPurchaseModal('${p.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-sm btn-danger" onclick="window.deletePurchase('${p.id}')"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
};

const renderExpensesTable = () => {
  const tbody = document.getElementById("expenses-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  state.expenses.forEach((e) => {
    const tr = document.createElement("tr");
    const dateStr = e.createdAt?.toDate
      ? e.createdAt.toDate().toLocaleDateString()
      : "N/A";
    tr.innerHTML = `
      <td>${dateStr}</td>
      <td><strong>${e.title}</strong></td>
      <td><span class="chip">${e.category}</span></td>
      <td><strong class="text-red">${formatCurrency(e.amount)}</strong></td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="window.editExpenseModal('${e.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-sm btn-danger" onclick="window.deleteExpense('${e.id}')"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
};

window.editExpenseModal = (id) => {
  const e = state.expenses.find((x) => x.id === id);
  if (e) openExpenseFormModal(e);
};

window.deleteExpense = async (id) => {
  if (confirm("Delete expense entry?")) {
    await deleteDoc(doc(db, "expenses", id));
    showToast("Expense removed.", "info");
  }
};

// ==========================================================================
// 6. DASHBOARD & CHARTS MODULE
// ==========================================================================
const updateDashboardMetrics = () => {
  const todayStr = new Date().toISOString().split("T")[0];

  let todaySalesTotal = 0;
  let todayProfitTotal = 0;
  let todayOrdersCount = 0;

  state.sales.forEach((sale) => {
    const saleDate = sale.createdAt?.toDate
      ? sale.createdAt.toDate().toISOString().split("T")[0]
      : "";
    if (saleDate === todayStr) {
      todaySalesTotal += sale.grandTotal || 0;
      todayProfitTotal += sale.totalProfit || 0;
      todayOrdersCount++;
    }
  });

  let todayPurchasesTotal = 0;
  state.purchases.forEach((purch) => {
    const purchDate = purch.createdAt?.toDate
      ? purch.createdAt.toDate().toISOString().split("T")[0]
      : "";
    if (purchDate === todayStr) todayPurchasesTotal += purch.totalAmount || 0;
  });

  let lowStockCount = 0;
  let totalStockVal = 0;
  state.products.forEach((p) => {
    if (p.currentStock <= (p.minStockAlert || 5)) lowStockCount++;
    totalStockVal += p.currentStock * p.purchasePrice;
  });

  let totalReceivables = 0;
  state.customers.forEach((c) => (totalReceivables += c.balance || 0));

  const setElem = (id, val) => {
    const elem = document.getElementById(id);
    if (elem) elem.innerText = val;
  };

  setElem("dash-today-sales", formatCurrency(todaySalesTotal));
  setElem("dash-today-profit", formatCurrency(todayProfitTotal));
  setElem("dash-today-orders", todayOrdersCount);
  setElem("dash-today-purchases", formatCurrency(todayPurchasesTotal));
  setElem("dash-total-products", state.products.length);
  setElem("dash-low-stock-count", lowStockCount);
  setElem("dash-stock-value", formatCurrency(totalStockVal));
  setElem("dash-total-receivables", formatCurrency(totalReceivables));
};

const renderCharts = () => {
  if (typeof Chart === "undefined") return;

  const salesCanvas = document.getElementById("sales-chart");
  if (salesCanvas) {
    const ctxSales = salesCanvas.getContext("2d");
    const days = [];
    const salesData = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      days.push(d.toLocaleDateString("en-PK", { weekday: "short" }));

      const dayTotal = state.sales
        .filter(
          (s) =>
            s.createdAt?.toDate &&
            s.createdAt.toDate().toISOString().split("T")[0] === dateStr,
        )
        .reduce((acc, curr) => acc + curr.grandTotal, 0);
      salesData.push(dayTotal);
    }

    if (salesChartInstance) salesChartInstance.destroy();
    salesChartInstance = new Chart(ctxSales, {
      type: "line",
      data: {
        labels: days,
        datasets: [
          {
            label: "Daily Sales (PKR)",
            data: salesData,
            borderColor: "#0f766e",
            backgroundColor: "rgba(15, 118, 110, 0.1)",
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }

  const topCanvas = document.getElementById("top-products-chart");
  if (topCanvas) {
    const ctxTop = topCanvas.getContext("2d");
    const productSalesMap = {};

    state.sales.forEach((s) => {
      (s.items || []).forEach((item) => {
        productSalesMap[item.name] =
          (productSalesMap[item.name] || 0) + item.lineTotal;
      });
    });

    const sortedProducts = Object.entries(productSalesMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (topProductsChartInstance) topProductsChartInstance.destroy();
    topProductsChartInstance = new Chart(ctxTop, {
      type: "bar",
      data: {
        labels: sortedProducts.map((p) => p[0]),
        datasets: [
          {
            label: "Revenue (PKR)",
            data: sortedProducts.map((p) => p[1]),
            backgroundColor: "#16a34a",
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }
};

// ==========================================================================
// 7. POS TERMINAL ENGINE
// ==========================================================================
const renderPosProducts = () => {
  const grid = document.getElementById("pos-product-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const filtered = state.products.filter((p) => {
    const matchesCat =
      state.selectedCategory === "ALL" || p.category === state.selectedCategory;
    const q = state.posSearchQuery.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.includes(q)) ||
      (p.sku && p.sku.toLowerCase().includes(q));
    return matchesCat && matchesSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;"><p>No matching products found.</p></div>`;
    return;
  }

  filtered.forEach((p) => {
    const card = document.createElement("div");
    card.className = "pos-product-card";
    card.onclick = () => addToCart(p);
    card.innerHTML = `
      <div>
        <div class="pos-product-title">${p.name}</div>
        <div class="pos-product-stock">Stock: ${p.currentStock} ${p.unit}</div>
      </div>
      <div class="pos-product-price">${formatCurrency(p.sellingPrice)} / ${p.unit}</div>
    `;
    grid.appendChild(card);
  });
};

const addToCart = (product) => {
  const existingIndex = state.cart.findIndex((item) => item.id === product.id);

  if (existingIndex > -1) {
    state.cart[existingIndex].qty += product.unit === "Gram" ? 250 : 1;
  } else {
    const initQty = product.unit === "Gram" ? 250 : 1;
    state.cart.push({
      id: product.id,
      name: product.name,
      unit: product.unit,
      purchasePrice: product.purchasePrice,
      sellingPrice: product.sellingPrice,
      qty: initQty,
    });
  }
  renderCart();
};

const renderCart = () => {
  const container = document.getElementById("pos-cart-items");
  if (!container) return;
  container.innerHTML = "";

  if (state.cart.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-basket-shopping"></i><p>Cart is empty.</p></div>`;
    calculateCartTotals();
    return;
  }

  state.cart.forEach((item, index) => {
    const el = document.createElement("div");
    el.className = "cart-item";

    const normalizedQty = normalizeToStandardUnit(item.qty, item.unit);
    const lineTotal = normalizedQty * item.sellingPrice;

    el.innerHTML = `
      <div class="cart-item-info">
        <div class="cart-item-title">${item.name}</div>
        <div class="cart-item-unit-price">${formatCurrency(item.sellingPrice)} / ${item.unit}</div>
      </div>
      <div class="cart-item-qty-controls">
        <input type="number" step="${item.unit === "KG" || item.unit === "Gram" ? "0.05" : "1"}" 
               value="${item.qty}" onchange="window.updateCartQty(${index}, this.value)">
        <span style="font-size: 0.75rem;">${item.unit}</span>
      </div>
      <div style="font-weight: 700; width: 80px; text-align: right;">${formatCurrency(lineTotal)}</div>
      <button class="icon-btn text-red" onclick="window.removeCartItem(${index})"><i class="fa-solid fa-xmark"></i></button>
    `;
    container.appendChild(el);
  });

  calculateCartTotals();
};

window.updateCartQty = (index, val) => {
  const parsed = parseFloat(val);
  if (isNaN(parsed) || parsed <= 0) {
    state.cart.splice(index, 1);
  } else {
    state.cart[index].qty = parsed;
  }
  renderCart();
};

window.removeCartItem = (index) => {
  state.cart.splice(index, 1);
  renderCart();
};

const calculateCartTotals = () => {
  let subtotal = 0;
  state.cart.forEach((item) => {
    const normalizedQty = normalizeToStandardUnit(item.qty, item.unit);
    subtotal += normalizedQty * item.sellingPrice;
  });

  const discount =
    parseFloat(document.getElementById("pos-discount-input")?.value) || 0;
  const taxPct =
    parseFloat(document.getElementById("pos-tax-input")?.value) || 0;

  const taxAmount = (subtotal - discount) * (taxPct / 100);
  const grandTotal = Math.max(0, subtotal - discount + taxAmount);

  const paidAmount =
    parseFloat(document.getElementById("pos-paid-amount")?.value) || 0;
  const diff = paidAmount - grandTotal;

  const setVal = (id, val) => {
    const elem = document.getElementById(id);
    if (elem) elem.innerText = val;
  };

  setVal("pos-subtotal", formatCurrency(subtotal));
  setVal("pos-grand-total", formatCurrency(grandTotal));

  if (diff >= 0) {
    setVal("pos-change-due", formatCurrency(diff));
    setVal("pos-balance-due", formatCurrency(0));
  } else {
    setVal("pos-change-due", formatCurrency(0));
    setVal("pos-balance-due", formatCurrency(Math.abs(diff)));
  }
};

// CHECKOUT TRANSACTION
document
  .getElementById("pos-checkout-btn")
  ?.addEventListener("click", async () => {
    if (state.cart.length === 0) {
      showToast("Cart is empty!", "error");
      return;
    }

    // Open receipt window synchronously on user click to prevent popup blockers
    const format =
      document.getElementById("pos-print-format")?.value || "thermal";
    const printWindow = window.open("", "_blank", "width=400,height=600");

    toggleLoader(true, "Completing Sale & Updating Stock...");

    try {
      let subtotal = 0;
      let totalCost = 0;

      const saleItems = state.cart.map((item) => {
        const normalizedQty = normalizeToStandardUnit(item.qty, item.unit);
        const lineTotal = normalizedQty * item.sellingPrice;
        const lineCost = normalizedQty * item.purchasePrice;

        subtotal += lineTotal;
        totalCost += lineCost;

        return {
          productId: item.id,
          name: item.name,
          unit: item.unit,
          qty: item.qty,
          normalizedQty,
          sellingPrice: item.sellingPrice,
          purchasePrice: item.purchasePrice,
          lineTotal,
        };
      });

      const discount =
        parseFloat(document.getElementById("pos-discount-input")?.value) || 0;
      const taxPct =
        parseFloat(document.getElementById("pos-tax-input")?.value) || 0;
      const taxAmount = (subtotal - discount) * (taxPct / 100);
      const grandTotal = Math.max(0, subtotal - discount + taxAmount);
      const paidAmount =
        parseFloat(document.getElementById("pos-paid-amount")?.value) || 0;
      const balanceDue = grandTotal > paidAmount ? grandTotal - paidAmount : 0;
      const totalProfit = grandTotal - totalCost;

      const paymentMethod =
        document.getElementById("pos-payment-method")?.value || "Cash";
      const customerId =
        document.getElementById("pos-customer-select")?.value || "WALKIN";
      const customerObj = state.customers.find((c) => c.id === customerId);
      const customerName = customerObj ? customerObj.name : "Walk-in Customer";

      let generatedInvNum = "";

      await runTransaction(db, async (transaction) => {
        // 1. All Reads First
        const productDocsMap = new Map();

        for (const item of saleItems) {
          const prodRef = doc(db, "products", item.productId);
          const prodDoc = await transaction.get(prodRef);

          if (!prodDoc.exists())
            throw new Error(`Product ${item.name} does not exist!`);

          const currentStock = prodDoc.data().currentStock;
          if (currentStock < item.normalizedQty) {
            throw new Error(
              `Insufficient stock for ${item.name}! Stock left: ${currentStock}`,
            );
          }

          productDocsMap.set(item.productId, {
            ref: prodRef,
            stock: currentStock,
          });
        }

        let customerDocData = null;
        let custRef = null;
        if (balanceDue > 0 && customerId !== "WALKIN") {
          custRef = doc(db, "customers", customerId);
          const custDoc = await transaction.get(custRef);
          if (custDoc.exists()) {
            customerDocData = custDoc.data();
          }
        }

        const invoiceCounterRef = doc(
          db,
          "businesses",
          businessId,
          "counters",
          "invoices",
        );
        const invoiceCounterDoc = await transaction.get(invoiceCounterRef);
        const nextInvoiceSequence =
          (invoiceCounterDoc.exists()
            ? invoiceCounterDoc.data().lastNumber || 0
            : 0) + 1;

        // 2. All Writes After Reads
        for (const item of saleItems) {
          const prodInfo = productDocsMap.get(item.productId);
          const newStock = prodInfo.stock - item.normalizedQty;
          transaction.update(prodInfo.ref, {
            currentStock: newStock,
            updatedAt: serverTimestamp(),
          });
        }

        const now = new Date();
        const invoiceDate = [
          now.getFullYear(),
          now.getMonth() + 1,
          now.getDate(),
        ]
          .map((part) => String(part).padStart(2, "0"))
          .join("");
        generatedInvNum = `INV-${invoiceDate}-${String(nextInvoiceSequence).padStart(4, "0")}`;
        const newSaleRef = doc(collection(db, "sales"));

        transaction.set(
          invoiceCounterRef,
          { lastNumber: nextInvoiceSequence },
          { merge: true },
        );

        transaction.set(newSaleRef, {
          businessId,
          invoiceNumber: generatedInvNum,
          customerId,
          customerName,
          items: saleItems,
          subtotal,
          discount,
          taxAmount,
          grandTotal,
          paidAmount,
          balanceDue,
          totalProfit,
          paymentMethod,
          cashierUid: currentUser.uid,
          createdAt: serverTimestamp(),
        });

        if (custRef && customerDocData) {
          const newBal = (customerDocData.balance || 0) + balanceDue;
          transaction.update(custRef, { balance: newBal });
        }
      });

      showToast("Sale completed successfully!", "success");

      const saleReceiptData = {
        invoiceNumber: generatedInvNum,
        customerName,
        items: saleItems,
        subtotal,
        discount,
        taxAmount,
        grandTotal,
        paidAmount,
        balanceDue,
        paymentMethod,
      };

      populatePrintWindowContent(printWindow, saleReceiptData, format, true);

      state.cart = [];
      if (document.getElementById("pos-discount-input"))
        document.getElementById("pos-discount-input").value = 0;
      if (document.getElementById("pos-paid-amount"))
        document.getElementById("pos-paid-amount").value = "";
      renderCart();
    } catch (err) {
      if (printWindow) printWindow.close();
      showToast(err.message, "error");
    } finally {
      toggleLoader(false);
    }
  });

// ==========================================================================
// 8. PRODUCT MANAGEMENT
// ==========================================================================
const renderProductsTable = () => {
  const tbody = document.getElementById("products-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const filter =
    document.getElementById("product-category-filter")?.value || "ALL";
  const q =
    document.getElementById("product-search-input")?.value.toLowerCase() || "";

  const filtered = state.products.filter((p) => {
    const matchCat = filter === "ALL" || p.category === filter;
    const matchQ =
      p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q));
    return matchCat && matchQ;
  });

  filtered.forEach((p) => {
    const tr = document.createElement("tr");
    const isLow = p.currentStock <= (p.minStockAlert || 5);

    tr.innerHTML = `
      <td>${p.barcode || p.sku || "N/A"}</td>
      <td><strong>${p.name}</strong></td>
      <td><span class="chip">${p.category}</span></td>
      <td>${p.unit}</td>
      <td>${formatCurrency(p.purchasePrice)}</td>
      <td>${formatCurrency(p.sellingPrice)}</td>
      <td><strong>${p.currentStock}</strong> ${p.unit}</td>
      <td><span class="chip ${isLow ? "bg-red" : "bg-green"}" style="color:#fff;">${isLow ? "Low Stock" : "In Stock"}</span></td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="window.editProductModal('${p.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-sm btn-danger" onclick="window.deleteProduct('${p.id}')"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
};

document.getElementById("add-product-btn")?.addEventListener("click", () => {
  openProductModal();
});

const openProductModal = (product = null) => {
  const modalContainer = document.getElementById("modal-container");
  const modalContent = document.getElementById("modal-content");
  if (!modalContainer || !modalContent) return;

  modalContent.innerHTML = `
    <div class="modal-header">
      <h3>${product ? "Edit Product" : "Add New Product"}</h3>
      <button class="icon-btn" onclick="window.closeModal()"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="product-form">
      <div class="modal-body">
        <div class="form-group">
          <label>Product Name *</label>
          <input type="text" id="prod-name" value="${product ? product.name : ""}" required>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Barcode / SKU</label>
            <input type="text" id="prod-barcode" value="${product ? product.barcode || "" : ""}">
          </div>
          <div class="form-group">
            <label>Category</label>
            <select id="prod-category">
              ${state.categories.map((c) => `<option value="${c}" ${product && product.category === c ? "selected" : ""}>${c}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Unit Type</label>
            <select id="prod-unit">
              <option value="Piece" ${product && product.unit === "Piece" ? "selected" : ""}>Piece</option>
              <option value="KG" ${product && product.unit === "KG" ? "selected" : ""}>KG (Kilogram)</option>
              <option value="Gram" ${product && product.unit === "Gram" ? "selected" : ""}>Gram</option>
              <option value="Liter" ${product && product.unit === "Liter" ? "selected" : ""}>Liter</option>
              <option value="Box" ${product && product.unit === "Box" ? "selected" : ""}>Box</option>
              <option value="Pack" ${product && product.unit === "Pack" ? "selected" : ""}>Pack</option>
            </select>
          </div>
          <div class="form-group">
            <label>Current Stock</label>
            <input type="number" step="0.01" id="prod-stock" value="${product ? product.currentStock : "0"}" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Purchase Price (Cost)</label>
            <input type="number" step="0.01" id="prod-cost" value="${product ? product.purchasePrice : "0"}" required>
          </div>
          <div class="form-group">
            <label>Selling Price</label>
            <input type="number" step="0.01" id="prod-price" value="${product ? product.sellingPrice : "0"}" required>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Product</button>
      </div>
    </form>
  `;

  modalContainer.classList.remove("hidden");

  document.getElementById("product-form").onsubmit = async (e) => {
    e.preventDefault();
    toggleLoader(true, "Saving product...");

    const prodData = {
      businessId,
      name: document.getElementById("prod-name").value,
      barcode: document.getElementById("prod-barcode").value,
      category: document.getElementById("prod-category").value,
      unit: document.getElementById("prod-unit").value,
      currentStock:
        parseFloat(document.getElementById("prod-stock").value) || 0,
      purchasePrice:
        parseFloat(document.getElementById("prod-cost").value) || 0,
      sellingPrice:
        parseFloat(document.getElementById("prod-price").value) || 0,
      minStockAlert: 5,
      updatedAt: serverTimestamp(),
    };

    try {
      if (product) {
        await updateDoc(doc(db, "products", product.id), prodData);
        showToast("Product updated!", "success");
      } else {
        prodData.createdAt = serverTimestamp();
        await addDoc(collection(db, "products"), prodData);
        showToast("Product added!", "success");
      }
      window.closeModal();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      toggleLoader(false);
    }
  };
};

window.editProductModal = (id) => {
  const p = state.products.find((item) => item.id === id);
  if (p) openProductModal(p);
};

window.deleteProduct = async (id) => {
  if (confirm("Are you sure you want to delete this product?")) {
    try {
      await deleteDoc(doc(db, "products", id));
      showToast("Product deleted.", "info");
    } catch (err) {
      showToast(err.message, "error");
    }
  }
};

// ==========================================================================
// 9. CUSTOMERS, SUPPLIERS, EXPENSES, PURCHASES MODALS
// ==========================================================================
const renderCustomersTable = () => {
  const tbody = document.getElementById("customers-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  state.customers.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${c.name}</strong></td>
      <td>${c.phone || "N/A"}</td>
      <td>${c.cnic || "N/A"}</td>
      <td><strong class="${c.balance > 0 ? "text-red" : "text-green"}">${formatCurrency(c.balance)}</strong></td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="window.editCustomerModal('${c.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-sm btn-accent" onclick="window.receiveCustomerPayment('${c.id}')"><i class="fa-solid fa-hand-holding-dollar"></i> Clear Udhaar</button>
        <button class="btn btn-sm btn-danger" onclick="window.deleteCustomer('${c.id}')"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
};

const renderPosCustomerDropdown = () => {
  const select = document.getElementById("pos-customer-select");
  if (!select) return;
  select.innerHTML = `<option value="WALKIN">Walk-in Customer (Grahak)</option>`;
  state.customers.forEach((c) => {
    select.innerHTML += `<option value="${c.id}">${c.name} (${c.phone || "No Phone"}) - Bal: ${formatCurrency(c.balance)}</option>`;
  });
};

const openCustomerModal = (customer = null) => {
  // keep for backward compatibility
  if (!customer) {
    const name = prompt("Enter Customer Name:");
    if (!name) return;
    const phone = prompt("Enter Customer Phone (+92...):");
    addDoc(collection(db, "customers"), {
      businessId,
      name,
      phone: phone || "",
      balance: 0,
      createdAt: serverTimestamp(),
    }).then(() => showToast("Customer added!", "success"));
  } else {
    const newName =
      prompt("Edit Customer Name:", customer.name) || customer.name;
    const newPhone =
      prompt("Edit Customer Phone:", customer.phone || "") ||
      customer.phone ||
      "";
    const newCnic =
      prompt("Edit CNIC (optional):", customer.cnic || "") ||
      customer.cnic ||
      "";
    updateDoc(doc(db, "customers", customer.id), {
      name: newName,
      phone: newPhone,
      cnic: newCnic,
      updatedAt: serverTimestamp(),
    }).then(() => showToast("Customer updated!", "success"));
  }
};

// New: Customer Form Modal
const openCustomerFormModal = (customer = null) => {
  const modalContainer = document.getElementById("modal-container");
  const modalContent = document.getElementById("modal-content");
  if (!modalContainer || !modalContent) return;

  modalContent.innerHTML = `
    <div class="modal-header">
      <h3>${customer ? "Edit Customer" : "Add Customer"}</h3>
      <button class="icon-btn" onclick="window.closeModal()"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="customer-form">
      <div class="modal-body">
        <div class="form-group">
          <label>Full Name *</label>
          <input type="text" id="cust-name" value="${customer ? customer.name : ""}" required>
        </div>
        <div class="form-group">
          <label>Phone</label>
          <input type="text" id="cust-phone" value="${customer ? customer.phone || "" : ""}">
        </div>
        <div class="form-group">
          <label>CNIC (optional)</label>
          <input type="text" id="cust-cnic" value="${customer ? customer.cnic || "" : ""}">
        </div>
        <div class="form-group">
          <label>Initial Balance (Udhaar)</label>
          <input type="number" id="cust-balance" value="${customer ? customer.balance || 0 : 0}" step="0.01">
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Customer</button>
      </div>
    </form>
  `;

  modalContainer.classList.remove("hidden");

  document.getElementById("customer-form").onsubmit = async (e) => {
    e.preventDefault();
    toggleLoader(
      true,
      customer ? "Updating customer..." : "Saving customer...",
    );
    try {
      const data = {
        businessId,
        name: document.getElementById("cust-name").value,
        phone: document.getElementById("cust-phone").value || "",
        cnic: document.getElementById("cust-cnic").value || "",
        balance: parseFloat(document.getElementById("cust-balance").value) || 0,
        updatedAt: serverTimestamp(),
      };
      if (customer) {
        await updateDoc(doc(db, "customers", customer.id), data);
        showToast("Customer updated!", "success");
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, "customers"), data);
        showToast("Customer added!", "success");
      }
      window.closeModal();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      toggleLoader(false);
    }
  };
};

// wire the add customer button to the form modal
if (document.getElementById("add-customer-btn")) {
  document
    .getElementById("add-customer-btn")
    .addEventListener("click", () => openCustomerFormModal());
}

window.editCustomerModal = (id) => {
  const c = state.customers.find((x) => x.id === id);
  if (c) openCustomerFormModal(c);
};

window.deleteCustomer = async (id) => {
  if (confirm("Delete customer and their udhaar record?")) {
    await deleteDoc(doc(db, "customers", id));
    showToast("Customer deleted.", "info");
  }
};

window.receiveCustomerPayment = async (id) => {
  const cust = state.customers.find((c) => c.id === id);
  if (!cust) return;

  const amountStr = prompt(
    `Current Udhaar for ${cust.name}: ${formatCurrency(cust.balance)}\nEnter received payment amount (Rs.):`,
  );
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) return;

  try {
    const newBal = Math.max(0, cust.balance - amount);
    await updateDoc(doc(db, "customers", id), { balance: newBal });
    showToast("Udhaar payment recorded!", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
};

const renderSuppliersTable = () => {
  const tbody = document.getElementById("suppliers-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  // Compute overall totals from purchases
  let overallPaid = 0;
  let overallPayable = 0;

  // Build a quick lookup of purchases grouped by supplierName
  const purchasesBySupplier = {};
  (state.purchases || []).forEach((p) => {
    const name = (p.supplierName || "").toString();
    if (!purchasesBySupplier[name]) purchasesBySupplier[name] = [];
    purchasesBySupplier[name].push(p);
  });

  state.suppliers.forEach((s) => {
    const company = s.companyName || "";
    // Sum paidAmount and balanceDue for this supplier from purchases
    const purList = purchasesBySupplier[company] || [];
    const supplierPaid = purList.reduce(
      (acc, curr) => acc + (curr.paidAmount || 0),
      0,
    );
    const supplierPayable =
      purList.reduce((acc, curr) => acc + (curr.balanceDue || 0), 0) ||
      s.balance ||
      0;

    overallPaid += supplierPaid;
    overallPayable += supplierPayable;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${s.companyName}</strong></td>
      <td>${s.contactName || "N/A"}</td>
      <td>${s.phone || "N/A"}</td>
      <td>${formatCurrency(supplierPaid)}</td>
      <td><strong class="text-red">${formatCurrency(supplierPayable)}</strong></td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="window.editSupplierModal('${s.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-sm btn-danger" onclick="window.deleteSupplier('${s.id}')"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Update overall totals in the UI if present
  const totalPaidEl = document.getElementById("suppliers-total-paid");
  const totalPayableEl = document.getElementById("suppliers-total-payable");
  if (totalPaidEl) totalPaidEl.innerText = formatCurrency(overallPaid);
  if (totalPayableEl) totalPayableEl.innerText = formatCurrency(overallPayable);
};

const openSupplierModal = (supplier = null) => {
  // kept for backward compatibility (prompt-based)
  if (!supplier) {
    const companyName = prompt("Supplier / Company Name:");
    if (!companyName) return;
    const phone = prompt("Phone Number:");
    addDoc(collection(db, "suppliers"), {
      businessId,
      companyName,
      phone: phone || "",
      balance: 0,
      createdAt: serverTimestamp(),
    }).then(() => showToast("Supplier saved!", "success"));
  } else {
    const companyName =
      prompt("Supplier / Company Name:", supplier.companyName) ||
      supplier.companyName;
    const phone =
      prompt("Phone Number:", supplier.phone || "") || supplier.phone || "";
    updateDoc(doc(db, "suppliers", supplier.id), {
      companyName,
      phone,
      updatedAt: serverTimestamp(),
    }).then(() => showToast("Supplier updated!", "success"));
  }
};

// New: Supplier Form Modal
const openSupplierFormModal = async (supplier = null) => {
  const modalContainer = document.getElementById("modal-container");
  const modalContent = document.getElementById("modal-content");
  if (!modalContainer || !modalContent) return;

  modalContent.innerHTML = `
    <div class="modal-header">
      <h3>${supplier ? "Edit Supplier" : "Add Supplier"}</h3>
      <button class="icon-btn" onclick="window.closeModal()"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="supplier-form">
      <div class="modal-body">
        <div class="form-group">
          <label>Company Name *</label>
          <input type="text" id="sup-company" value="${supplier ? supplier.companyName : ""}" required>
        </div>
        <div class="form-group">
          <label>Contact Person</label>
          <input type="text" id="sup-contact" value="${supplier ? supplier.contactName || "" : ""}">
        </div>
        <div class="form-group">
          <label>Phone</label>
          <input type="text" id="sup-phone" value="${supplier ? supplier.phone || "" : ""}">
        </div>
        <div class="form-group">
          <label>Initial Payable Balance (Optional)</label>
          <input type="number" id="sup-balance" value="${supplier ? supplier.balance || 0 : 0}" step="0.01">
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Supplier</button>
      </div>
    </form>
  `;

  modalContainer.classList.remove("hidden");

  document.getElementById("supplier-form").onsubmit = async (e) => {
    e.preventDefault();
    toggleLoader(
      true,
      supplier ? "Updating supplier..." : "Saving supplier...",
    );
    try {
      const data = {
        businessId,
        companyName: document.getElementById("sup-company").value,
        contactName: document.getElementById("sup-contact").value || "",
        phone: document.getElementById("sup-phone").value || "",
        balance: parseFloat(document.getElementById("sup-balance").value) || 0,
        updatedAt: serverTimestamp(),
      };
      if (supplier) {
        await updateDoc(doc(db, "suppliers", supplier.id), data);
        showToast("Supplier updated!", "success");
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, "suppliers"), data);
        showToast("Supplier added!", "success");
      }
      window.closeModal();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      toggleLoader(false);
    }
  };
};

window.editSupplierModal = (id) => {
  const s = state.suppliers.find((x) => x.id === id);
  if (s) openSupplierFormModal(s);
};

window.deleteSupplier = async (id) => {
  if (confirm("Delete supplier?")) {
    await deleteDoc(doc(db, "suppliers", id));
    showToast("Supplier deleted.", "info");
  }
};

// Expense form modal
const openExpenseFormModal = (expense = null) => {
  const modalContainer = document.getElementById("modal-container");
  const modalContent = document.getElementById("modal-content");
  if (!modalContainer || !modalContent) return;

  modalContent.innerHTML = `
    <div class="modal-header">
      <h3>${expense ? "Edit Expense" : "Add Expense"}</h3>
      <button class="icon-btn" onclick="window.closeModal()"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="expense-form">
      <div class="modal-body">
        <div class="form-group">
          <label>Title *</label>
          <input type="text" id="expense-title" value="${expense ? expense.title || "" : ""}" required>
        </div>
        <div class="form-group">
          <label>Category</label>
          <select id="expense-category">
            <option value="General">General</option>
            <option value="Utilities">Utilities</option>
            <option value="Rent">Rent</option>
            <option value="Salary">Salary</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label>Amount (Rs.) *</label>
          <input type="number" id="expense-amount" value="${expense ? expense.amount || 0 : ""}" required step="0.01">
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Expense</button>
      </div>
    </form>
  `;

  if (expense && expense.category) {
    setTimeout(() => {
      const sel = document.getElementById("expense-category");
      if (sel) sel.value = expense.category;
    }, 0);
  }

  modalContainer.classList.remove("hidden");

  document.getElementById("expense-form").onsubmit = async (e) => {
    e.preventDefault();
    toggleLoader(true, expense ? "Updating expense..." : "Saving expense...");
    try {
      const title = document.getElementById("expense-title").value.trim();
      const category = document.getElementById("expense-category").value;
      const amount =
        parseFloat(document.getElementById("expense-amount").value) || 0;
      if (!title || isNaN(amount) || amount <= 0) {
        showToast("Please provide valid title and amount", "error");
        toggleLoader(false);
        return;
      }

      const data = {
        businessId,
        title,
        category,
        amount,
        updatedAt: serverTimestamp(),
      };
      if (expense) {
        await updateDoc(doc(db, "expenses", expense.id), data);
        showToast("Expense updated!", "success");
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, "expenses"), data);
        showToast("Expense recorded!", "success");
      }
      window.closeModal();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      toggleLoader(false);
    }
  };
};

// keep old alias for compatibility
const openExpenseModal = (expense = null) => openExpenseFormModal(expense);

const openPurchaseModal = (purchase = null) => {
  // keep for backward compatibility
  if (!purchase) {
    if (state.suppliers.length === 0) {
      showToast("Please add a supplier first!", "error");
      return;
    }
    const suppName = state.suppliers[0].companyName;
    const amount = parseFloat(
      prompt(`Enter purchase invoice total for supplier [${suppName}]:`),
    );
    if (isNaN(amount) || amount <= 0) return;

    addDoc(collection(db, "purchases"), {
      businessId,
      invoiceNumber: "PUR-" + Math.floor(1000 + Math.random() * 9000),
      supplierName: suppName,
      totalAmount: amount,
      paidAmount: amount,
      balanceDue: 0,
      createdAt: serverTimestamp(),
    }).then(() => showToast("Purchase stock invoice created!", "success"));
  } else {
    const paid = parseFloat(
      prompt("Update paid amount:", purchase.paidAmount || 0),
    );
    if (isNaN(paid)) return;
    const newBalance = Math.max(0, (purchase.totalAmount || 0) - paid);
    updateDoc(doc(db, "purchases", purchase.id), {
      paidAmount: paid,
      balanceDue: newBalance,
      updatedAt: serverTimestamp(),
    }).then(() => showToast("Purchase updated!", "success"));
  }
};

// New: Purchase Form Modal
const openPurchaseFormModal = (purchase = null) => {
  const modalContainer = document.getElementById("modal-container");
  const modalContent = document.getElementById("modal-content");
  if (!modalContainer || !modalContent) return;

  // Build supplier options
  const supplierOptions = (state.suppliers || [])
    .map(
      (s) =>
        `<option value="${s.id}" ${purchase && purchase.supplierId === s.id ? "selected" : ""}>${s.companyName}</option>`,
    )
    .join("");

  modalContent.innerHTML = `
    <div class="modal-header">
      <h3>${purchase ? "Edit Purchase" : "Record New Purchase"}</h3>
      <button class="icon-btn" onclick="window.closeModal()"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="purchase-form">
      <div class="modal-body">
        <div class="form-group">
          <label>Supplier *</label>
          <select id="purchase-supplier" required>
            <option value="">Select Supplier</option>
            ${supplierOptions}
          </select>
        </div>
        <div class="form-group">
          <label>Invoice Number</label>
          <input type="text" id="purchase-inv" value="${purchase ? purchase.invoiceNumber : "PUR-" + Math.floor(1000 + Math.random() * 9000)}">
        </div>
        <div class="form-group">
          <label>Total Amount (Rs.) *</label>
          <input type="number" id="purchase-total" value="${purchase ? purchase.totalAmount || 0 : ""}" required step="0.01">
        </div>
        <div class="form-group">
          <label>Paid Amount (Rs.)</label>
          <input type="number" id="purchase-paid" value="${purchase ? purchase.paidAmount || 0 : ""}" step="0.01">
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Purchase</button>
      </div>
    </form>
  `;

  modalContainer.classList.remove("hidden");

  document.getElementById("purchase-form").onsubmit = async (e) => {
    e.preventDefault();
    toggleLoader(
      true,
      purchase ? "Updating purchase..." : "Saving purchase...",
    );
    try {
      const supplierId = document.getElementById("purchase-supplier").value;
      if (!supplierId) {
        showToast("Please select supplier", "error");
        toggleLoader(false);
        return;
      }
      const supplier = state.suppliers.find((s) => s.id === supplierId) || {};
      const invoiceNumber =
        document.getElementById("purchase-inv").value ||
        "PUR-" + Math.floor(1000 + Math.random() * 9000);
      const totalAmount =
        parseFloat(document.getElementById("purchase-total").value) || 0;
      const paidAmount =
        parseFloat(document.getElementById("purchase-paid").value) || 0;
      const balanceDue = Math.max(0, totalAmount - paidAmount);

      const data = {
        businessId,
        invoiceNumber,
        supplierId,
        supplierName: supplier.companyName || "",
        totalAmount,
        paidAmount,
        balanceDue,
        updatedAt: serverTimestamp(),
      };

      if (purchase) {
        await updateDoc(doc(db, "purchases", purchase.id), data);
        showToast("Purchase updated!", "success");
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, "purchases"), data);
        showToast("Purchase created!", "success");
      }

      window.closeModal();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      toggleLoader(false);
    }
  };
};

window.editPurchaseModal = (id) => {
  const p = state.purchases.find((x) => x.id === id);
  if (p) openPurchaseFormModal(p);
};

window.deletePurchase = async (id) => {
  if (confirm("Delete purchase invoice?")) {
    await deleteDoc(doc(db, "purchases", id));
    showToast("Purchase removed.", "info");
  }
};

// ==========================================================================
// 10. REPORTS & UTILITIES
// ==========================================================================
const generateReport = () => {
  const start = document.getElementById("report-start-date")?.value;
  const end = document.getElementById("report-end-date")?.value;

  let filteredSales = state.sales;
  if (start && end) {
    filteredSales = state.sales.filter((s) => {
      const d = s.createdAt?.toDate
        ? s.createdAt.toDate().toISOString().split("T")[0]
        : "";
      return d >= start && d <= end;
    });
  }

  const totalSales = filteredSales.reduce(
    (acc, curr) => acc + (curr.grandTotal || 0),
    0,
  );
  const totalProfit = filteredSales.reduce(
    (acc, curr) => acc + (curr.totalProfit || 0),
    0,
  );
  const totalExpenses = state.expenses.reduce(
    (acc, curr) => acc + (curr.amount || 0),
    0,
  );

  document.getElementById("rep-total-sales").innerText =
    formatCurrency(totalSales);
  document.getElementById("rep-total-cogs").innerText = formatCurrency(
    totalSales - totalProfit,
  );
  document.getElementById("rep-total-expenses").innerText =
    formatCurrency(totalExpenses);
  document.getElementById("rep-net-profit").innerText = formatCurrency(
    totalProfit - totalExpenses,
  );
};

const seedDemoData = async () => {
  if (
    !confirm(
      "This will add demo items (Sugar, Atta, Rice, Milk, Oil, Tea) to your store inventory. Proceed?",
    )
  )
    return;
  toggleLoader(true, "Seeding Pakistani Retail Items...");

  const items = [
    {
      name: "Sugar (Cheeni)",
      category: "Grocery",
      unit: "KG",
      currentStock: 50,
      purchasePrice: 130,
      sellingPrice: 150,
    },
    {
      name: "Wheat Flour (Chakki Atta)",
      category: "Grocery",
      unit: "KG",
      currentStock: 100,
      purchasePrice: 110,
      sellingPrice: 125,
    },
    {
      name: "Basmati Rice (Chawal)",
      category: "Grocery",
      unit: "KG",
      currentStock: 40,
      purchasePrice: 280,
      sellingPrice: 320,
    },
    {
      name: "Olper's Milk 1L",
      category: "Dairy",
      unit: "Pack",
      currentStock: 24,
      purchasePrice: 260,
      sellingPrice: 290,
    },
    {
      name: "Dalda Cooking Oil 1L",
      category: "Grocery",
      unit: "Pack",
      currentStock: 15,
      purchasePrice: 500,
      sellingPrice: 540,
    },
    {
      name: "Tapal Danedar Tea 950g",
      category: "Snacks",
      unit: "Pack",
      currentStock: 10,
      purchasePrice: 1400,
      sellingPrice: 1550,
    },
  ];

  try {
    for (const item of items) {
      await addDoc(collection(db, "products"), {
        ...item,
        businessId,
        barcode: String(
          Math.floor(100000000000 + Math.random() * 900000000000),
        ),
        minStockAlert: 5,
        createdAt: serverTimestamp(),
      });
    }
    showToast("Pakistani demo inventory loaded!", "success");
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    toggleLoader(false);
  }
};

const exportProductsCSV = () => {
  let csv = "Barcode,Product Name,Category,Unit,Cost,Price,Stock\n";
  state.products.forEach((p) => {
    csv += `"${p.barcode || ""}","${p.name}","${p.category}","${p.unit}",${p.purchasePrice},${p.sellingPrice},${p.currentStock}\n`;
  });
  downloadCSV(csv, "products_export.csv");
};

const exportSalesCSV = () => {
  let csv = "Invoice Number,Customer,Grand Total,Payment Method,Date\n";
  state.sales.forEach((s) => {
    const d = s.createdAt?.toDate
      ? s.createdAt.toDate().toLocaleDateString()
      : "";
    csv += `"${s.invoiceNumber}","${s.customerName}",${s.grandTotal},"${s.paymentMethod}","${d}"\n`;
  });
  downloadCSV(csv, "sales_export.csv");
};

const downloadCSV = (content, filename) => {
  const blob = new Blob([content], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.setAttribute("href", url);
  a.setAttribute("download", filename);
  a.click();
};
