// Order form: size picker, total, save to Supabase, email via EmailJS.
(() => {
const PRICE = { Petite: 1700, Grande: 6800 };
const $ = id => document.getElementById(id);
const form = $("orderForm");
document.querySelectorAll(".wa").forEach(a => { a.href = "https://wa.me/" + WHATSAPP_NUMBER; });
if (!form) return;   // this page has no order form
// 6 characters from a 32-letter set with no look-alikes (no 0/O/1/I): about 1 billion combinations
const newOrderNo = () => {
  const set = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", v = crypto.getRandomValues(new Uint8Array(6));
  return "RS-" + [...v].map(n => set[n % 32]).join("");
};
const fmt = n => "PKR " + n.toLocaleString("en-US");

// earliest delivery date
const d = new Date(); d.setDate(d.getDate() + MIN_DAYS_NOTICE);
$("date").min = $("date").value = d.toISOString().slice(0, 10);

// live total
const q = n => Math.max(0, Math.min(20, parseInt(form[n].value, 10) || 0));
const subtotal = () => PRICE.Petite * q("qP") + PRICE.Grande * q("qG");
const deliveryFee = () => (subtotal() === 0 || subtotal() >= FREE_DELIVERY_FROM) ? 0 : DELIVERY_FEE;
const total = () => subtotal() + deliveryFee();
const rows = [...document.querySelectorAll(".srow")];
const prev = { Petite: $("prevP"), Grande: $("prevG") };
const show = size => {
  for (const k in prev) prev[k].classList.toggle("on", k === size);
  rows.forEach(r => r.classList.toggle("active", r.dataset.size === size));
};
const refresh = () => {
  const s = subtotal(), fee = deliveryFee();
  $("subtotal").textContent = fmt(s);
  $("delivery").innerHTML = s === 0 ? "–" : fee === 0 ? "<s>" + fmt(DELIVERY_FEE) + "</s><strong>Free</strong>" : fmt(fee);
  $("hint").textContent = s > 0 && s < FREE_DELIVERY_FROM ? "Add " + fmt(FREE_DELIVERY_FROM - s) + " more for free delivery" : "";
  $("total").textContent = fmt(total());
  rows.forEach(r => r.classList.toggle("has", q(r.dataset.size === "Petite" ? "qP" : "qG") > 0));
};
rows.forEach(row => {
  row.addEventListener("focusin", () => show(row.dataset.size));
  row.addEventListener("click", e => {
    show(row.dataset.size);
    const b = e.target.closest("button"); if (!b) return;
    const inp = row.querySelector("input");
    inp.value = Math.max(0, Math.min(20, (parseInt(inp.value, 10) || 0) + (+b.dataset.d)));
    refresh();
  });
});
form.addEventListener("input", refresh);
show("Petite"); refresh();

// submit
form.addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("err"); err.style.display = "none";
  if (form.website.value) return;                    // honeypot: bots fill this
  if (!form.checkValidity()) {
    form.reportValidity(); return;
  }
  if (total() === 0) {
    err.textContent = "Add at least one Petite or Grande to your order."; err.style.display = "block"; return;
  }
  const orderNo = newOrderNo();
  const row = {
    order_no: orderNo, name: form.name.value.trim(), email: form.email.value.trim(),
    phone: form.phone.value.trim(), address: form.addr.value.trim(), petite_qty: q("qP"), grande_qty: q("qG"), delivery_date: form.date.value, delivery_time: form.time.value || null,
    payment: form.pay.value, notes: form.notes.value.trim() || null, total: total(), delivery_charged: deliveryFee(), status: "new"
  };
  const btn = $("submitBtn"); btn.disabled = true; btn.textContent = "Sending…";
  try {
    if (SUPABASE_URL.includes("YOUR-PROJECT")) {
      console.warn("Supabase not configured: demo mode, order not saved.");
    } else {
      let r;
      for (let i = 0; i < 4; i++) {       // if the order number already exists (409), make a new one and retry
      r = await fetch(SUPABASE_URL + "/rest/v1/orders", {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Prefer: "return=minimal" },
          SUPABASE_ANON_KEY.startsWith("sb_") ? {} : { Authorization: "Bearer " + SUPABASE_ANON_KEY }),
        body: JSON.stringify(row)
      });
      if (r.status !== 409) break;
      row.order_no = newOrderNo();
      }
      if (!r.ok) throw new Error("HTTP " + r.status + " " + await r.text());
      notify(row);
    }
    showDone(row);
  } catch (x) {
    console.error("Order failed:", x);
    err.textContent = "Your order didn’t send. Check your connection and try again, or message us on Instagram.";
    err.style.display = "block"; btn.disabled = false; btn.textContent = "Send pre-order";
  }
});

// emails the owner; never blocks or fails the order
function notify(r) {
  if (EMAILJS_PUBLIC_KEY.includes("YOUR")) return;
  const items = [r.petite_qty ? r.petite_qty + " × Petite" : "", r.grande_qty ? r.grande_qty + " × Grande" : ""].filter(Boolean).join(", ");
  fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID, template_id: EMAILJS_TEMPLATE_ID, user_id: EMAILJS_PUBLIC_KEY,
      template_params: {
        order_no: r.order_no, items, total: fmt(r.total), delivery_fee: r.delivery_charged ? fmt(r.delivery_charged) : "Free", name: r.name, email: r.email, phone: r.phone,
        address: r.address, delivery: r.delivery_date + (r.delivery_time ? " at " + r.delivery_time : ""),
        payment: r.payment, notes: r.notes || "None"
      }
    })
  }).catch(() => {});
}

function showDone(r) {
  const text = [
    "Order " + r.order_no, r.petite_qty ? r.petite_qty + " × Classic Tiramisu (Petite)" : "", r.grande_qty ? r.grande_qty + " × Classic Tiramisu (Grande)" : "", "Delivery fee: " + (r.delivery_charged ? fmt(r.delivery_charged) : "Free"), "Total: " + fmt(r.total),,
    "Delivery: " + r.delivery_date + (r.delivery_time ? " at " + r.delivery_time : ""),
    "Payment: " + r.payment, "Name: " + r.name, "Phone: " + r.phone, "Address: " + r.address,
    r.notes ? "Notes: " + r.notes : ""
  ].filter(Boolean).join("\n");
  $("orderNo").textContent = r.order_no; $("summary").textContent = text;
  $("waLink").href = "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent("Hi Roshae! Here is my order:\n" + text);
  form.style.display = "none"; const done = $("done"); done.style.display = "block"; done.focus();
  $("copyBtn").onclick = async () => {
    try { await navigator.clipboard.writeText(text); $("copyBtn").textContent = "Copied"; }
    catch { $("copyBtn").textContent = "Select and copy the text above"; }
  };
}
})();
