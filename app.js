import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, setDoc, getDoc, collection, addDoc, updateDoc, 
  deleteDoc, onSnapshot, query, where, runTransaction, serverTimestamp
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
  measurementId: "G-QH75X9ZVCL"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================================================
// 2. GLOBAL STATE MANAGEMENT
// ==========================================================================
let currentUser = null;
let currentBusiness = null;
let businessId = null;

let state = {
  products: [],
  categories: ["Grocery", "Beverages", "Dairy", "Bakery", "Snacks", "Household"],
  customers: [],
  suppliers: [],
  sales: [],
  purchases: [],
  expenses: [],
  cart: [],
  selectedCategory: "ALL",
  posSearchQuery: ""
};

let salesChartInstance = null;
let topProductsChartInstance = null;

// ==========================================================================
// 3. UTILITY FUNCTIONS & MODAL HANDLERS
// ==========================================================================
const formatCurrency = (amount) => {
  return "Rs. " + Number(amount || 0).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
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

const triggerPrintInvoice = (saleData) => {
  const printWindow = window.open("", "_blank", "width=400,height=600");
  if (!printWindow) return;

  const itemsHtml = saleData.items.map(item => `
    <tr>
      <td>${item.name} (${item.qty} ${item.unit})</td>
      <td style="text-align: right;">${formatCurrency(item.lineTotal)}</td>
    </tr>
  `).join("");

  printWindow.document.write(`
    <html>
      <head>
        <title>Receipt - ${saleData.invoiceNumber}</title>
        <style>
          body { font-family: monospace; font-size: 12px; padding: 10px; width: 280px; }
          h2, p { text-align: center; margin: 2px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          td { padding: 4px 0; }
          .border-top { border-top: 1px dashed #000; }
          .total-row { font-weight: bold; }
        </style>
      </head>
      <body>
        <h2>${currentBusiness?.shopName || "PakPOS Store"}</h2>
        <p>${currentBusiness?.address || ""}</p>
        <p>Phone: ${currentBusiness?.phone || "N/A"}</p>
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
          ${saleData.discount > 0 ? `<tr><td>Discount:</td><td style="text-align: right;">-${formatCurrency(saleData.discount)}</td></tr>` : ''}
          ${saleData.taxAmount > 0 ? `<tr><td>Tax:</td><td style="text-align: right;">${formatCurrency(saleData.taxAmount)}</td></tr>` : ''}
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
        <p style="margin-top: 15px;">Thank you for shopping!</p>
        <script>
          window.onload = () => { window.print(); window.close(); };
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
        createdAt: serverTimestamp()
      });

      await setDoc(userRef, {
        uid: currentUser.uid,
        name: currentUser.displayName || "Admin User",
        email: currentUser.email,
        businessId: newBizRef.id,
        role: "Admin"
      });
      
      userDoc = await getDoc(userRef);
    }

    const userData = userDoc.data() || {};
    businessId = userData.businessId || "default_biz";
    
    const bizDoc = await getDoc(doc(db, "businesses", businessId));
    if (bizDoc.exists()) {
      currentBusiness = bizDoc.data();
    } else {
      currentBusiness = { shopName: "My PakPOS Store", ownerName: "Admin", phone: "", address: "", tax: 0 };
    }

    const shopElem = document.getElementById("sidebar-shop-name");
    const roleElem = document.getElementById("sidebar-user-role");
    
    if (shopElem) shopElem.innerText = currentBusiness.shopName || "My Store";
    if (roleElem) roleElem.innerText = userData.role || "Admin";

    // Fill Settings UI
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
      showToast("Firebase Rule Error: Update Firestore Rules in console.", "error");
    } else {
      showToast("Error loading shop profile: " + err.message, "error");
    }
  }
};

const navigateTo = (pageId) => {
  const pages = document.querySelectorAll(".page-view");
  const navLinks = document.querySelectorAll(".sidebar-nav a");
  const title = document.getElementById("page-title");

  pages.forEach(p => p.classList.remove("active"));
  navLinks.forEach(l => l.classList.remove("active"));

  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) targetPage.classList.add("active");

  const activeLink = document.querySelector(`.sidebar-nav a[data-page="${pageId}"]`);
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
      settings: "Store Settings"
    };
    title.innerText = titles[pageId] || "Dashboard";
  }

  // Close Mobile Drawer
  document.getElementById("sidebar")?.classList.remove("open");
  document.getElementById("sidebar-overlay")?.classList.remove("open");
};

const initNavigation = () => {
  document.querySelectorAll(".sidebar-nav a").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const page = link.getAttribute("data-page");
      if (page) navigateTo(page);
    });
  });

  document.getElementById("quick-pos-btn")?.addEventListener("click", () => navigateTo("pos"));

  // Mobile Drawer
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

  // Dark Mode Switcher
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
  // Inventory Filtering
  const catFilter = document.getElementById("product-category-filter");
  const prodSearch = document.getElementById("product-search-input");
  if (catFilter) catFilter.addEventListener("change", renderProductsTable);
  if (prodSearch) prodSearch.addEventListener("input", renderProductsTable);

  // POS Filtering
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

  // POS Inputs
  document.getElementById("pos-discount-input")?.addEventListener("input", calculateCartTotals);
  document.getElementById("pos-tax-input")?.addEventListener("input", calculateCartTotals);
  document.getElementById("pos-paid-amount")?.addEventListener("input", calculateCartTotals);
  document.getElementById("pos-clear-cart")?.addEventListener("click", () => {
    state.cart = [];
    renderCart();
  });

  // Settings Save Form
  document.getElementById("settings-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    toggleLoader(true, "Saving Settings...");
    try {
      const shopName = document.getElementById("set-shop-name").value;
      const phone = document.getElementById("set-shop-phone").value;
      const address = document.getElementById("set-shop-address").value;
      const tax = parseFloat(document.getElementById("set-shop-tax").value) || 0;

      await updateDoc(doc(db, "businesses", businessId), {
        shopName, phone, address, tax
      });
      showToast("Settings updated successfully!", "success");
      loadUserProfileAndBusiness();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      toggleLoader(false);
    }
  });

  // Load Demo Data
  document.getElementById("load-demo-data-btn")?.addEventListener("click", seedDemoData);

  // CSV Export Buttons
  document.getElementById("export-products-csv")?.addEventListener("click", exportProductsCSV);
  document.getElementById("export-sales-csv")?.addEventListener("click", exportSalesCSV);

  // Expense Modal Button
  document.getElementById("add-expense-btn")?.addEventListener("click", openExpenseModal);

  // Purchase Modal Button
  document.getElementById("new-purchase-btn")?.addEventListener("click", openPurchaseModal);

  // Supplier Add Button
  document.getElementById("add-supplier-btn")?.addEventListener("click", openSupplierModal);

  // Add Customer From POS
  document.getElementById("pos-add-customer-btn")?.addEventListener("click", () => {
    document.getElementById("add-customer-btn")?.click();
  });

  // Report Generator
  document.getElementById("generate-report-btn")?.addEventListener("click", generateReport);
};

// Auth Form Handlers
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

document.getElementById("register-form")?.addEventListener("submit", async (e) => {
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
      createdAt: serverTimestamp()
    });

    await setDoc(doc(db, "users", uid), {
      uid,
      name,
      email,
      businessId: newBizRef.id,
      role: "Admin"
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

document.getElementById("logout-btn")?.addEventListener("click", () => signOut(auth));

// ==========================================================================
// 5. FIRESTORE REAL-TIME SUBSCRIPTIONS
// ==========================================================================
const setupRealtimeListeners = () => {
  if (!businessId) return;

  const handleErr = (err) => {
    if (err.code === "permission-denied") {
      showToast("Access Denied: Please check Firestore Rules in Firebase Console.", "error");
    }
  };

  const qProd = query(collection(db, "products"), where("businessId", "==", businessId));
  onSnapshot(qProd, (snapshot) => {
    state.products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderProductsTable();
    renderPosProducts();
    populateCategoryDropdowns();
    renderCategoryChips();
    updateDashboardMetrics();
  }, handleErr);

  const qCust = query(collection(db, "customers"), where("businessId", "==", businessId));
  onSnapshot(qCust, (snapshot) => {
    state.customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderCustomersTable();
    renderPosCustomerDropdown();
  }, handleErr);

  const qSupp = query(collection(db, "suppliers"), where("businessId", "==", businessId));
  onSnapshot(qSupp, (snapshot) => {
    state.suppliers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderSuppliersTable();
  }, handleErr);

  const qSales = query(collection(db, "sales"), where("businessId", "==", businessId));
  onSnapshot(qSales, (snapshot) => {
    state.sales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderSalesHistoryTable();
    updateDashboardMetrics();
    renderCharts();
  }, handleErr);

  const qPurch = query(collection(db, "purchases"), where("businessId", "==", businessId));
  onSnapshot(qPurch, (snapshot) => {
    state.purchases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderPurchasesTable();
    updateDashboardMetrics();
  }, handleErr);

  const qExp = query(collection(db, "expenses"), where("businessId", "==", businessId));
  onSnapshot(qExp, (snapshot) => {
    state.expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderExpensesTable();
  }, handleErr);
};

const populateCategoryDropdowns = () => {
  const invSelect = document.getElementById("product-category-filter");
  const posSelect = document.getElementById("pos-category-filter");
  
  const options = `<option value="ALL">All Categories</option>` + 
    state.categories.map(c => `<option value="${c}">${c}</option>`).join("");

  if (invSelect) invSelect.innerHTML = options;
  if (posSelect) posSelect.innerHTML = options;
};

const renderCategoryChips = () => {
  const container = document.getElementById("pos-category-chips");
  if (!container) return;
  
  const cats = ["ALL", ...state.categories];
  container.innerHTML = cats.map(c => `
    <span class="chip ${state.selectedCategory === c ? 'active' : ''}" onclick="window.selectCategoryChip('${c}')">${c}</span>
  `).join("");
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

  state.sales.forEach(s => {
    const tr = document.createElement("tr");
    const dateStr = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleString() : "N/A";
    tr.innerHTML = `
      <td><strong>${s.invoiceNumber}</strong></td>
      <td>${dateStr}</td>
      <td>${s.customerName || 'Walk-in'}</td>
      <td>${(s.items || []).length} items</td>
      <td><strong>${formatCurrency(s.grandTotal)}</strong></td>
      <td><span class="chip">${s.paymentMethod || 'Cash'}</span></td>
      <td><span class="chip bg-green" style="color:#fff;">Completed</span></td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick='window.reprintInvoice(${JSON.stringify(s)})'><i class="fa-solid fa-print"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
};

window.reprintInvoice = (saleObj) => {
  triggerPrintInvoice(saleObj);
};

const renderPurchasesTable = () => {
  const tbody = document.getElementById("purchases-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  state.purchases.forEach(p => {
    const tr = document.createElement("tr");
    const dateStr = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString() : "N/A";
    tr.innerHTML = `
      <td><strong>${p.invoiceNumber || 'PUR-001'}</strong></td>
      <td>${dateStr}</td>
      <td>${p.supplierName}</td>
      <td>${formatCurrency(p.totalAmount)}</td>
      <td>${formatCurrency(p.paidAmount)}</td>
      <td><strong class="text-red">${formatCurrency(p.balanceDue)}</strong></td>
      <td><span class="chip">Recorded</span></td>
    `;
    tbody.appendChild(tr);
  });
};

const renderExpensesTable = () => {
  const tbody = document.getElementById("expenses-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  state.expenses.forEach(e => {
    const tr = document.createElement("tr");
    const dateStr = e.createdAt?.toDate ? e.createdAt.toDate().toLocaleDateString() : "N/A";
    tr.innerHTML = `
      <td>${dateStr}</td>
      <td><strong>${e.title}</strong></td>
      <td><span class="chip">${e.category}</span></td>
      <td><strong class="text-red">${formatCurrency(e.amount)}</strong></td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="window.deleteExpense('${e.id}')"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
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
  const todayStr = new Date().toISOString().split('T')[0];
  
  let todaySalesTotal = 0;
  let todayProfitTotal = 0;
  let todayOrdersCount = 0;

  state.sales.forEach(sale => {
    const saleDate = sale.createdAt?.toDate ? sale.createdAt.toDate().toISOString().split('T')[0] : '';
    if (saleDate === todayStr) {
      todaySalesTotal += (sale.grandTotal || 0);
      todayProfitTotal += (sale.totalProfit || 0);
      todayOrdersCount++;
    }
  });

  let todayPurchasesTotal = 0;
  state.purchases.forEach(purch => {
    const purchDate = purch.createdAt?.toDate ? purch.createdAt.toDate().toISOString().split('T')[0] : '';
    if (purchDate === todayStr) todayPurchasesTotal += (purch.totalAmount || 0);
  });

  let lowStockCount = 0;
  let totalStockVal = 0;
  state.products.forEach(p => {
    if (p.currentStock <= (p.minStockAlert || 5)) lowStockCount++;
    totalStockVal += (p.currentStock * p.purchasePrice);
  });

  let totalReceivables = 0;
  state.customers.forEach(c => totalReceivables += (c.balance || 0));

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
  if (typeof Chart === 'undefined') return;

  const salesCanvas = document.getElementById("sales-chart");
  if (salesCanvas) {
    const ctxSales = salesCanvas.getContext("2d");
    const days = [];
    const salesData = [];
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      days.push(d.toLocaleDateString('en-PK', { weekday: 'short' }));
      
      const dayTotal = state.sales
        .filter(s => s.createdAt?.toDate && s.createdAt.toDate().toISOString().split('T')[0] === dateStr)
        .reduce((acc, curr) => acc + curr.grandTotal, 0);
      salesData.push(dayTotal);
    }

    if (salesChartInstance) salesChartInstance.destroy();
    salesChartInstance = new Chart(ctxSales, {
      type: 'line',
      data: {
        labels: days,
        datasets: [{
          label: 'Daily Sales (PKR)',
          data: salesData,
          borderColor: '#0f766e',
          backgroundColor: 'rgba(15, 118, 110, 0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  const topCanvas = document.getElementById("top-products-chart");
  if (topCanvas) {
    const ctxTop = topCanvas.getContext("2d");
    const productSalesMap = {};
    
    state.sales.forEach(s => {
      (s.items || []).forEach(item => {
        productSalesMap[item.name] = (productSalesMap[item.name] || 0) + item.lineTotal;
      });
    });

    const sortedProducts = Object.entries(productSalesMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (topProductsChartInstance) topProductsChartInstance.destroy();
    topProductsChartInstance = new Chart(ctxTop, {
      type: 'bar',
      data: {
        labels: sortedProducts.map(p => p[0]),
        datasets: [{
          label: 'Revenue (PKR)',
          data: sortedProducts.map(p => p[1]),
          backgroundColor: '#16a34a'
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
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

  const filtered = state.products.filter(p => {
    const matchesCat = state.selectedCategory === "ALL" || p.category === state.selectedCategory;
    const q = state.posSearchQuery.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(q) || 
                          (p.barcode && p.barcode.includes(q)) || 
                          (p.sku && p.sku.toLowerCase().includes(q));
    return matchesCat && matchesSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;"><p>No matching products found.</p></div>`;
    return;
  }

  filtered.forEach(p => {
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
  const existingIndex = state.cart.findIndex(item => item.id === product.id);
  
  if (existingIndex > -1) {
    state.cart[existingIndex].qty += (product.unit === "Gram" ? 250 : 1);
  } else {
    const initQty = product.unit === "Gram" ? 250 : 1;
    state.cart.push({
      id: product.id,
      name: product.name,
      unit: product.unit,
      purchasePrice: product.purchasePrice,
      sellingPrice: product.sellingPrice,
      qty: initQty
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
        <input type="number" step="${item.unit === 'KG' || item.unit === 'Gram' ? '0.05' : '1'}" 
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
  state.cart.forEach(item => {
    const normalizedQty = normalizeToStandardUnit(item.qty, item.unit);
    subtotal += normalizedQty * item.sellingPrice;
  });

  const discount = parseFloat(document.getElementById("pos-discount-input")?.value) || 0;
  const taxPct = parseFloat(document.getElementById("pos-tax-input")?.value) || 0;
  
  const taxAmount = (subtotal - discount) * (taxPct / 100);
  const grandTotal = Math.max(0, subtotal - discount + taxAmount);
  
  const paidAmount = parseFloat(document.getElementById("pos-paid-amount")?.value) || 0;
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
document.getElementById("pos-checkout-btn")?.addEventListener("click", async () => {
  if (state.cart.length === 0) {
    showToast("Cart is empty!", "error");
    return;
  }

  toggleLoader(true, "Completing Sale & Updating Stock...");
  
  try {
    let subtotal = 0;
    let totalCost = 0;
    
    const saleItems = state.cart.map(item => {
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
        lineTotal
      };
    });

    const discount = parseFloat(document.getElementById("pos-discount-input")?.value) || 0;
    const taxPct = parseFloat(document.getElementById("pos-tax-input")?.value) || 0;
    const taxAmount = (subtotal - discount) * (taxPct / 100);
    const grandTotal = Math.max(0, subtotal - discount + taxAmount);
    const paidAmount = parseFloat(document.getElementById("pos-paid-amount")?.value) || 0;
    const balanceDue = grandTotal > paidAmount ? grandTotal - paidAmount : 0;
    const totalProfit = grandTotal - totalCost;

    const paymentMethod = document.getElementById("pos-payment-method")?.value || "Cash";
    const customerId = document.getElementById("pos-customer-select")?.value || "WALKIN";
    const customerObj = state.customers.find(c => c.id === customerId);
    const customerName = customerObj ? customerObj.name : "Walk-in Customer";

    let generatedInvNum = "";

    await runTransaction(db, async (transaction) => {
      for (const item of saleItems) {
        const prodRef = doc(db, "products", item.productId);
        const prodDoc = await transaction.get(prodRef);
        if (!prodDoc.exists()) throw new Error(`Product ${item.name} does not exist!`);
        
        const currentStock = prodDoc.data().currentStock;
        if (currentStock < item.normalizedQty) {
          throw new Error(`Insufficient stock for ${item.name}! Stock left: ${currentStock}`);
        }
      }

      for (const item of saleItems) {
        const prodRef = doc(db, "products", item.productId);
        const prodDoc = await transaction.get(prodRef);
        const newStock = prodDoc.data().currentStock - item.normalizedQty;
        transaction.update(prodRef, { currentStock: newStock, updatedAt: serverTimestamp() });
      }

      generatedInvNum = "INV-" + Math.floor(100000 + Math.random() * 900000);
      const newSaleRef = doc(collection(db, "sales"));
      
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
        createdAt: serverTimestamp()
      });

      if (balanceDue > 0 && customerId !== "WALKIN") {
        const custRef = doc(db, "customers", customerId);
        const custDoc = await transaction.get(custRef);
        const newBal = (custDoc.data().balance || 0) + balanceDue;
        transaction.update(custRef, { balance: newBal });
      }
    });

    showToast("Sale completed successfully!", "success");
    
    triggerPrintInvoice({
      invoiceNumber: generatedInvNum,
      customerName,
      items: saleItems,
      subtotal,
      discount,
      taxAmount,
      grandTotal,
      paidAmount,
      balanceDue,
      paymentMethod
    });

    state.cart = [];
    if (document.getElementById("pos-discount-input")) document.getElementById("pos-discount-input").value = 0;
    if (document.getElementById("pos-paid-amount")) document.getElementById("pos-paid-amount").value = "";
    renderCart();

  } catch (err) {
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

  const filter = document.getElementById("product-category-filter")?.value || "ALL";
  const q = document.getElementById("product-search-input")?.value.toLowerCase() || "";

  const filtered = state.products.filter(p => {
    const matchCat = filter === "ALL" || p.category === filter;
    const matchQ = p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q));
    return matchCat && matchQ;
  });

  filtered.forEach(p => {
    const tr = document.createElement("tr");
    const isLow = p.currentStock <= (p.minStockAlert || 5);
    
    tr.innerHTML = `
      <td>${p.barcode || p.sku || 'N/A'}</td>
      <td><strong>${p.name}</strong></td>
      <td><span class="chip">${p.category}</span></td>
      <td>${p.unit}</td>
      <td>${formatCurrency(p.purchasePrice)}</td>
      <td>${formatCurrency(p.sellingPrice)}</td>
      <td><strong>${p.currentStock}</strong> ${p.unit}</td>
      <td><span class="chip ${isLow ? 'bg-red' : 'bg-green'}" style="color:#fff;">${isLow ? 'Low Stock' : 'In Stock'}</span></td>
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
      <h3>${product ? 'Edit Product' : 'Add New Product'}</h3>
      <button class="icon-btn" onclick="window.closeModal()"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <form id="product-form">
      <div class="modal-body">
        <div class="form-group">
          <label>Product Name *</label>
          <input type="text" id="prod-name" value="${product ? product.name : ''}" required>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Barcode / SKU</label>
            <input type="text" id="prod-barcode" value="${product ? (product.barcode || '') : ''}">
          </div>
          <div class="form-group">
            <label>Category</label>
            <select id="prod-category">
              ${state.categories.map(c => `<option value="${c}" ${product && product.category === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Unit Type</label>
            <select id="prod-unit">
              <option value="Piece" ${product && product.unit === 'Piece' ? 'selected' : ''}>Piece</option>
              <option value="KG" ${product && product.unit === 'KG' ? 'selected' : ''}>KG (Kilogram)</option>
              <option value="Gram" ${product && product.unit === 'Gram' ? 'selected' : ''}>Gram</option>
              <option value="Liter" ${product && product.unit === 'Liter' ? 'selected' : ''}>Liter</option>
              <option value="Box" ${product && product.unit === 'Box' ? 'selected' : ''}>Box</option>
              <option value="Pack" ${product && product.unit === 'Pack' ? 'selected' : ''}>Pack</option>
            </select>
          </div>
          <div class="form-group">
            <label>Current Stock</label>
            <input type="number" step="0.01" id="prod-stock" value="${product ? product.currentStock : '0'}" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Purchase Price (Cost)</label>
            <input type="number" step="0.01" id="prod-cost" value="${product ? product.purchasePrice : '0'}" required>
          </div>
          <div class="form-group">
            <label>Selling Price</label>
            <input type="number" step="0.01" id="prod-price" value="${product ? product.sellingPrice : '0'}" required>
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
      currentStock: parseFloat(document.getElementById("prod-stock").value) || 0,
      purchasePrice: parseFloat(document.getElementById("prod-cost").value) || 0,
      sellingPrice: parseFloat(document.getElementById("prod-price").value) || 0,
      minStockAlert: 5,
      updatedAt: serverTimestamp()
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
  const p = state.products.find(item => item.id === id);
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

  state.customers.forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${c.name}</strong></td>
      <td>${c.phone || 'N/A'}</td>
      <td>${c.cnic || 'N/A'}</td>
      <td><strong class="${c.balance > 0 ? 'text-red' : 'text-green'}">${formatCurrency(c.balance)}</strong></td>
      <td>
        <button class="btn btn-sm btn-accent" onclick="window.receiveCustomerPayment('${c.id}')"><i class="fa-solid fa-hand-holding-dollar"></i> Clear Udhaar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
};

const renderPosCustomerDropdown = () => {
  const select = document.getElementById("pos-customer-select");
  if (!select) return;
  select.innerHTML = `<option value="WALKIN">Walk-in Customer (Grahak)</option>`;
  state.customers.forEach(c => {
    select.innerHTML += `<option value="${c.id}">${c.name} (${c.phone || 'No Phone'}) - Bal: ${formatCurrency(c.balance)}</option>`;
  });
};

document.getElementById("add-customer-btn")?.addEventListener("click", () => {
  const name = prompt("Enter Customer Name:");
  if (!name) return;
  const phone = prompt("Enter Customer Phone (+92...):");
  
  addDoc(collection(db, "customers"), {
    businessId,
    name,
    phone: phone || "",
    balance: 0,
    createdAt: serverTimestamp()
  }).then(() => showToast("Customer added!", "success"));
});

window.receiveCustomerPayment = async (id) => {
  const cust = state.customers.find(c => c.id === id);
  if (!cust) return;

  const amountStr = prompt(`Current Udhaar for ${cust.name}: ${formatCurrency(cust.balance)}\nEnter received payment amount (Rs.):`);
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

  state.suppliers.forEach(s => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${s.companyName}</strong></td>
      <td>${s.contactName || 'N/A'}</td>
      <td>${s.phone || 'N/A'}</td>
      <td>${formatCurrency(s.balance)}</td>
    `;
    tbody.appendChild(tr);
  });
};

const openSupplierModal = () => {
  const companyName = prompt("Supplier / Company Name:");
  if (!companyName) return;
  const phone = prompt("Phone Number:");

  addDoc(collection(db, "suppliers"), {
    businessId,
    companyName,
    phone: phone || "",
    balance: 0,
    createdAt: serverTimestamp()
  }).then(() => showToast("Supplier saved!", "success"));
};

const openExpenseModal = () => {
  const title = prompt("Expense Reason (e.g. Electricity Bill, Shop Rent):");
  if (!title) return;
  const amount = parseFloat(prompt("Expense Amount (Rs.):"));
  if (isNaN(amount) || amount <= 0) return;

  addDoc(collection(db, "expenses"), {
    businessId,
    title,
    category: "General",
    amount,
    createdAt: serverTimestamp()
  }).then(() => showToast("Expense recorded!", "success"));
};

const openPurchaseModal = () => {
  if (state.suppliers.length === 0) {
    showToast("Please add a supplier first!", "error");
    return;
  }
  const suppName = state.suppliers[0].companyName;
  const amount = parseFloat(prompt(`Enter purchase invoice total for supplier [${suppName}]:`));
  if (isNaN(amount) || amount <= 0) return;

  addDoc(collection(db, "purchases"), {
    businessId,
    invoiceNumber: "PUR-" + Math.floor(1000 + Math.random() * 9000),
    supplierName: suppName,
    totalAmount: amount,
    paidAmount: amount,
    balanceDue: 0,
    createdAt: serverTimestamp()
  }).then(() => showToast("Purchase stock invoice created!", "success"));
};

// ==========================================================================
// 10. REPORTS & UTILITIES
// ==========================================================================
const generateReport = () => {
  const start = document.getElementById("report-start-date")?.value;
  const end = document.getElementById("report-end-date")?.value;

  let filteredSales = state.sales;
  if (start && end) {
    filteredSales = state.sales.filter(s => {
      const d = s.createdAt?.toDate ? s.createdAt.toDate().toISOString().split("T")[0] : "";
      return d >= start && d <= end;
    });
  }

  const totalSales = filteredSales.reduce((acc, curr) => acc + (curr.grandTotal || 0), 0);
  const totalProfit = filteredSales.reduce((acc, curr) => acc + (curr.totalProfit || 0), 0);
  const totalExpenses = state.expenses.reduce((acc, curr) => acc + (curr.amount || 0), 0);

  document.getElementById("rep-total-sales").innerText = formatCurrency(totalSales);
  document.getElementById("rep-total-cogs").innerText = formatCurrency(totalSales - totalProfit);
  document.getElementById("rep-total-expenses").innerText = formatCurrency(totalExpenses);
  document.getElementById("rep-net-profit").innerText = formatCurrency(totalProfit - totalExpenses);
};

const seedDemoData = async () => {
  if (!confirm("This will add demo items (Sugar, Atta, Rice, Milk, Oil, Tea) to your store inventory. Proceed?")) return;
  toggleLoader(true, "Seeding Pakistani Retail Items...");

  const items = [
    { name: "Sugar (Cheeni)", category: "Grocery", unit: "KG", currentStock: 50, purchasePrice: 130, sellingPrice: 150 },
    { name: "Wheat Flour (Chakki Atta)", category: "Grocery", unit: "KG", currentStock: 100, purchasePrice: 110, sellingPrice: 125 },
    { name: "Basmati Rice (Chawal)", category: "Grocery", unit: "KG", currentStock: 40, purchasePrice: 280, sellingPrice: 320 },
    { name: "Olper's Milk 1L", category: "Dairy", unit: "Pack", currentStock: 24, purchasePrice: 260, sellingPrice: 290 },
    { name: "Dalda Cooking Oil 1L", category: "Grocery", unit: "Pack", currentStock: 15, purchasePrice: 500, sellingPrice: 540 },
    { name: "Tapal Danedar Tea 950g", category: "Snacks", unit: "Pack", currentStock: 10, purchasePrice: 1400, sellingPrice: 1550 }
  ];

  try {
    for (const item of items) {
      await addDoc(collection(db, "products"), {
        ...item,
        businessId,
        barcode: String(Math.floor(100000000000 + Math.random() * 900000000000)),
        minStockAlert: 5,
        createdAt: serverTimestamp()
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
  state.products.forEach(p => {
    csv += `"${p.barcode||''}","${p.name}","${p.category}","${p.unit}",${p.purchasePrice},${p.sellingPrice},${p.currentStock}\n`;
  });
  downloadCSV(csv, "products_export.csv");
};

const exportSalesCSV = () => {
  let csv = "Invoice Number,Customer,Grand Total,Payment Method,Date\n";
  state.sales.forEach(s => {
    const d = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString() : "";
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