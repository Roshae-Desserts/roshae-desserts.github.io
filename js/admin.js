// Admin orders page: sign in with Supabase Auth, list and update orders.
(() => {
const $ = id => document.getElementById(id);
const K = "roshae_session";
const fmt = n => "PKR " + (Number(n) || 0).toLocaleString("en-US");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const STATUS = { new: "New", confirmed: "Confirmed", out_for_delivery: "Out for delivery", delivered: "Delivered", cancelled: "Cancelled" };
const NEXT = { new: ["confirmed", "Confirm"], confirmed: ["out_for_delivery", "Out for delivery"], out_for_delivery: ["delivered", "Mark delivered"] };
let session = JSON.parse(localStorage.getItem(K) || "null"), orders = [], base = [], tab = "all";

// ---- Supabase over plain fetch (no library) ----
const hdr = t => Object.assign({ apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" }, t ? { Authorization: "Bearer " + t } : {});
async function auth(path, body) {
  const r = await fetch(SUPABASE_URL + "/auth/v1/" + path, { method: "POST", headers: hdr(), body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error_description || j.msg || "Sign-in failed");
  return j;
}
function keep(j) { session = { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + j.expires_in * 1000 - 60000 }; localStorage.setItem(K, JSON.stringify(session)); }
async function token() {
  if (!session) throw new Error("401 not signed in");
  if (Date.now() > session.exp) keep(await auth("token?grant_type=refresh_token", { refresh_token: session.refresh }));
  return session.access;
}
async function api(path, opt = {}) {
  const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, Object.assign({}, opt, { headers: Object.assign(hdr(await token()), { Prefer: "return=representation" }) }));
  if (!r.ok) throw new Error("HTTP " + r.status + " " + await r.text());
  return r.json();
}
const signOut = () => { localStorage.removeItem(K); location.reload(); };

// ---- helpers ----
const day = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
function range() {
  const v = $("range").value, t = new Date(); let a = new Date(t), b = new Date(t);
  if (v === "all") return ["", "9999"];
  if (v === "custom") return [$("from").value || "", $("to").value || "9999"];
  if (v === "tomorrow") { a.setDate(t.getDate() + 1); b = new Date(a); }
  if (v === "week") { a.setDate(t.getDate() - (t.getDay() + 6) % 7); b = new Date(a); b.setDate(a.getDate() + 6); }
  if (v === "month") { a.setDate(1); b = new Date(t.getFullYear(), t.getMonth() + 1, 0); }
  return [day(a), day(b)];
}
const odate = o => $("basis").value === "created" ? day(new Date(o.created_at)) : o.delivery_date;
const items = o => (Array.isArray(o.items) && o.items.length ? o.items
  : [o.petite_qty && { size: "Petite", qty: o.petite_qty }, o.grande_qty && { size: "Grande", qty: o.grande_qty }].filter(Boolean))
  .map(i => i.qty + " × " + (i.product && i.product !== "Classic Tiramisu" ? i.product + " " : "") + i.size).join(", ");
const wa = p => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("0")) d = "92" + d.slice(1); return d; };
const msg = o => "Hi " + o.name + "! This is Roshae Desserts about your order " + o.order_no + ": " + items(o) + ", total " + fmt(o.total) +
  ", delivery " + o.delivery_date + (o.delivery_time ? " at " + o.delivery_time : "") + ". Status: " + (STATUS[o.status] || o.status) + ".";

// ---- render ----
function card(o) {
  const n = NEXT[o.status];
  return `<article class="oc s-${esc(o.status)}" data-id="${esc(o.id)}">
<div class="oh"><strong>${esc(o.order_no)}</strong><span class="b">${esc(STATUS[o.status] || o.status)}</span><span class="dt">${esc(new Date(o.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }))}</span></div>
<p class="nm">${esc(o.name)}</p><p>${esc(items(o))}</p>
<p><b>${fmt(o.total)}</b> · ${o.delivery_charged ? "incl. " + fmt(o.delivery_charged) + " delivery" : "free delivery"} · ${esc(o.payment)}</p>
<p>Deliver: ${esc(o.delivery_date)}${o.delivery_time ? " at " + esc(o.delivery_time) : ""}</p><p>${esc(o.address)}</p>
${o.notes ? `<p class="cn">Customer note: ${esc(o.notes)}</p>` : ""}
<div class="ct"><a class="btn wab" target="_blank" rel="noopener" href="https://wa.me/${wa(o.phone)}?text=${encodeURIComponent(msg(o))}">WhatsApp</a><a class="btn alt" href="tel:${esc(o.phone)}">Call</a><a class="btn alt" href="mailto:${esc(o.email)}">Email</a><button class="btn alt" data-act="copy">Copy</button></div>
<div class="ed"><label><input type="checkbox" data-act="paid" ${o.paid ? "checked" : ""}> Paid</label><label>Delivery cost <input type="number" min="0" data-act="cost" value="${o.delivery_actual ?? ""}" placeholder="PKR"></label></div>
<textarea data-act="note" placeholder="Private note">${esc(o.admin_note)}</textarea>
<div class="st">${n ? `<button class="btn" data-act="next" data-to="${n[0]}">${n[1]}</button>` : ""}${o.status === "cancelled" ? `<button class="btn alt" data-act="next" data-to="new">Reopen</button>` : o.status !== "delivered" ? `<button class="btn alt" data-act="cancel">Cancel</button>` : ""}</div></article>`;
}
function summary() {
  const live = base.filter(o => o.status !== "cancelled"), sum = (l, f) => l.reduce((s, o) => s + (Number(f(o)) || 0), 0);
  const entered = live.filter(o => o.delivery_actual != null);
  const st = [["Orders", live.length], ["Sales", fmt(sum(live, o => o.total))], ["Unpaid", fmt(sum(live.filter(o => !o.paid), o => o.total))],
    ["Delivery collected", fmt(sum(live, o => o.delivery_charged))], ["Delivery paid out", fmt(sum(entered, o => o.delivery_actual))],
    ["Delivery balance", fmt(sum(entered, o => o.delivery_charged) - sum(entered, o => o.delivery_actual))]];
  $("summary").innerHTML = st.map(s => `<div class="stat"><span>${s[0]}</span><b>${s[1]}</b></div>`).join("");
}
function render() {
  const [a, b] = range(), q = $("q").value.trim().toLowerCase(), unpaid = $("unpaid").checked;
  base = orders.filter(o => { const d = odate(o); return d >= a && d <= b && (!unpaid || (!o.paid && o.status !== "cancelled")) &&
    (!q || [o.name, o.phone, o.order_no, o.email].join(" ").toLowerCase().includes(q)); });
  $("tabs").innerHTML = [["all", "All"], ...Object.entries(STATUS)].map(([k, l]) =>
    `<button class="${tab === k ? "on" : ""}" data-tab="${k}">${l} (${k === "all" ? base.length : base.filter(o => o.status === k).length})</button>`).join("");
  const list = tab === "all" ? base : base.filter(o => o.status === tab);
  $("list").innerHTML = list.length ? list.map(card).join("") : '<p class="empty">No orders here.</p>';
  summary();
}
async function load() {
  try { orders = await api("orders?select=*&order=created_at.desc&limit=2000"); render(); }
  catch (x) { if (/401|JWT|refresh|Sign-in/i.test(x.message)) signOut(); else $("list").textContent = x.message; }
}

// ---- events ----
$("loginForm").onsubmit = async e => {
  e.preventDefault(); $("loginErr").textContent = "";
  try { keep(await auth("token?grant_type=password", { email: $("email").value.trim(), password: $("pw").value })); start(); }
  catch (x) { $("loginErr").textContent = x.message; }
};
$("out").onclick = signOut; $("refresh").onclick = load;
document.querySelector(".filters").addEventListener("input", () => { $("custom").hidden = $("range").value !== "custom"; render(); });
$("tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) { tab = b.dataset.tab; render(); } });
const patch = async (id, body) => { const r = await api("orders?id=eq." + id, { method: "PATCH", body: JSON.stringify(body) }); const i = orders.findIndex(o => o.id === id); Object.assign(orders[i], r[0]); };
$("list").addEventListener("click", async e => {
  const b = e.target.closest("button[data-act]"); if (!b) return;
  const id = b.closest(".oc").dataset.id, o = orders.find(x => x.id === id);
  try {
    if (b.dataset.act === "next") { await patch(id, { status: b.dataset.to }); render(); }
    else if (b.dataset.act === "cancel") { if (confirm("Cancel order " + o.order_no + "?")) { await patch(id, { status: "cancelled" }); render(); } }
    else if (b.dataset.act === "copy") { await navigator.clipboard.writeText(msg(o) + "\n" + o.address + "\nPhone: " + o.phone); b.textContent = "Copied"; }
  } catch (x) { alert(x.message); }
});
$("list").addEventListener("change", async e => {
  const t = e.target, a = t.dataset.act; if (!a) return;
  const body = a === "paid" ? { paid: t.checked } : a === "cost" ? { delivery_actual: t.value === "" ? null : Math.round(+t.value) } : { admin_note: t.value };
  try { await patch(t.closest(".oc").dataset.id, body); summary(); } catch (x) { alert(x.message); }
});
$("csv").onclick = () => {
  const cols = ["order_no", "created_at", "status", "name", "phone", "email", "address", "items", "total", "delivery_charged", "delivery_actual", "paid", "payment", "delivery_date", "delivery_time", "notes", "admin_note"];
  const cell = v => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const rows = (tab === "all" ? base : base.filter(o => o.status === tab)).map(o => cols.map(c => cell(c === "items" ? items(o) : o[c])).join(","));
  const url = URL.createObjectURL(new Blob(["\ufeff" + cols.join(",") + "\n" + rows.join("\n")], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = "roshae-orders-" + day(new Date()) + ".csv"; a.click(); URL.revokeObjectURL(url);
};
function start() { $("login").hidden = true; $("app").hidden = false; load(); }
if (session) start();
})();
