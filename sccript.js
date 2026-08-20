// Localized Product Data for Pakistani Market
const products = [
    { id: 1, name: "Chai (Doodh Patti)", price: 120, category: "beverages" },
    { id: 2, name: "Gourmet Cola 1.5L", price: 180, category: "beverages" },
    { id: 3, name: "Nestle Milkpak 1L", price: 290, category: "grocery" },
    { id: 4, name: "Chicken Patties", price: 100, category: "bakery" },
    { id: 5, name: "Samosa (Large)", price: 50, category: "snacks" },
    { id: 6, name: "Lays Masala Big", price: 100, category: "snacks" },
    { id: 7, name: "Plain Naan / Roti", price: 30, category: "bakery" },
    { id: 8, name: "Mineral Water 1.5L", price: 90, category: "beverages" },
    { id: 9, name: "Tapal Danedar 400g", price: 650, category: "grocery" },
    { id: 10, name: "National Salt 800g", price: 60, category: "grocery" }
];

let cart = [];
const gstRate = 0.18; // 18% GST

// Initialize Product Display
document.addEventListener("DOMContentLoaded", () => {
    renderProducts(products);

    // Live Search Filter
    document.getElementById("searchInput").addEventListener("input", (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = products.filter(p => p.name.toLowerCase().includes(searchTerm));
        renderProducts(filtered);
    });
});

// Render Product Grid
function renderProducts(items) {
    const grid = document.getElementById("productGrid");
    grid.innerHTML = "";

    items.forEach(product => {
        const card = document.createElement("div");
        card.className = "product-card";
        card.onclick = () => addToCart(product.id);
        card.innerHTML = `
            <div class="product-name">${product.name}</div>
            <div class="product-price">Rs. ${product.price}</div>
        `;
        grid.appendChild(card);
    });
}

// Filter Items by Category
function filterCategory(category, button) {
    document.querySelectorAll(".pill").forEach(btn => btn.classList.remove("active"));
    button.classList.add("active");

    if (category === "all") {
        renderProducts(products);
    } else {
        const filtered = products.filter(p => p.category === category);
        renderProducts(filtered);
    }
}

// Cart Functionality
function addToCart(productId) {
    const existing = cart.find(item => item.id === productId);
    if (existing) {
        existing.qty++;
    } else {
        const product = products.find(p => p.id === productId);
        cart.push({ ...product, qty: 1 });
    }
    updateCartUI();
}

function changeQty(productId, delta) {
    const item = cart.find(i => i.id === productId);
    if (item) {
        item.qty += delta;
        if (item.qty <= 0) {
            cart = cart.filter(i => i.id !== productId);
        }
    }
    updateCartUI();
}

function clearCart() {
    cart = [];
    updateCartUI();
}

// Update Cart DOM and Computations
function updateCartUI() {
    const container = document.getElementById("cartItems");
    container.innerHTML = "";

    if (cart.length === 0) {
        container.innerHTML = `<div class="empty-cart-msg">No items added to bill</div>`;
        document.getElementById("subtotalText").innerText = "Rs. 0";
        document.getElementById("taxText").innerText = "Rs. 0";
        document.getElementById("totalText").innerText = "Rs. 0";
        return;
    }

    let subtotal = 0;

    cart.forEach(item => {
        const itemTotal = item.price * item.qty;
        subtotal += itemTotal;

        const row = document.createElement("div");
        row.className = "cart-item";
        row.innerHTML = `
            <div class="item-info">
                <span class="item-name">${item.name}</span>
                <span class="item-unit-price">Rs. ${item.price} each</span>
            </div>
            <div class="item-qty">
                <button class="qty-btn" onclick="changeQty(${item.id}, -1)">-</button>
                <span>${item.qty}</span>
                <button class="qty-btn" onclick="changeQty(${item.id}, 1)">+</button>
            </div>
            <span class="item-total">Rs. ${itemTotal}</span>
        `;
        container.appendChild(row);
    });

    const tax = Math.round(subtotal * gstRate);
    const total = subtotal + tax;

    document.getElementById("subtotalText").innerText = `Rs. ${subtotal}`;
    document.getElementById("taxText").innerText = `Rs. ${tax}`;
    document.getElementById("totalText").innerText = `Rs. ${total}`;
}

// Receipt Modal Checkout
function checkout(paymentMethod) {
    if (cart.length === 0) {
        alert("Please add items to the cart first!");
        return;
    }

    const receiptDetails = document.getElementById("receiptDetails");
    receiptDetails.innerHTML = "";

    let subtotal = 0;
    cart.forEach(item => {
        const itemTotal = item.price * item.qty;
        subtotal += itemTotal;
        receiptDetails.innerHTML += `
            <div class="receipt-row">
                <span>${item.name} x${item.qty}</span>
                <span>Rs. ${itemTotal}</span>
            </div>
        `;
    });

    const tax = Math.round(subtotal * gstRate);
    const total = subtotal + tax;

    document.getElementById("receiptSummary").innerHTML = `
        <div class="receipt-row"><strong>Subtotal:</strong> <span>Rs. ${subtotal}</span></div>
        <div class="receipt-row"><strong>GST (18%):</strong> <span>Rs. ${tax}</span></div>
        <div class="receipt-row" style="font-size:1rem; margin-top:0.4rem;"><strong>Grand Total:</strong> <span>Rs. ${total}</span></div>
        <div class="receipt-row" style="margin-top:0.4rem; color:#64748b;"><strong>Paid via:</strong> <span>${paymentMethod}</span></div>
    `;

    document.getElementById("receiptModal").style.display = "flex";
}

function closeModal() {
    document.getElementById("receiptModal").style.display = "none";
    clearCart();
    // Increment Order Number
    const orderIdElem = document.getElementById("orderId");
    let currentNum = parseInt(orderIdElem.innerText.replace("#PK-", ""));
    orderIdElem.innerText = `#PK-${currentNum + 1}`;
}