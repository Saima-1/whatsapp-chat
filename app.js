/*
  APP.JS - all the logic of ChatApp. Sections (top to bottom):
  1. Firebase config (paste your keys here)
  2. Helper functions (time, avatar, image resize, popup)
  3. AUTH - sign up / log in / log out
  4. CONTACTS - contact list, adding a contact
  5. PROFILE & SETTINGS - profile, theme, wallpaper
  6. CHAT - show, send, edit, delete and react to messages
  7. VOICE NOTE, PHOTO, POLL
  8. CALLS - voice / video calls (WebRTC)
  9. STATUS and CALL HISTORY (at the end of the file)
  Data in Firestore: users, chats (with messages inside), calls, statuses
*/
/* ====== STEP 1: paste your Firebase config here (Project settings > Your apps > Web) ====== */
const firebaseConfig = {
  apiKey: "AIzaSyCPq3FPQCdp-WJPz3RgKhQt8ZTvsBcUMiY",
  authDomain: "whatsapp-f0dad.firebaseapp.com",
  databaseURL: "https://whatsapp-f0dad-default-rtdb.firebaseio.com",
  projectId: "whatsapp-f0dad",
  storageBucket: "whatsapp-f0dad.firebasestorage.app",
  messagingSenderId: "136868790233",
  appId: "1:136868790233:web:4d78774a03215073f1e3c8",
  measurementId: "G-Z3KGBLGGVN"
};
/* ================================================================================================ */
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s == null ? "" : s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
if (firebaseConfig.apiKey.startsWith("YOUR")) {
  document.body.innerHTML =
    '<p style="padding:30px;font-size:18px">First paste your Firebase keys into <b>firebaseConfig</b> at the top of this file.</p>';
  throw new Error("config");
}
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(),
  db = firebase.firestore(),
  FV = firebase.firestore.FieldValue;
const COL = ["#8b6bd6", "#f59e0b", "#ef4444", "#14b8a6", "#0ea5e9", "#a855f7"],
  WP = [
    null,
    "#d7e8d0",
    "#cfe4f7",
    "#f3d9e6",
    "#f5e9c8",
    "#2b2f36",
    "#0b141a",
    "#1f2c34",
  ];
let me,
  my = {},
  U = {},
  C = {},
  W = {},
  cur = null,
  MS = [],
  msgUn,
  editing = null,
  signup = false,
  pend = {},
  unsubs = [];
const sets = () => {
  try {
    return JSON.parse(localStorage.getItem("cs") || "{}");
  } catch (e) {
    return {};
  }
};
const saveSets = (s) => {
  try {
    localStorage.setItem("cs", JSON.stringify(s));
  } catch (e) {}
  applySets();
};
function applySets() {
  const s = sets();
  document.documentElement.dataset.theme =
    s.theme === "dark" ? "dark" : s.theme === "light" ? "light" : "dark";
  document.documentElement.style.setProperty("--cb", s.wp || "");
  if (!s.wp) document.documentElement.style.removeProperty("--cb");
}
applySets();
const toast = (t) => {
  const e = $("#toast");
  e.textContent = t;
  e.style.display = "block";
  setTimeout(() => (e.style.display = "none"), 2500);
};
const tm = (t) =>
  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const dl = (t) => {
  const d = new Date(t),
    n = new Date();
  return d.toDateString() === n.toDateString()
    ? "Today"
    : new Date(n - 864e5).toDateString() === d.toDateString()
      ? "Yesterday"
      : d.toLocaleDateString();
};
const on = (u) => !!(u && u.online && Date.now() - u.lastSeen < 70000);
const ls = (u) =>
  !u || !u.lastSeen
    ? "offline"
    : on(u)
      ? "online"
      : "last seen " + dl(u.lastSeen).toLowerCase() + " at " + tm(u.lastSeen);
const col = (n) =>
  COL[[...(n || "?")].reduce((a, c) => a + c.charCodeAt(0), 0) % COL.length];
const av = (u, s = 44, d) => {
  u = u || { name: "?" };
  const st =
    `width:${s}px;height:${s}px;font-size:${s / 2.4}px;` +
    (u.photo
      ? `background-image:url(${u.photo})`
      : `background:${col(u.name)}`);
  return `<div class="avw"><div class="av" style="${st}">${u.photo ? "" : esc((u.name || "?")[0].toUpperCase())}</div>${d && on(u) ? '<i class="dot"></i>' : ""}</div>`;
};
const cid = (o) => (C[o] && C[o].group ? o : [me.uid, o].sort().join("_"));
const msgs = () => db.collection("chats").doc(cid(cur)).collection("messages");
function rs(file, max, q) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onerror = () => rej(new Error("bad image"));
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height)),
          c = document.createElement("canvas");
        c.width = im.width * k;
        c.height = im.height * k;
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", q));
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  });
}
function modal(h) {
  $("#ov").innerHTML = '<div class="pan">' + h + "</div>";
  $("#ov").style.display = "flex";
}
const closeM = () => {
  $("#ov").style.display = "none";
  $("#ov").innerHTML = "";
};
$("#ov").onclick = (e) => {
  if (e.target.id === "ov") closeM();
};

/* ---------- AUTH ---------- */
function mode(s) {
  signup = s;
  $("#ah").textContent = s ? "Create account" : "Log in";
  $("#an").style.display = $("#aph").style.display = s ? "block" : "none";
  $("#abtn").textContent = s ? "Sign up" : "Log in";
  $("#asw").textContent = s
    ? "Already have an account? Log in"
    : "Create a new account";
  $("#aerr").textContent = "";
}
$("#asw").onclick = () => mode(!signup);
async function submitAuth() {
  const btn = $("#abtn");
  if (btn.disabled) return;
  const e = $("#ae").value.trim().toLowerCase(),
    p = $("#apw").value,
    er = $("#aerr");
  er.textContent = "";
  if (!e || !p) {
    er.textContent = "Enter your email and password.";
    return;
  }
  btn.disabled = true;
  btn.textContent = signup ? "Creating account…" : "Logging in…";
  try {
    if (signup) {
      const n = $("#an").value.trim();
      if (!n) return (er.textContent = "Please enter your name.");
      pend = { name: n, phone: $("#aph").value.trim() };
      await auth.createUserWithEmailAndPassword(e, p);
    } else await auth.signInWithEmailAndPassword(e, p);
  } catch (x) {
    const messages = {
      "auth/invalid-email": "This email address is not valid.",
      "auth/user-not-found": "No account found for this email. Create an account first.",
      "auth/wrong-password": "Incorrect password. Check it and try again.",
      "auth/invalid-credential": "Email or password is incorrect.",
      "auth/too-many-requests": "Too many attempts. Wait a while and try again.",
      "auth/network-request-failed": "Network error. Check your internet connection and try again.",
      "auth/email-already-in-use": "This email already has an account. Log in instead.",
      "auth/weak-password": "Choose a stronger password with at least 6 characters.",
      "auth/operation-not-allowed": "Email and password sign-in is disabled in Firebase Authentication settings.",
    };
    er.textContent = messages[x.code] || (x.message || "Sign-in failed.").replace("Firebase: ", "");
  } finally {
    btn.disabled = false;
    btn.textContent = signup ? "Sign up" : "Log in";
  }
}
$("#abtn").onclick = submitAuth;
["#ae", "#apw", "#an", "#aph"].forEach((selector) =>
  $(selector).addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitAuth();
  }),
);
auth.onAuthStateChanged(async (u) => {
  if (!u) {
    $("#auth").style.display = "grid";
    $("#app").style.display = "none";
    return;
  }
  boot(u);
});
async function boot(u) {
  me = u;
  const r = db.collection("users").doc(u.uid);
  try {
    const s = await r.get();
    if (!s.exists)
      await r.set({
        name: pend.name || u.email.split("@")[0],
        email: u.email.toLowerCase(),
        phone: pend.phone || "",
        about: "Hey there! I am using ChatApp.",
        photo: "",
        contacts: [],
        online: true,
        lastSeen: Date.now(),
      });
  } catch (e) {
    return toast("Firestore error: " + e.message);
  }
  $("#auth").style.display = "none";
  $("#app").style.display = "flex";
  unsubs.push(
    r.onSnapshot((d) => {
      my = { ...d.data(), id: u.uid };
      U[u.uid] = my;
      watchAll();
      $("#me").innerHTML = av(my, 40);
      renderList();
    }),
  );
  unsubs.push(
    db
      .collection("chats")
      .where("members", "array-contains", u.uid)
      .onSnapshot((q) => {
        C = {};
        q.forEach((d) => (C[d.id] = d.data()));
        watchAll();
        renderList();
      }),
  );
  unsubs.push(
    db
      .collection("calls")
      .where("to", "==", u.uid)
      .where("status", "==", "ringing")
      .onSnapshot((q) =>
        q.docChanges().forEach((ch) => {
          if (ch.type === "added") {
            const c = ch.doc.data();
            if ((!firstCalls || Math.abs(Date.now() - c.ts) < 300000) && !pc)
              incoming(ch.doc.id, c);
          } else if (ch.type === "removed" && !pc)
            $("#inc").style.display = "none";
        }),
      ),
  );
  pres(true);
  startExtra();
}
const pres = (o) =>
  me &&
  db
    .collection("users")
    .doc(me.uid)
    .update({ online: o, lastSeen: Date.now() })
    .catch(() => {});
setInterval(() => {
  if (me && !document.hidden) pres(true);
  if (me) {
    renderList();
    cur && hdr();
  }
}, 25000);
document.addEventListener("visibilitychange", () => pres(!document.hidden));
addEventListener("beforeunload", () => pres(false));

/* ---------- CONTACTS ---------- */
function watch(id) {
  if (W[id] || id === me.uid) return;
  W[id] = db
    .collection("users")
    .doc(id)
    .onSnapshot((d) => {
      U[id] = { ...d.data(), id };
      renderList();
      if (cur === id) hdr();
    });
}
const partners = () => {
  const s = new Set(my.contacts || []);
  Object.values(C)
    .filter((c) => !c.group)
    .forEach((c) => c.members.forEach((m) => s.add(m)));
  s.delete(me.uid);
  return [...s];
};
const watchAll = () => partners().forEach(watch);
function renderChats() {
  const q = $("#q").value.toLowerCase(),
    items = [];
  partners().forEach((i) => {
    if (U[i] && chipOk(i) && (U[i].name || "").toLowerCase().includes(q))
      items.push({ id: i, u: U[i], c: vis(C[cid(i)]) });
  });
  Object.entries(C).forEach(([id, c]) => {
    if (c.group && vis(c) && chipOk(id) && c.name.toLowerCase().includes(q))
      items.push({ id, u: { name: c.name, isG: 1 }, c });
  });
  items.sort((a, b) => (b.c?.lastTs || 0) - (a.c?.lastTs || 0));
  $("#list").innerHTML = items.length
    ? items
        .map(
          ({ id, u, c }) =>
            `<div class="row ${cur === id ? "on" : ""}" data-u="${id}">${av(u, 46, 1)}<div class="m"><div class="n">${u.isG ? "👥 " : ""}${esc(u.name)}<small>${c ? tm(c.lastTs) : ""}</small></div><div class="s">${c ? esc(c.last) : esc(u.about || "")}${isUnread(id) ? '<span class="badge">●</span>' : ""}</div></div></div>`,
        )
        .join("")
    : `<p class="emp">No chats yet. Tap ➕ to add a contact or create a group. Your email: <b>${esc(me.email)}</b></p>`;
}
$("#q").oninput = renderList;
$("#list").onclick = (e) => {
  const r = e.target.closest("[data-u]");
  if (r) openChat(r.dataset.u);
};
$("#add").onclick = () => {
  modal(
    `<h2>New contact</h2><p class="sub">Enter the email or phone number of someone who is registered on ChatApp.</p><input id="ce2" placeholder="Email or phone (+92300…)"><div class="err" id="cer"></div><div class="r2"><button class="btn" id="cok">Add</button><button class="btn g" id="cx">Cancel</button></div>`,
  );
  $("#cx").onclick = closeM;
  $("#cok").onclick = async () => {
    const v = $("#ce2").value.trim();
    if (!v) return;
    const f = v.includes("@") ? "email" : "phone",
      q = await db
        .collection("users")
        .where(f, "==", f === "email" ? v.toLowerCase() : v)
        .limit(1)
        .get();
    if (q.empty)
      return ($("#cer").textContent =
        "User not found. Make sure they have signed up.");
    const id = q.docs[0].id;
    if (id === me.uid) return ($("#cer").textContent = "That's you.");
    await db
      .collection("users")
      .doc(me.uid)
      .update({ contacts: FV.arrayUnion(id) });
    closeM();
    toast("Contact added");
    openChat(id);
  };
};

/* ---------- PROFILE & SETTINGS ---------- */
$("#thm").onclick = () => {
  const s = sets();
  s.theme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  saveSets(s);
};
$("#me").onclick = () => {
  let ph = my.photo || "";
  const s = sets();
  modal(`<h2>Profile & settings</h2><div class="pr"><span id="pp">${av(my, 80)}</span><label class="btn s">Change photo<input type="file" id="pf" accept="image/*" hidden></label></div>
 <input id="pn" placeholder="Name" value="${esc(my.name)}"><input id="pa" placeholder="About" value="${esc(my.about)}"><input id="pph" placeholder="Phone (+92300…)" value="${esc(my.phone)}"><p class="sub">${esc(me.email)}</p>
 <label>Theme<select id="th"><option value="">Default (dark)</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
 <div style="font-size:14px">Chat wallpaper</div><div class="sw" id="wps">${WP.map((c, i) => `<button data-i="${i}" class="${(s.wp || null) === c ? "on" : ""}" style="background:${c || "var(--cb)"}"></button>`).join("")}</div>
 <div class="r2"><button class="btn" id="ps">Save</button><button class="btn g" id="lg">Log out</button></div>`);
  $("#th").value = s.theme || "";
  $("#th").onchange = () => {
    const x = sets();
    x.theme = $("#th").value;
    saveSets(x);
  };
  $("#wps").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const x = sets();
    x.wp = WP[b.dataset.i];
    saveSets(x);
    document
      .querySelectorAll("#wps button")
      .forEach((k) => k.classList.toggle("on", k === b));
  };
  $("#pf").onchange = async (e) => {
    if (e.target.files[0]) {
      ph = await rs(e.target.files[0], 240, 0.8);
      $("#pp").innerHTML = av({ name: my.name, photo: ph }, 80);
    }
  };
  $("#ps").onclick = async () => {
    const n = $("#pn").value.trim();
    if (!n) return toast("Name can't be empty");
    await db
      .collection("users")
      .doc(me.uid)
      .update({
        name: n,
        about: $("#pa").value.trim(),
        phone: $("#pph").value.trim(),
        photo: ph,
      });
    closeM();
    toast("Profile saved");
  };
  $("#lg").onclick = async () => {
    await pres(false);
    await auth.signOut();
    location.reload();
  };
};

/* ---------- CHAT ---------- */
function hdr() {
  const u = U[cur];
  if (!u) return;
  $("#cn").textContent = u.name;
  $("#cav").innerHTML = av(u, 40, 1);
  $("#cs2").textContent = ls(u);
}
$("#hd").onclick = () => {
  const u = U[cur];
  if (!u) return;
  modal(
    `<div style="display:grid;place-items:center;gap:8px">${av(u, 120, 1)}<h2>${esc(u.name)}</h2><p class="sub">${ls(u)}</p></div><p>${esc(u.about || "")}</p><p class="sub">📧 ${esc(u.email || "")}</p><p class="sub">📞 ${esc(u.phone || "—")}</p><button class="btn g" id="cx">Close</button>`,
  );
  $("#cx").onclick = closeM;
};
function openChat(id) {
  cur = id;
  if (msgUn) msgUn();
  editing = null;
  $("#ed").style.display = "none";
  $("#empty").style.display = "none";
  $("#chat").style.display = "flex";
  document.body.classList.add("chat");
  hdr();
  renderList();
  msgUn = msgs()
    .orderBy("ts")
    .limitToLast(200)
    .onSnapshot(
      (q) => {
        MS = q.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter(
            (m) =>
              m.ts > (C[cid(cur)]?.hidden?.[me.uid] || 0) &&
              !(m.delFor || []).includes(me.uid),
          ); // hide messages cleared by "Delete chat"
        draw();
        seen();
      },
      (e) => toast(e.message),
    );
}
$("#bk").onclick = () => {
  document.body.classList.remove("chat");
  cur = null;
  if (msgUn) msgUn();
  renderList();
};
function seen() {
  const c = C[cid(cur)];
  if (c && c.lastFrom !== me.uid && c.lastTs > (c.seen?.[me.uid] || 0))
    db.collection("chats")
      .doc(cid(cur))
      .set({ members: mem(), seen: { [me.uid]: Date.now() } }, { merge: true });
}
function draw() {
  const sn = C[cid(cur)]?.seen?.[cur] || 0;
  let day = "";
  const M = $("#msgs"),
    atEnd = M.scrollHeight - M.scrollTop - M.clientHeight < 150;
  M.innerHTML = MS.map((m) => {
    const mine = m.from === me.uid;
    let h = "";
    if (dl(m.ts) !== day) {
      day = dl(m.ts);
      h = `<div class="day">${day}</div>`;
    }
    let b;
    if (m.del) b = '<i class="del">🚫 This message was deleted</i>';
    else if (m.type === "call") {
      const mins = Math.floor((m.dur || 0) / 60),
        secs = String((m.dur || 0) % 60).padStart(2, "0"),
        detail = m.dur ? `${mins}:${secs}` : "Missed call";
      b = `<div class="call-msg"><b>${m.video ? "📹 Video call" : "📞 Voice call"}</b><small>${mine ? "Outgoing" : "Incoming"} · ${detail}</small></div>`;
    }
    else if (m.type === "image")
      b = `<img class="pic" data-full src="${m.img}">`;
    else if (m.type === "voice")
      b = `<audio controls src="${m.aud}"></audio><small>🎤 ${m.dur}s</small>`;
    else if (m.type === "video")
      b = `<div class="vid" data-vid="${m.id}">▶<small>Video · ${m.mb} MB</small></div>`;
    else if (m.type === "poll") {
      const t = m.poll.opts.reduce((a, o) => a + o.v.length, 0);
      b =
        `<b>📊 ${esc(m.poll.q)}</b>` +
        m.poll.opts
          .map(
            (o, i) =>
              `<div class="po" data-vote="${i}"><div class="pbar" style="width:${t ? (o.v.length / t) * 100 : 0}%"></div><span>${o.v.includes(me.uid) ? "☑" : "☐"} ${esc(o.t)}</span><em>${o.v.length}</em></div>`,
          )
          .join("");
    } else
      b =
        (m.rep
          ? `<div class="qt"><b>${esc(m.rep.n)}</b><br>${esc(m.rep.t)}</div>`
          : "") +
        esc(m.text) +
        (TR[m.id]
          ? `<div class="trn" data-id="${m.id}" title="Tap to hide the translation">🌐 ${esc(TR[m.id])}</div>`
          : "");
    const rc = {};
    Object.values(m.react || {}).forEach((e) => (rc[e] = (rc[e] || 0) + 1));
    const rx = Object.keys(rc).length
      ? `<span class="rx">${Object.entries(rc)
          .map(([e, n]) => e + (n > 1 ? n : ""))
          .join(" ")}</span>`
      : "";
    return (
      h +
      `<div class="msg ${mine ? "out" : "in"} ${rx ? "has" : ""}" data-id="${m.id}">${isG(cur) && !mine ? `<b class="sn" style="color:${col(U[m.from]?.name)}">${esc(U[m.from]?.name || "…")}</b>` : ""}${b}<span class="t">${m.edited && !m.del ? "edited " : ""}${tm(m.ts)}${mine ? ` <i class="${sn >= m.ts ? "rd" : ""}">✓✓</i>` : ""}</span><button class="dd" data-menu>⌄</button>${rx}</div>`
    );
  }).join("");
  if (atEnd || MS.length < 2) M.scrollTop = M.scrollHeight;
}
const prev = (m) =>
  m.type === "call"
    ? `${m.video ? "Video" : "Voice"} call${m.dur ? ` · ${Math.floor(m.dur / 60)}:${String(m.dur % 60).padStart(2, "0")}` : " · Missed call"}`
    : m.type === "image"
    ? "📷 Photo"
    : m.type === "voice"
      ? "🎤 Voice message"
      : m.type === "poll"
        ? "📊 " + m.poll.q
        : m.text;
async function send(m) {
  m = { from: me.uid, ts: Date.now(), ...m };
  const cr = db.collection("chats").doc(cid(cur));
  try {
    await cr.set(
      {
        members: mem(),
        last: (isG(cur) ? my.name.split(" ")[0] + ": " : "") + prev(m),
        lastTs: m.ts,
        lastFrom: me.uid,
      },
      { merge: true },
    );
    await cr.collection("messages").add(m);
  } catch (e) {
    toast("Send failed: " + e.message);
  }
}
const mi = $("#mi");
mi.oninput = () => ($("#sb").textContent = mi.value.trim() ? "➤" : "🎤");
mi.onkeydown = (e) => {
  if (e.key === "Enter") act();
};
$("#sb").onclick = act;
function act() {
  if (recOn) return stopRec(true);
  const v = mi.value.trim();
  if (!v) return startRec();
  if (editing) {
    msgs().doc(editing).update({ text: v, edited: true });
    cancelEdit();
  } else sendText(v);
  mi.value = "";
  mi.oninput();
}
function cancelEdit() {
  editing = null;
  $("#ed").style.display = "none";
  mi.value = "";
  mi.oninput();
}
$("#edx").onclick = cancelEdit;
const E = [
  "😀",
  "😂",
  "😍",
  "😎",
  "😢",
  "😡",
  "👍",
  "🙏",
  "🎉",
  "❤️",
  "🔥",
  "😅",
  "🤝",
  "🥰",
  "😴",
  "🤔",
];
$("#emo").innerHTML = E.map((e) => `<button>${e}</button>`).join("");
$("#emo").onclick = (e) => {
  if (e.target.tagName === "BUTTON") {
    mi.value += e.target.textContent;
    mi.oninput();
  }
};
$("#eb").onclick = () => {
  const e = $("#emo");
  e.style.display = e.style.display === "flex" ? "none" : "flex";
};

/* attach: photo + poll */
$("#ab").onclick = (e) => {
  e.stopPropagation();
  $("#att").style.display = "block";
};
$("#att").onclick = (e) => {
  const a = e.target.dataset.a;
  if (a === "img") $("#imf").click();
  if (a === "poll") pollM();
};
$("#imf").onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  send({ type: "image", img: await rs(f, 900, 0.72) });
};
function pollM() {
  modal(
    `<h2>Create poll</h2><input id="pq" placeholder="Question"><input class="po2" placeholder="Option 1"><input class="po2" placeholder="Option 2"><input class="po2" placeholder="Option 3 (optional)"><input class="po2" placeholder="Option 4 (optional)"><div class="r2"><button class="btn" id="pk">Send poll</button><button class="btn g" id="cx">Cancel</button></div>`,
  );
  $("#cx").onclick = closeM;
  $("#pk").onclick = () => {
    const q = $("#pq").value.trim(),
      o = [...document.querySelectorAll(".po2")]
        .map((i) => i.value.trim())
        .filter(Boolean);
    if (!q || o.length < 2)
      return toast("Enter a question and at least 2 options");
    closeM();
    send({ type: "poll", poll: { q, opts: o.map((t) => ({ t, v: [] })) } });
  };
}
function vote(id, i) {
  const r = msgs().doc(id);
  db.runTransaction(async (t) => {
    const d = await t.get(r),
      p = d.data().poll,
      had = p.opts[i].v.includes(me.uid);
    p.opts.forEach((o) => (o.v = o.v.filter((x) => x !== me.uid)));
    if (!had) p.opts[i].v.push(me.uid);
    t.update(r, { poll: p });
  });
}

/* message menu: react / edit / delete / copy */
$("#msgs").onclick = (e) => {
  const el = e.target.closest(".msg");
  if (!el) return;
  const id = el.dataset.id,
    m = MS.find((x) => x.id === id);
  if (e.target.closest("[data-vote]"))
    return vote(id, +e.target.closest("[data-vote]").dataset.vote);
  if (e.target.closest("[data-full]"))
    return (
      modal(
        `<img src="${m.img}" style="max-width:100%;border-radius:8px"><button class="btn g" id="cx">Close</button>`,
      ),
      ($("#cx").onclick = closeM)
    );
  if (e.target.closest("[data-menu]")) {
    e.stopPropagation();
    const r = e.target.getBoundingClientRect(),
      mine = m.from === me.uid,
      mn = $("#menu");
    mn.innerHTML =
      (m.del
        ? ""
        : `<div class="er">${["👍", "❤️", "😂", "😮", "😢", "🙏"].map((x) => `<button data-r="${x}">${x}</button>`).join("")}</div>`) +
      (!m.del && m.type === "text"
        ? '<button class="a" data-rp>↩️ Reply</button><button class="a" data-c>📋 Copy</button><button class="a" data-tr>🌐 Translate</button>'
        : "") +
      (mine && !m.del && m.type === "text"
        ? '<button class="a" data-e>✏️ Edit</button>'
        : "") +
      (mine ? '<button class="a" data-d>🗑 Delete for everyone</button>' : "");
    mn.style.display = "block";
    mn.style.top = Math.min(r.bottom, innerHeight - mn.offsetHeight - 8) + "px";
    mn.style.left =
      Math.max(8, Math.min(r.left - 120, innerWidth - mn.offsetWidth - 8)) +
      "px";
    mn.dataset.id = id;
  }
};
$("#menu").onclick = (e) => {
  const id = e.currentTarget.dataset.id,
    m = MS.find((x) => x.id === id),
    b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.r)
    msgs()
      .doc(id)
      .update({
        ["react." + me.uid]:
          (m.react || {})[me.uid] === b.dataset.r ? FV.delete() : b.dataset.r,
      });
  if ("c" in b.dataset)
    navigator.clipboard && navigator.clipboard.writeText(m.text);
  if ("e" in b.dataset) {
    editing = id;
    mi.value = m.text;
    mi.oninput();
    mi.focus();
    $("#edt").textContent = "✏️ Editing: " + m.text.slice(0, 50);
    $("#ed").style.display = "flex";
  }
  if ("d" in b.dataset && confirm("Delete for everyone?"))
    msgs()
      .doc(id)
      .update({ del: true, text: "", img: "", aud: "", poll: null });
};
document.addEventListener("click", () => {
  $("#menu").style.display = "none";
  $("#att").style.display = "none";
});

/* voice note */
let recOn = false,
  mr,
  chunks,
  rs0,
  rti,
  st0;
async function startRec() {
  try {
    st0 = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    return toast("Microphone permission is required");
  }
  mr = new MediaRecorder(st0, { audioBitsPerSecond: 24000 });
  chunks = [];
  mr.ondataavailable = (e) => chunks.push(e.data);
  mr.start();
  recOn = true;
  rs0 = Date.now();
  $("#rec").style.display = "flex";
  mi.style.display = $("#eb").style.display = $("#ab").style.display = "none";
  $("#sb").textContent = "➤";
  rti = setInterval(() => {
    const s = Math.floor((Date.now() - rs0) / 1000);
    $("#rt").textContent =
      Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    if (s >= 90) stopRec(true);
  }, 500);
}
function stopRec(sendIt) {
  if (!recOn) return;
  recOn = false;
  clearInterval(rti);
  const d = Math.max(1, Math.round((Date.now() - rs0) / 1000));
  $("#rec").style.display = "none";
  mi.style.display = $("#eb").style.display = $("#ab").style.display = "";
  mi.oninput();
  mr.onstop = () => {
    st0.getTracks().forEach((t) => t.stop());
    if (!sendIt) return;
    const r = new FileReader();
    r.onload = () => {
      if (r.result.length > 900000)
        return toast("Voice note is too long (max ~90s)");
      send({ type: "voice", aud: r.result, dur: d });
    };
    r.readAsDataURL(new Blob(chunks, { type: mr.mimeType }));
  };
  mr.stop();
}
$("#rc").onclick = () => stopRec(false);

/* ---------- CALLS (WebRTC + Firestore signalling) ---------- */
const ICE = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    // TURN relay: needed when users are on different networks / mobile data.
    // This is a free public test server. For reliable calls put your own TURN details here.
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};
let pc,
  callRef,
  callMeta,
  lstream,
  pc2 = [],
  cu = [],
  tt,
  nt,
  inc,
  t00;
const media = async (v) => {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: v });
  } catch (e) {
    if (v) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        toast(
          "Camera is not available (maybe in use by another tab). Continuing with audio only",
        );
        return s;
      } catch (e2) {}
    }
    toast("Microphone/camera permission is required");
    return null;
  }
};
const flush = () => {
  pc2.forEach((c) => pc.addIceCandidate(c).catch(() => {}));
  pc2 = [];
};
function callUI(u, v, s) {
  $("#call").style.display = "flex";
  $("#cnm").textContent = u ? u.name : "";
  $("#cav2").innerHTML = av(u, 100);
  $("#cst").textContent = s;
  $("#lv").style.display = v ? "block" : "none";
  $("#lv").srcObject = lstream;
  $("#rv").style.opacity = 0;
  $("#cm").style.display = v ? "" : "none";
  $("#mt").className = $("#cm").className = "";
}
function mkpc(ref) {
  pc = new RTCPeerConnection(ICE);
  pc2 = [];
  lstream.getTracks().forEach((t) => pc.addTrack(t, lstream));
  pc.ontrack = (e) => {
    $("#rv").srcObject = e.streams[0];
    $("#rv")
      .play()
      .catch(() => {});
    if (e.track.kind === "video") {
      $("#rv").style.opacity = 1;
      $("#cav2").style.display = "none";
    }
  };
  pc.onicecandidate = (e) =>
    e.candidate &&
    ref.collection("cand").add({ by: me.uid, c: JSON.stringify(e.candidate) });
  pc.onconnectionstatechange = () => {
    if (!pc) return;
    if (pc.connectionState === "connected") {
      clearTimeout(nt);
      const s = Date.now();
      conAt = s;
      clearInterval(tt);
      tt = setInterval(() => {
        const x = Math.floor((Date.now() - s) / 1000);
        $("#cst").textContent =
          Math.floor(x / 60) + ":" + String(x % 60).padStart(2, "0");
      }, 1000);
    }
    if (["failed", "closed"].includes(pc.connectionState)) {
      if (pc.connectionState === "failed")
        toast("Call failed: could not connect through the network");
      endCall(1);
    }
  };
  cu.push(
    ref.collection("cand").onSnapshot((q) =>
      q.docChanges().forEach((ch) => {
        if (ch.type === "added" && ch.doc.data().by !== me.uid) {
          const c = new RTCIceCandidate(JSON.parse(ch.doc.data().c));
          pc && pc.remoteDescription
            ? pc.addIceCandidate(c).catch(() => {})
            : pc2.push(c);
        }
      }),
    ),
  );
  cu.push(
    ref.onSnapshot((d) => {
      const x = d.data();
      if (!x || !pc) return;
      if (x.status === "ended") endCall(1, x);
      if (x.answer && x.from === me.uid && !pc.currentRemoteDescription)
        pc.setRemoteDescription(x.answer).then(flush);
    }),
  );
}
async function startCall(v) {
  const u = U[cur];
  if (!u || pc) return;
  lstream = await media(v);
  if (!lstream) return;
  callRef = db.collection("calls").doc();
  callMeta = { id: callRef.id, from: me.uid, to: cur, video: v, ts: Date.now() };
  callUI(u, v, "Calling…");
  mkpc(callRef);
  const o = await pc.createOffer();
  await pc.setLocalDescription(o);
  await callRef.set({
    from: me.uid,
    to: cur,
    video: v,
    status: "ringing",
    ts: Date.now(),
    offer: { type: o.type, sdp: o.sdp },
  });
  nt = setTimeout(() => {
    toast("No answer");
    endCall();
  }, 45000);
}
async function incoming(id, c) {
  if (!U[c.from]) {
    const d = await db.collection("users").doc(c.from).get();
    U[c.from] = { ...d.data(), id: c.from };
  }
  callRef = db.collection("calls").doc(id);
  callMeta = { id, from: c.from, to: me.uid, video: !!c.video, ts: c.ts || Date.now() };
  inc = c;
  $("#incn").textContent =
    U[c.from].name + " — " + (c.video ? "video" : "voice") + " call";
  $("#inc").style.display = "flex";
}
$("#acc").onclick = async () => {
  $("#inc").style.display = "none";
  lstream = await media(inc.video);
  if (!lstream) return callRef.update({ status: "ended" });
  callUI(U[inc.from], inc.video, "Connecting…");
  mkpc(callRef);
  await pc.setRemoteDescription(inc.offer);
  flush();
  const a = await pc.createAnswer();
  await pc.setLocalDescription(a);
  await callRef.update({
    answer: { type: a.type, sdp: a.sdp },
    status: "active",
  });
};
$("#dec").onclick = () => {
  $("#inc").style.display = "none";
  if (callRef) {
    callRef.update({ status: "ended", dur: 0 }).catch(() => {});
    saveCallMessage(callMeta, 0);
  }
  callRef = null;
  callMeta = null;
};
function saveCallMessage(meta, duration) {
  if (!meta || !meta.id || !meta.from || !meta.to) return;
  const chatId = [meta.from, meta.to].sort().join("_"),
    msg = {
      from: meta.from,
      ts: meta.ts,
      type: "call",
      video: !!meta.video,
      dur: Math.max(0, duration || 0),
    },
    ref = db.collection("chats").doc(chatId);
  ref.set({ members: [meta.from, meta.to], last: prev(msg), lastTs: msg.ts, lastFrom: msg.from }, { merge: true })
    .then(() => ref.collection("messages").doc("call_" + meta.id).set(msg, { merge: true }))
    .catch((err) => toast("Could not save call in chat: " + err.message));
}
function endCall(remote, details) {
  if (!pc && !lstream) return;
  clearTimeout(nt);
  clearInterval(tt);
  const duration = details && Number.isFinite(details.dur)
    ? details.dur
    : conAt ? Math.round((Date.now() - conAt) / 1000) : 0;
  if (!remote && callRef)
    callRef
      .update({
        status: "ended",
        dur: duration,
      })
      .catch(() => {});
  saveCallMessage(callMeta, duration);
  conAt = 0;
  if (pc) pc.close();
  pc = null;
  if (lstream) lstream.getTracks().forEach((t) => t.stop());
  lstream = null;
  cu.forEach((f) => f());
  cu = [];
  callRef = null;
  callMeta = null;
  $("#call").style.display = "none";
  $("#cav2").style.display = "flex";
  $("#rv").srcObject = null;
}
$("#ce").onclick = () => endCall();
$("#vc").onclick = () => startCall(true);
$("#ac").onclick = () => startCall(false);
$("#mt").onclick = (e) => {
  const b = e.currentTarget.classList.toggle("off");
  lstream && lstream.getAudioTracks().forEach((t) => (t.enabled = !b));
};
$("#cm").onclick = (e) => {
  const b = e.currentTarget.classList.toggle("off");
  lstream && lstream.getVideoTracks().forEach((t) => (t.enabled = !b));
};
mode(false);

/* ================= 9. TABS, STATUS and CALL HISTORY ================= */
let tab = "chats",
  ST = [],
  CL = { a: [], b: [] },
  conAt = 0;
const SC = ["#8b6bd6", "#e17076", "#65aadd", "#a695e7", "#faa774", "#202c33"];
const fmt = (s) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");

// Decides which list to draw depending on the selected tab
function renderList() {
  if (me) {
    const n = partners().filter(isUnread).length;
    $("#rbc").textContent = n;
    $("#rbc").style.display = n ? "grid" : "none";
  }
  if (tab === "status") return renderStatus();
  if (tab === "calls") return renderCalls();
  renderChats();
}
document.querySelectorAll("#rail [data-t]").forEach((b) => {
  b.onclick = () => {
    tab = b.dataset.t;
    document
      .querySelectorAll("#rail [data-t]")
      .forEach((x) => x.classList.toggle("on", x === b));
    $("#fab").style.display = tab === "status" ? "block" : "none";
    $("#chips").style.display = tab === "chats" ? "flex" : "none";
    $("#ttl").textContent = {
      chats: "ChatApp",
      calls: "Calls",
      status: "Status",
      channels: "Channels",
      games: "Games",
    }[tab];
    renderList();
  };
});

// Listens to statuses (last 24 hours) and to call history
function startExtra() {
  firstCalls = true;
  setTimeout(() => (firstCalls = false), 4000);
  setTimeout(saveAcct, 3000);
  db.collection("users")
    .doc(me.uid)
    .get()
    .then((d) => {
      // keep the stored email in sync after an email change
      if (d.exists && me.email && d.data().email !== me.email.toLowerCase())
        d.ref.update({ email: me.email.toLowerCase() });
    });
  unsubs.push(
    db
      .collection("statuses")
      .where("ts", ">", Date.now() - 864e5)
      .onSnapshot(
        (q) => {
          ST = q.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => a.ts - b.ts);
          if (tab === "status") renderList();
        },
        (e) => console.log(e),
      ),
  );
  [
    ["from", "a"],
    ["to", "b"],
  ].forEach(([f, k]) =>
    unsubs.push(
      db
        .collection("calls")
        .where(f, "==", me.uid)
        .onSnapshot(
          (q) => {
            CL[k] = q.docs.map((d) => ({ id: d.id, ...d.data() }));
            CL[k].forEach((c) => watch(f === "from" ? c.to : c.from));
            if (tab === "calls") renderList();
          },
          (e) => console.log(e),
        ),
    ),
  );
}

/* ---------- STATUS ---------- */
const visible = (s) =>
  s.uid === me.uid ||
  (!(my.blocked || []).includes(s.uid) && !(U[s.uid]?.blocked || []).includes(me.uid) &&
    (!s.vis || s.vis.includes(me.uid)));
const statusOf = (id) => ST.filter((s) => s.uid === id && visible(s));
const seenAt = (id) => {
  try {
    return +localStorage.getItem("ss_" + id) || 0;
  } catch (e) {
    return 0;
  }
};
function renderStatus() {
  const mine = statusOf(me.uid);
  const ids = [
    ...new Set(
      ST.filter((s) => s.uid !== me.uid && visible(s)).map((s) => s.uid),
    ),
  ];
  ids.forEach(watch); // statuses can come from anyone, so load their profiles
  const rows = ids
    .filter((i) => U[i])
    .map((i) => {
      const L = statusOf(i),
        u = U[i],
        fresh = L[L.length - 1].ts > seenAt(i);
      return `<div class="row" data-s="${i}"><div class="ring ${fresh ? "" : "seen"}">${av(u, 46)}</div><div class="m"><div class="n">${esc(u.name)}</div><div class="s">${tm(L[L.length - 1].ts)}</div></div></div>`;
    });
  $("#list").innerHTML =
    `<div class="row" data-s="${me.uid}">${mine.length ? `<div class="ring">${av(my, 46)}</div>` : av(my, 50)}<div class="m"><div class="n">My status</div><div class="s">${mine.length ? mine.length + " update(s) · " + tm(mine[mine.length - 1].ts) : "Tap ✎ to add a status update"}</div></div></div><p class="sub" style="padding:10px 16px">Recent updates</p>` +
    (rows.length ? rows.join("") : '<p class="emp">No status updates yet.</p>');
}
$("#list").addEventListener("click", (e) => {
  const s = e.target.closest("[data-s]");
  if (s) return viewStatus(s.dataset.s);
  if (e.target.closest("[data-cc]"))
    startCall(e.target.closest("[data-cc]").dataset.cc === "v");
});
$("#fab").onclick = postStatus;
function postStatus() {
  let bg = SC[0],
    img = "",
    busy = false;
  modal(`<h2>New status</h2>
  <img id="stpv" alt="" style="display:none;width:100%;max-height:220px;object-fit:contain;border-radius:10px;background:#000">
  <textarea id="stx" class="stx" rows="3" placeholder="Type a status…" style="background:${bg}"></textarea>
  <div class="sw" id="stc">${SC.map((c) => `<button data-c="${c}" style="background:${c}"></button>`).join("")}</div>
  <label class="btn s g" style="cursor:pointer">📷 Add photo<input type="file" id="sti" accept="image/*" hidden></label>
  <label>Who can see this status?<select id="stv"><option value="all">Everyone on ChatApp</option><option value="contacts">My contacts</option><option value="only">Only share with…</option></select></label>
  <div id="stl" style="display:none;max-height:130px;overflow:auto">${
    partners()
      .filter((i) => U[i])
      .map(
        (i) =>
          `<label class="ck"><input type="checkbox" value="${i}">${esc(U[i].name)}</label>`,
      )
      .join("") || '<p class="sub">No contacts yet.</p>'
  }</div>
  <div class="r2"><button class="btn" id="stp">Post</button><button class="btn g" id="cx">Cancel</button></div>`);
  $("#cx").onclick = closeM;
  $("#stv").onchange = () =>
    ($("#stl").style.display = $("#stv").value === "only" ? "block" : "none");
  $("#stc").onclick = (e) => {
    if (e.target.dataset.c) {
      bg = e.target.dataset.c;
      $("#stx").style.background = bg;
    }
  };
  $("#sti").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    busy = true;
    $("#stp").textContent = "Loading photo…";
    try {
      img = await rs(f, 800, 0.7);
      $("#stpv").src = img;
      $("#stpv").style.display = "block";
      $("#stx").placeholder = "Add a caption (optional)…";
      $("#stx").rows = 2;
    } catch (err) {
      img = "";
      toast("This photo can't be read. Try a JPG or PNG");
    }
    busy = false;
    $("#stp").textContent = "Post";
  };
  $("#stp").onclick = async () => {
    if (busy) return toast("Photo is still loading…");
    const text = $("#stx").value.trim(),
      pv = $("#stv").value;
    if (!text && !img) return toast("Write something or add a photo");
    let vis = null; // null = everyone
    if (pv === "contacts") vis = partners();
    if (pv === "only") {
      vis = [...document.querySelectorAll("#stl input:checked")].map(
        (x) => x.value,
      );
      if (!vis.length) return toast("Select at least one contact");
    }
    $("#stp").disabled = true;
    $("#stp").textContent = "Posting…";
    try {
      await db.collection("statuses").add({
        uid: me.uid,
        type: img ? "image" : "text",
        text,
        bg,
        img,
        vis,
        privacy: pv,
        ts: Date.now(),
      });
      closeM();
      toast("Status posted");
    } catch (err) {
      $("#stp").disabled = false;
      $("#stp").textContent = "Post";
      toast("Could not post: " + err.message);
    }
  };
}
let svL = [],
  svI = 0,
  svU = "",
  svT;
function viewStatus(id) {
  const L = statusOf(id);
  if (!L.length) return id === me.uid ? postStatus() : null;
  svL = L;
  svI = 0;
  svU = id;
  $("#sv").style.display = "flex";
  showSt();
}
function showSt() {
  clearTimeout(svT);
  if (vUn) {
    vUn();
    vUn = null;
  }
  const s = svL[svI];
  if (!s) return closeSt();
  const u = U[svU] || my,
    own = s.uid === me.uid,
    views = db.collection("statuses").doc(s.id).collection("views");
  $("#sv").style.background = s.bg || "#000";
  $("#svn").textContent = u.name + " · " + tm(s.ts);
  $("#svt").textContent = s.text || "";
  $("#svi").style.display = s.type === "image" ? "block" : "none";
  if (s.type === "image") $("#svi").src = s.img;
  $("#svd").style.display = own ? "block" : "none";
  // own status: show who viewed it. Someone else's status: reaction bar + record that I viewed it
  $("#svb").innerHTML = own
    ? '<button id="svv">👁 0</button>'
    : ["❤️", "😂", "😮", "😢", "🙏", "👍"]
        .map((e) => `<button data-e="${e}">${e}</button>`)
        .join("");
  if (own)
    vUn = views.onSnapshot((q) => {
      VW = q.docs.map((d) => ({ id: d.id, ...d.data() }));
      const b = $("#svv");
      if (b) b.textContent = "👁 " + VW.length;
    });
  else
    views
      .doc(me.uid)
      .set({ ts: Date.now(), name: my.name }, { merge: true })
      .catch(() => {});
  const b = $("#pbi");
  b.style.transition = "none";
  b.style.width = "0";
  setTimeout(() => {
    b.style.transition = "width 5s linear";
    b.style.width = "100%";
  }, 30);
  svT = setTimeout(() => {
    svI++;
    showSt();
  }, 5000);
}
function closeSt() {
  clearTimeout(svT);
  if (vUn) {
    vUn();
    vUn = null;
  }
  $("#sv").style.display = "none";
  try {
    localStorage.setItem("ss_" + svU, Date.now());
  } catch (e) {}
  renderList();
}
$("#sv").onclick = (e) => {
  if (e.target.closest("button")) return;
  svI = Math.max(0, svI + (e.clientX < innerWidth / 3 ? -1 : 1));
  showSt();
};
$("#svx").onclick = closeSt;
$("#svd").onclick = async () => {
  await db.collection("statuses").doc(svL[svI].id).delete();
  closeSt();
  toast("Status deleted");
};

/* ---------- CALL HISTORY ---------- */
function renderCalls() {
  const all = [...CL.a, ...CL.b].sort((x, y) => y.ts - x.ts).slice(0, 60);
  $("#list").innerHTML = all.length
    ? all
        .map((c) => {
          const out = c.from === me.uid,
            oid = out ? c.to : c.from,
            u = U[oid] || { name: "…" };
          const miss = !out && !c.answer;
          const info =
            (out ? "↗ Outgoing" : miss ? "↙ Missed" : "↙ Incoming") +
            (c.answer && c.dur
              ? " · " + fmt(c.dur)
              : out && !c.answer
                ? " · No answer"
                : "");
          return `<div class="row" data-u="${oid}">${av(u, 46)}<div class="m"><div class="n" style="${miss ? "color:#e53935" : ""}">${esc(u.name)}<small>${dl(c.ts)}, ${tm(c.ts)}</small></div><div class="s">${c.video ? "📹" : "📞"} ${info}</div></div><button class="ic" data-cc="${c.video ? "v" : "a"}" title="Call again">${c.video ? "📹" : "📞"}</button></div>`;
        })
        .join("")
    : '<p class="emp">No calls yet. Open a chat and tap 📞 or 📹.</p>';
}

/* ================= 10. WhatsApp-Web style extras: filters, favorites, welcome screen ================= */
let flt = "all",
  FAV = new Set();
try {
  FAV = new Set(JSON.parse(localStorage.getItem("fav") || "[]"));
} catch (e) {}
const isUnread = (i) => {
  const c = C[cid(i)];
  return !!(
    c &&
    c.lastFrom &&
    c.lastFrom !== me.uid &&
    c.lastTs > (c.seen?.[me.uid] || 0) &&
    cur !== i
  );
};
const chipOk = (i) =>
  flt === "unread" ? isUnread(i) : flt === "fav" ? FAV.has(i) : true;
document.querySelectorAll("#chips button").forEach((b) => {
  b.onclick = () => {
    flt = b.dataset.f;
    document
      .querySelectorAll("#chips button")
      .forEach((x) => x.classList.toggle("on", x === b));
    renderList();
  };
});
const _hdr = hdr;
hdr = () => {
  _hdr();
  $("#fv").textContent = FAV.has(cur) ? "★" : "☆";
};
$("#fv").onclick = () => {
  FAV.has(cur) ? FAV.delete(cur) : FAV.add(cur);
  try {
    localStorage.setItem("fav", JSON.stringify([...FAV]));
  } catch (e) {}
  hdr();
  renderList();
};
$("#wl-add").onclick = () => $("#add").click();
$("#wl-call").onclick = () =>
  document.querySelector('#rail [data-t="calls"]').click();
$("#wl-st").onclick = () => {
  document.querySelector('#rail [data-t="status"]').click();
  postStatus();
};
$("#wl-set").onclick = () => $("#me").click();
$("#wl-inv").onclick = () => {
  const link = location.href.split("#")[0];
  navigator.clipboard
    ? navigator.clipboard
        .writeText(link)
        .then(() => toast("App link copied. Send it to a friend"))
    : toast(link);
};

/* ================= 11. Video messages, status viewers, account settings ================= */
let firstCalls = true,
  vUn = null,
  VW = [];

// ----- Chat video (stored in small pieces inside Firestore, max 8 MB) -----
$("#att").addEventListener("click", (e) => {
  if (e.target.dataset.a === "video") $("#vdf").click();
});
$("#vdf").onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  if (f.size > 8e6) return toast("Video must be smaller than 8 MB");
  toast("Sending video…");
  const data = await new Promise((r) => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result);
    fr.readAsDataURL(f);
  });
  const parts = data.match(/[\s\S]{1,700000}/g),
    cr = db.collection("chats").doc(cid(cur));
  const m = {
    from: me.uid,
    ts: Date.now(),
    type: "video",
    mb: (f.size / 1e6).toFixed(1),
  };
  try {
    await cr.set(
      {
        members: mem(),
        last: "🎬 Video",
        lastTs: m.ts,
        lastFrom: me.uid,
      },
      { merge: true },
    );
    const ref = cr.collection("messages").doc();
    await Promise.all(
      parts.map((p, i) =>
        ref.collection("parts").doc(String(i).padStart(3, "0")).set({ d: p }),
      ),
    );
    await ref.set(m);
    toast("Video sent");
  } catch (err) {
    toast("Video failed: " + err.message);
  }
};
$("#msgs").addEventListener("click", async (e) => {
  const v = e.target.closest("[data-vid]");
  if (!v) return;
  v.textContent = "Loading video…";
  const q = await msgs()
    .doc(v.dataset.vid)
    .collection("parts")
    .orderBy(firebase.firestore.FieldPath.documentId())
    .get();
  v.outerHTML = `<video controls autoplay playsinline style="max-width:260px;border-radius:6px" src="${q.docs.map((d) => d.data().d).join("")}"></video>`;
});

// ----- Status: viewers list and reactions -----
$("#svb").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.id === "svv") {
    clearTimeout(svT);
    const L = [...VW].sort((x, y) => y.ts - x.ts);
    modal(
      `<h2>Viewed by ${L.length}</h2>` +
        (L.length
          ? L.map(
              (v) =>
                `<div class="ck"><b>${esc(v.name)}</b><span class="sub">${tm(v.ts)}</span><span style="margin-left:auto;font-size:20px">${v.e || ""}</span></div>`,
            ).join("")
          : '<p class="sub">No views yet.</p>') +
        '<button class="btn g" id="cx">Close</button>',
    );
    $("#cx").onclick = closeM;
  } else {
    db.collection("statuses")
      .doc(svL[svI].id)
      .collection("views")
      .doc(me.uid)
      .set({ ts: Date.now(), name: my.name, e: b.dataset.e }, { merge: true });
    toast("Reaction sent " + b.dataset.e);
  }
};

// ----- Account: change email / password, switch account -----
const accts = () => {
  try {
    return JSON.parse(localStorage.getItem("accts") || "[]");
  } catch (e) {
    return [];
  }
};
function saveAcct() {
  const a = accts().filter((x) => x.email !== me.email);
  a.unshift({ email: me.email, name: my.name || me.email });
  try {
    localStorage.setItem("accts", JSON.stringify(a.slice(0, 5)));
  } catch (e) {}
}
const switchTo = async (email) => {
  await pres(false);
  try {
    localStorage.setItem("prefill", email || "");
  } catch (e) {}
  await auth.signOut();
  location.reload();
};
const reauth = async () => {
  const p = $("#cpw0").value;
  if (!p) throw new Error("Enter your current password first");
  await me.reauthenticateWithCredential(
    firebase.auth.EmailAuthProvider.credential(me.email, p),
  );
};
function accountM() {
  modal(`<h2>Account</h2><p class="sub">Signed in as <b>${esc(me.email)}</b></p>
  <input id="cpw0" type="password" placeholder="Current password (needed for changes)">
  <input id="nem" type="email" placeholder="New email"><button class="btn s" id="cem">Change email</button>
  <input id="npw" type="password" placeholder="New password (6+ characters)"><button class="btn s" id="cpw">Change password</button>
  <p class="sub">Switch account</p>
  ${accts()
    .map(
      (a) =>
        `<div class="row" data-sw="${esc(a.email)}"><div class="m"><div class="n">${esc(a.name)}${a.email === me.email ? " (current)" : ""}</div><div class="s">${esc(a.email)}</div></div></div>`,
    )
    .join("")}
  <button class="btn g" id="addacc">＋ Add another account</button><button class="btn g" id="cx">Close</button>`);
  $("#cx").onclick = closeM;
  $("#addacc").onclick = () => switchTo("");
  $("#cem").onclick = async () => {
    const v = $("#nem").value.trim();
    if (!v) return toast("Enter the new email");
    try {
      await reauth();
      await me.verifyBeforeUpdateEmail(v);
      toast("Verification link sent to the new email. Open it to finish.");
    } catch (e) {
      toast(e.message);
    }
  };
  $("#cpw").onclick = async () => {
    const v = $("#npw").value;
    if (v.length < 6) return toast("New password must be 6+ characters");
    try {
      await reauth();
      await me.updatePassword(v);
      toast("Password changed");
    } catch (e) {
      toast(e.message);
    }
  };
  $("#ov")
    .querySelectorAll("[data-sw]")
    .forEach(
      (r) =>
        (r.onclick = () => r.dataset.sw !== me.email && switchTo(r.dataset.sw)),
    );
}
const oldMe = $("#me").onclick;
$("#me").onclick = () => {
  oldMe();
  document
    .querySelector("#ov .pan")
    .insertAdjacentHTML(
      "beforeend",
      '<button class="btn g" id="acm">Account: email, password, switch account</button>',
    );
  $("#acm").onclick = accountM;
};
try {
  const pf = localStorage.getItem("prefill");
  if (pf) {
    $("#ae").value = pf;
    localStorage.removeItem("prefill");
  }
} catch (e) {}

/* ================= 12. Groups, slide menu, translate, big reaction picker ================= */
const isG = (id) => !!(C[id] && C[id].group);
const mem = () => (isG(cur) ? C[cur].members : [me.uid, cur]);
const TR = {};
const _rl = renderList;
renderList = () => {
  Object.values(C).forEach((c) => c.group && c.members.forEach(watch));
  _rl();
};

// header: groups show their name and members
const _hdr3 = hdr;
hdr = () => {
  const g = isG(cur) ? C[cur] : null;
  if (g) {
    $("#cn").textContent = g.name;
    $("#cav").innerHTML = av({ name: g.name }, 40);
    $("#cs2").textContent = g.members
      .map((m) => (m === me.uid ? "You" : U[m]?.name || "…"))
      .join(", ");
  } else _hdr3();
  $("#fv").textContent = FAV.has(cur)
    ? "★ Remove from favorites"
    : "☆ Add to favorites";
  $("#vc").style.display = $("#ac").style.display = g ? "none" : "";
  const blockButton = $("#bl");
  if (blockButton) blockButton.textContent = (my.blocked || []).includes(cur) ? "✅ Unblock user" : "🚫 Block user";
};
const oldHd = $("#hd").onclick;
$("#hd").onclick = () => (isG(cur) ? groupInfo() : oldHd());
$("#ci").onclick = $("#hd").onclick;
function newGroup() {
  const ps = partners().filter((i) => U[i]);
  modal(`<h2>New group</h2><input id="gn" placeholder="Group name"><p class="sub">Select members</p>
  <div style="max-height:200px;overflow:auto">${ps.map((i) => `<label class="ck"><input type="checkbox" value="${i}">${av(U[i], 32)}${esc(U[i].name)}</label>`).join("") || '<p class="sub">Add some contacts first.</p>'}</div>
  <div class="r2"><button class="btn" id="gc">Create</button><button class="btn g" id="cx">Cancel</button></div>`);
  $("#cx").onclick = closeM;
  $("#gc").onclick = async () => {
    const n = $("#gn").value.trim(),
      sel = [
        ...document.querySelectorAll("#ov input[type=checkbox]:checked"),
      ].map((x) => x.value);
    if (!n) return toast("Enter a group name");
    if (!sel.length) return toast("Select at least one member");
    const ref = db.collection("chats").doc(),
      d = {
        group: true,
        name: n,
        admin: me.uid,
        members: [me.uid, ...sel],
        last: "Group created",
        lastTs: Date.now(),
        lastFrom: me.uid,
      };
    try {
      await ref.set(d);
      C[ref.id] = d;
      closeM();
      openChat(ref.id);
    } catch (e) {
      toast(e.message);
    }
  };
}
// ➕ button: New contact / New group
const addContact = $("#add").onclick;
$("#add").onclick = (e) => {
  e.stopPropagation();
  $("#pm").style.display = "block";
};
$("#pm").onclick = (e) => {
  const b = e.target.closest("button");
  if (b) b.dataset.k === "c" ? addContact() : newGroup();
};
// ⋮ button: slide-in menu with all chat options
$("#hm").insertAdjacentHTML("beforeend", '<button id="bl">🚫 Block user</button>');
$("#bl").onclick = async (e) => {
  e.stopPropagation();
  if (isG(cur)) return toast("Block is available in direct chats");
  const blocked = (my.blocked || []).includes(cur);
  try {
    await db.collection("users").doc(me.uid).update({
      blocked: blocked ? FV.arrayRemove(cur) : FV.arrayUnion(cur),
    });
    $("#bl").textContent = blocked ? "🚫 Block user" : "✅ Unblock user";
    toast(blocked ? "User unblocked" : "User blocked");
  } catch (err) { toast("Could not update block list: " + err.message); }
};
$("#more").onclick = (e) => {
  e.stopPropagation();
  $("#hm").classList.toggle("open");
};
document.addEventListener("click", () => {
  $("#pm").style.display = "none";
  $("#hm").classList.remove("open");
});

// Translate
const LANGS = {
  en: "English",
  ur: "Urdu",
  hi: "Hindi",
  pa: "Punjabi",
  ar: "Arabic",
  es: "Spanish",
  fr: "French",
  de: "German",
  tr: "Turkish",
  zh: "Chinese",
  ru: "Russian",
};
const tl = () => {
  try {
    return localStorage.getItem("tl") || "en";
  } catch (e) {
    return "en";
  }
};
async function translate(text, to) {
  try {
    const r = await fetch(
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t&tl=" +
        to +
        "&q=" +
        encodeURIComponent(text),
    );
    const j = await r.json();
    return j[0].map((x) => x[0]).join("");
  } catch (e) {
    const r = await fetch(
      "https://api.mymemory.translated.net/get?q=" +
        encodeURIComponent(text) +
        "&langpair=autodetect|" +
        to,
    );
    const j = await r.json();
    if (!j.responseData || !j.responseData.translatedText)
      throw new Error("service unavailable");
    return j.responseData.translatedText;
  }
}
$("#tr").onclick = () => {
  modal(
    `<h2>Translate messages to</h2><select id="tls">${Object.entries(LANGS)
      .map(
        ([k, v]) =>
          `<option value="${k}" ${k === tl() ? "selected" : ""}>${v}</option>`,
      )
      .join(
        "",
      )}</select><p class="sub">Open a message's ⌄ menu and tap Translate.</p><button class="btn" id="tlk">Save</button>`,
  );
  $("#tlk").onclick = () => {
    try {
      localStorage.setItem("tl", $("#tls").value);
    } catch (e) {}
    closeM();
    toast("Saved");
  };
};
$("#menu").addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b || !("tr" in b.dataset)) return;
  const id = $("#menu").dataset.id,
    m = MS.find((x) => x.id === id);
  toast("Translating…");
  try {
    TR[id] = await translate(m.text, tl());
    draw();
  } catch (err) {
    toast("Translate failed: " + err.message);
  }
});

// Reactions: "＋" opens the full emoji list, like WhatsApp
const EM =
  "👍❤️😂😮😢🙏🔥🎉😍😎🤣😊🥰😘😁😅😭😡🤔👏🙌💯✅❌👀🤝💪😴🤩😇🥳😜🤗😬😱🤯💔⭐🌹☕🍕⚽🎂".match(
    /\p{Extended_Pictographic}\uFE0F?/gu,
  );
new MutationObserver(() => {
  const er = $("#menu .er");
  if (er && !er.querySelector("[data-more]"))
    er.insertAdjacentHTML("beforeend", "<button data-more>＋</button>");
}).observe($("#menu"), { childList: true });
$("#menu").addEventListener("click", (e) => {
  const b = e.target.closest("[data-more]");
  if (!b) return;
  e.stopPropagation();
  b.closest(".er").insertAdjacentHTML(
    "afterend",
    `<div class="eg">${EM.map((x) => `<button data-r="${x}">${x}</button>`).join("")}</div>`,
  );
  b.remove();
  const mn = $("#menu");
  mn.style.left =
    Math.max(
      8,
      Math.min(parseInt(mn.style.left), innerWidth - mn.offsetWidth - 8),
    ) + "px";
  mn.style.top =
    Math.max(
      8,
      Math.min(parseInt(mn.style.top), innerHeight - mn.offsetHeight - 8),
    ) + "px";
});

/* ================= 13. Group admin tools, delete chat, reply, notifications ================= */
let replying = null;
const vis = (c) => (c && (c.hidden?.[me.uid] || 0) >= c.lastTs ? null : c); // chat hidden by "Delete chat"
const gref = () => db.collection("chats").doc(cur);
function sendText(v) {
  send({ type: "text", text: v, ...(replying ? { rep: replying } : {}) });
  replying = null;
  $("#ed").style.display = "none";
}
$("#edx").addEventListener("click", () => (replying = null));
$("#menu").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || !("rp" in b.dataset)) return;
  const m = MS.find((x) => x.id === $("#menu").dataset.id);
  replying = {
    n: m.from === me.uid ? "You" : U[m.from]?.name || "",
    t: m.text.slice(0, 80),
  };
  $("#edt").textContent = "↩️ Replying to " + replying.n + ": " + replying.t;
  $("#ed").style.display = "flex";
  mi.focus();
});
function closeChatView() {
  cur = null;
  if (msgUn) msgUn();
  $("#chat").style.display = "none";
  $("#empty").style.display = "flex";
  document.body.classList.remove("chat");
  renderList();
}
$("#dc").onclick = async () => {
  if (
    !C[cid(cur)] ||
    !confirm("Delete this chat for you? Other people keep their copy.")
  )
    return;
  try {
    await db
      .collection("chats")
      .doc(cid(cur))
      .set(
        { members: mem(), hidden: { [me.uid]: Date.now() } },
        { merge: true },
      );
  } catch (e) {
    return toast(e.message);
  }
  closeChatView();
  toast("Chat deleted");
};
// ---- Group info: add / remove members, rename, leave, delete ----
function groupInfo() {
  const g = C[cur],
    adm = g.admin === me.uid;
  modal(
    `<div style="display:grid;place-items:center;gap:8px">${av({ name: g.name }, 90)}<h2>${esc(g.name)}</h2><p class="sub">Group · ${g.members.length} members</p></div>` +
      g.members
        .map(
          (m) =>
            `<div class="ck"><b>${esc(m === me.uid ? "You" : U[m]?.name || "…")}</b><span style="margin-left:auto" class="sub">${m === g.admin ? "Admin" : ""}</span>${adm && m !== me.uid ? `<button class="ic" data-rm="${m}" title="Remove">✕</button>` : ""}</div>`,
        )
        .join("") +
      (adm
        ? '<button class="btn g" id="gad">＋ Add member</button><button class="btn g" id="grn">✏️ Rename group</button>'
        : "") +
      '<button class="btn g" id="glv" style="color:#e53935">🚪 Leave group</button>' +
      (adm
        ? '<button class="btn g" id="gdl" style="color:#e53935">🗑 Delete group for everyone</button>'
        : "") +
      '<button class="btn g" id="cx">Close</button>',
  );
  $("#cx").onclick = closeM;
  $("#ov")
    .querySelectorAll("[data-rm]")
    .forEach(
      (b) =>
        (b.onclick = async () => {
          await gref().update({ members: FV.arrayRemove(b.dataset.rm) });
          closeM();
          toast("Member removed");
        }),
    );
  if (adm) {
    $("#grn").onclick = async () => {
      const n = prompt("New group name", g.name);
      if (n && n.trim()) {
        await gref().update({ name: n.trim() });
        closeM();
      }
    };
    $("#gad").onclick = () => {
      const ps = partners().filter((i) => U[i] && !g.members.includes(i));
      modal(
        `<h2>Add members</h2>${ps.map((i) => `<label class="ck"><input type="checkbox" value="${i}">${av(U[i], 32)}${esc(U[i].name)}</label>`).join("") || '<p class="sub">All your contacts are already in this group.</p>'}<div class="r2"><button class="btn" id="gok">Add</button><button class="btn g" id="cx">Cancel</button></div>`,
      );
      $("#cx").onclick = closeM;
      $("#gok").onclick = async () => {
        const sel = [...document.querySelectorAll("#ov input:checked")].map(
          (x) => x.value,
        );
        if (sel.length) await gref().update({ members: FV.arrayUnion(...sel) });
        closeM();
        toast("Members added");
      };
    };
    $("#gdl").onclick = async () => {
      if (!confirm("Delete this group for everyone?")) return;
      const q = await msgs().limit(450).get(),
        bt = db.batch();
      q.docs.forEach((d) => bt.delete(d.ref));
      await bt.commit();
      await gref().delete();
      closeM();
      closeChatView();
      toast("Group deleted");
    };
  }
  $("#glv").onclick = async () => {
    if (!confirm("Leave this group?")) return;
    const rest = g.members.filter((x) => x !== me.uid);
    if (!rest.length) await gref().delete();
    else
      await gref().update({
        members: FV.arrayRemove(me.uid),
        ...(adm ? { admin: rest[0] } : {}),
      });
    closeM();
    closeChatView();
    toast("You left the group");
  };
}
// ---- Browser notifications for new messages ----
const NT = {};
function notify() {
  Object.entries(C).forEach(([id, c]) => {
    const p = NT[id];
    NT[id] = c.lastTs;
    if (
      p === undefined ||
      !c.lastTs ||
      c.lastTs <= p ||
      c.lastFrom === me.uid ||
      (cur === id && !document.hidden)
    )
      return;
    if (window.Notification && Notification.permission === "granted")
      new Notification(
        c.group ? c.name : U[c.lastFrom]?.name || "New message",
        { body: c.last },
      );
  });
}
const _rl2 = renderList;
renderList = () => {
  _rl2();
  if (me) notify();
};
document.addEventListener(
  "click",
  () => {
    if (window.Notification && Notification.permission === "default")
      Notification.requestPermission();
  },
  { once: true },
);

/* ================= 14. ChatApp AI assistant (like Meta AI) ================= */
// Uses the Google Gemini API (free tier). Get a key at https://aistudio.google.com/apikey
// Either paste it below, or let every user paste their own with the 🔑 button in the AI chat.
const AI_KEY = "";
const AI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
]; // tried in this order if one is busy
const BOT_SVG = `<svg viewBox='0 0 24 24' fill='none' stroke='#fff' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><rect x='4' y='8' width='16' height='11' rx='3'/><path d='M12 8V4.5'/><circle cx='12' cy='3.4' r='1'/><circle cx='9' cy='13' r='1.3' fill='#fff'/><circle cx='15' cy='13' r='1.3' fill='#fff'/><path d='M9.5 16.5h5M2 12v3M22 12v3'/></svg>`;
const AI_SYS = `You are ChatApp AI, a friendly assistant inside ChatApp, a WhatsApp-style web chat app. Reply in the language the user writes in (English, Urdu or Roman Urdu), clearly and briefly. You can answer general questions, write or improve messages, translate and give ideas. App help: add contacts with ➕ (email or phone); groups via ➕ > New group (admin can add/remove members, everyone can leave); Status tab for status with privacy and reactions; voice and video calls from the ⋮ menu in a chat; voice notes with the 🎤 button; photo, video and polls with 📎; the ⌄ button on a message to react, reply, edit, delete or translate; profile, theme and account settings via your avatar at the bottom left.`;
const aiKey = () => {
  try {
    return localStorage.getItem("aik") || AI_KEY;
  } catch (e) {
    return AI_KEY;
  }
};
let AIH = [];
// Ask Google which models this key can use, so a renamed or retired model never breaks the AI
let MODELS = null;
async function getModels(key) {
  if (MODELS) return MODELS;
  let found = [];
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${key}`,
    );
    const j = await r.json();
    found = (j.models || [])
      .filter(
        (m) =>
          (m.supportedGenerationMethods || []).includes("generateContent") &&
          /flash/.test(m.name) &&
          !/image|tts|live|audio|embed|vision|thinking|exp|preview/.test(
            m.name,
          ),
      )
      .map((m) => m.name.replace("models/", ""))
      .sort(
        (a, b) =>
          a.includes("lite") - b.includes("lite") ||
          b.localeCompare(a, undefined, { numeric: true }),
      );
  } catch (e) {}
  MODELS = (found.length ? found : AI_MODELS).slice(0, 4);
  return MODELS;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function askAI(history, system, onText) {
  const key = aiKey();
  let h = history.slice(-16);
  while (h.length && !h[0].me) h.shift(); // Gemini needs the first message to come from the user
  let lastErr;
  for (const model of await getModels(key)) {
    for (let t = 0; t < 2; t++) {
      try {
        const body = {
          systemInstruction: { parts: [{ text: system }] },
          contents: h.map((m) => ({
            role: m.me ? "user" : "model",
            parts: [{ text: m.x }],
          })),
          generationConfig: {
            maxOutputTokens: 900,
            ...(model.includes("2.5")
              ? { thinkingConfig: { thinkingBudget: 0 } }
              : {}),
          },
        };
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          const msg = j.error?.message || "HTTP " + r.status;
          if (
            [404, 429, 500, 503].includes(r.status) ||
            /demand|overload|busy/i.test(msg)
          ) {
            lastErr = new Error(msg);
            if (t === 0 && r.status !== 404) await sleep(1200);
            else break;
            continue;
          }
          throw new Error(msg);
        }
        // read the answer as it streams in, so text appears immediately
        const rd = r.body.getReader(),
          dec = new TextDecoder();
        let buf = "",
          out = "";
        for (;;) {
          const { done, value } = await rd.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop();
          for (const ln of lines) {
            if (!ln.startsWith("data:")) continue;
            try {
              const tx =
                JSON.parse(ln.slice(5))
                  .candidates?.[0]?.content?.parts?.map((p) => p.text || "")
                  .join("") || "";
              if (tx) {
                out += tx;
                if (onText) onText(out);
              }
            } catch (e) {}
          }
        }
        if (out) return out;
        lastErr = new Error("Empty answer");
      } catch (e) {
        if (
          !/demand|overload|busy|Failed to fetch|NetworkError/i.test(e.message)
        )
          throw e;
        lastErr = e;
      }
    }
  }
  throw new Error(
    "AI is not available right now: " +
      (lastErr ? lastErr.message : "unknown error"),
  );
}
function keyM() {
  modal(
    `<h2>🔑 AI key</h2><p class="sub">ChatApp AI needs a free Gemini API key. Create one at aistudio.google.com/apikey and paste it here. It is saved only in this browser.</p><input id="aikv" placeholder="Paste API key" value="${esc(aiKey())}"><div class="r2"><button class="btn" id="aiks">Save</button><button class="btn g" id="cx">Cancel</button></div>`,
  );
  $("#cx").onclick = closeM;
  $("#aiks").onclick = () => {
    try {
      localStorage.setItem("aik", $("#aikv").value.trim());
    } catch (e) {}
    closeM();
    toast("AI key saved");
  };
}
const fmtAI = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
function drawAI(typing) {
  const M = $("#aim");
  M.innerHTML =
    (AIH.length
      ? ""
      : '<div class="msg in">Hi! I\'m ChatApp AI. Ask me anything, or ask how to use ChatApp (groups, status, calls…). I reply in English, Urdu or Roman Urdu.</div>') +
    AIH.map(
      (m) =>
        `<div class="msg ${m.me ? "out" : "in"}">${fmtAI(m.x)}<span class="t">${tm(m.ts)}</span></div>`,
    ).join("") +
    (typing ? '<div class="msg in">…</div>' : "");
  M.scrollTop = M.scrollHeight;
}
const saveAIH = () => {
  try {
    localStorage.setItem("aih_" + me.uid, JSON.stringify(AIH.slice(-40)));
  } catch (e) {}
};
function openAI() {
  cur = null;
  if (msgUn) msgUn();
  $("#empty").style.display = $("#chat").style.display = "none";
  $("#aip").style.display = "flex";
  document.body.classList.add("chat");
  try {
    AIH = JSON.parse(localStorage.getItem("aih_" + me.uid) || "[]");
  } catch (e) {
    AIH = [];
  }
  drawAI();
  renderList();
}
async function sendAI() {
  const v = $("#aii").value.trim();
  if (!v) return;
  if (!aiKey()) return keyM();
  $("#aii").value = "";
  AIH.push({ me: 1, x: v, ts: Date.now() });
  drawAI(true);
  try {
    const a = await askAI(AIH, AI_SYS, (t) => {
      // update the reply while it streams in
      if (AIH[AIH.length - 1].me) AIH.push({ me: 0, x: t, ts: Date.now() });
      else AIH[AIH.length - 1].x = t;
      drawAI();
    });
    if (AIH[AIH.length - 1].me) AIH.push({ me: 0, x: a, ts: Date.now() });
    else AIH[AIH.length - 1].x = a;
  } catch (e) {
    AIH.push({ me: 0, x: "Error: " + e.message, ts: Date.now() });
  }
  saveAIH();
  drawAI();
}
$("#ais").onclick = sendAI;
$("#aii").onkeydown = (e) => {
  if (e.key === "Enter") sendAI();
};
$("#aik").onclick = keyM;
$("#aic").onclick = () => {
  AIH = [];
  saveAIH();
  drawAI();
};
$("#aib").onclick = () => {
  $("#aip").style.display = "none";
  $("#empty").style.display = "flex";
  document.body.classList.remove("chat");
};
$("#rai").onclick = openAI;
$("#wl-ai").onclick = openAI;
const _oc = openChat;
openChat = (id) => {
  $("#aip").style.display = "none";
  _oc(id);
};
const _rc = renderChats;
renderChats = () => {
  _rc();
  if (!$("#q").value && flt === "all")
    $("#list").insertAdjacentHTML(
      "afterbegin",
      `<div class="row" data-ai><div class="av bot" style="width:46px;height:46px">${BOT_SVG}</div><div class="m"><div class="n">ChatApp AI</div><div class="s">Ask me anything</div></div></div>`,
    );
};
$("#list").addEventListener("click", (e) => {
  if (e.target.closest("[data-ai]")) openAI();
});
// ⋮ menu: summarize the open chat with AI
$("#sm").onclick = async () => {
  if (!aiKey()) {
    keyM();
    return;
  }
  const lines = MS.filter((m) => m.type === "text" && !m.del)
    .slice(-40)
    .map(
      (m) =>
        (m.from === me.uid ? "Me" : U[m.from]?.name || "Them") + ": " + m.text,
    );
  if (lines.length < 2) return toast("Not enough messages to summarize");
  toast("Summarizing…");
  try {
    const a = await askAI(
      [
        {
          me: 1,
          x:
            "Summarize this chat in 3-5 short bullet points, in the same language the chat uses:\n" +
            lines.join("\n"),
        },
      ],
      AI_SYS,
    );
    modal(
      `<h2>AI chat summary</h2><p style="white-space:pre-wrap">${fmtAI(a)}</p><button class="btn g" id="cx">Close</button>`,
    );
    $("#cx").onclick = closeM;
  } catch (e) {
    toast(e.message);
  }
};

/* ================= 15. Delete any message for me ================= */
new MutationObserver(() => {
  const mn = $("#menu");
  if (mn.children.length && !mn.querySelector("[data-dm]"))
    mn.insertAdjacentHTML(
      "beforeend",
      '<button class="a" data-dm>🗑 Delete for me</button>',
    );
}).observe($("#menu"), { childList: true });
$("#menu").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b && "dm" in b.dataset)
    msgs()
      .doc($("#menu").dataset.id)
      .update({ delFor: FV.arrayUnion(me.uid) })
      .then(() => toast("Message deleted for you"));
});

/* ================= 16. Chat theme (background colour / image, font) and hide translation ================= */
const FONTS = {
  Default: "",
  Arial: "Arial, Helvetica, sans-serif",
  Serif: 'Georgia, "Times New Roman", serif',
  Cursive: '"Segoe Script", "Brush Script MT", "Comic Sans MS", cursive',
  Monospace: '"Courier New", monospace',
  Verdana: "Verdana, Geneva, sans-serif",
};
const ctKey = () => "ct_" + cid(cur);
const getCT = () => {
  try {
    return JSON.parse(localStorage.getItem(ctKey()) || "{}");
  } catch (e) {
    return {};
  }
};
function setCT(t) {
  try {
    localStorage.setItem(ctKey(), JSON.stringify(t));
  } catch (e) {
    toast("Not enough storage for this image. Try a smaller one");
  }
  applyCT();
}
function applyCT() {
  const t = cur ? getCT() : {},
    m = $("#msgs");
  m.style.backgroundColor = t.bg || "";
  m.style.backgroundImage = t.img ? `url(${t.img})` : "";
  m.style.backgroundSize = t.img ? "cover" : "";
  m.style.backgroundPosition = "center";
  m.style.fontFamily = FONTS[t.font] || "";
}
const _oc2 = openChat;
openChat = (id) => {
  _oc2(id);
  applyCT();
};
$("#ct").onclick = () => {
  const t = getCT();
  modal(`<h2>Chat theme</h2><p class="sub">Only for this chat, on this device.</p>
  <div class="sub">Background colour</div>
  <div class="sw" id="tcs">${["#efeae2", "#d7e8d0", "#cfe4f7", "#f3d9e6", "#f5e9c8", "#2b2f36", "#0b141a", "#1f2c34", "#3b1f3f", "#0f3d3e"].map((c) => `<button data-c="${c}" style="background:${c}"></button>`).join("")}</div>
  <label>Custom colour<input type="color" id="tcc" value="${t.bg || "#efeae2"}" style="height:40px;padding:2px"></label>
  <label class="btn s g" style="cursor:pointer">🖼 Choose background image<input type="file" id="tci" accept="image/*" hidden></label>
  <label>Font<select id="tcf">${Object.keys(FONTS)
    .map(
      (k) =>
        `<option ${(t.font || "Default") === k ? "selected" : ""}>${k}</option>`,
    )
    .join("")}</select></label>
  <div class="r2"><button class="btn g" id="tcr">Reset</button><button class="btn" id="tcx">Done</button></div>`);
  const upd = (o) => setCT({ ...getCT(), ...o });
  $("#tcs").onclick = (e) => {
    if (e.target.dataset.c) upd({ bg: e.target.dataset.c, img: "" });
  };
  $("#tcc").oninput = (e) => upd({ bg: e.target.value, img: "" });
  $("#tcf").onchange = (e) => upd({ font: e.target.value });
  $("#tci").onchange = async (e) => {
    if (e.target.files[0]) upd({ img: await rs(e.target.files[0], 1100, 0.6) });
  };
  $("#tcr").onclick = () => {
    try {
      localStorage.removeItem(ctKey());
    } catch (e) {}
    applyCT();
    closeM();
    toast("Theme reset");
  };
  $("#tcx").onclick = closeM;
};
// tap a translation to hide it
$("#msgs").addEventListener("click", (e) => {
  const t = e.target.closest(".trn");
  if (t) {
    delete TR[t.dataset.id];
    draw();
  }
});

/* ================= 17. CHANNELS (news / tips) and GAMES ================= */
// Put the email(s) of the people who may post in channels here, e.g. ["you@gmail.com"]. The same email must be in the Firestore rules.
const CH_ADMINS = [];
const CH = [
  {
    id: "cooking",
    name: "Cooking",
    icon: "🍳",
    color: "#f59e0b",
    desc: "Recipes, kitchen tips and food ideas",
    feed: "https://www.budgetbytes.com/feed/",
    tips: [
      "Salt your pasta water generously. It should taste like the sea.",
      "Let meat rest 5-10 minutes after cooking so the juices stay inside.",
    ],
  },
  {
    id: "stitching",
    name: "Stitching",
    icon: "🧵",
    color: "#ec4899",
    desc: "Sewing, embroidery and tailoring tips",
    feed: "",
    tips: [
      "Press every seam before sewing the next step. It gives a professional finish.",
      "Change your needle after about 8 hours of sewing. A dull needle skips stitches.",
    ],
  },
  {
    id: "webdev",
    name: "Web Development",
    icon: "💻",
    color: "#3b82f6",
    desc: "HTML, CSS, JavaScript and web news",
    feed: "https://dev.to/feed/tag/webdev",
    tips: [
      "Use semantic HTML (header, nav, main, footer). It helps accessibility and SEO.",
      "Set box-sizing: border-box on all elements to make layouts predictable.",
    ],
  },
  {
    id: "news",
    name: "Breaking News",
    icon: "📰",
    color: "#ef4444",
    desc: "Top headlines from around the world",
    feed: "https://feeds.bbci.co.uk/news/rss.xml",
    tips: [],
  },
  {
    id: "health",
    name: "Health & Fitness",
    icon: "💪",
    color: "#10b981",
    desc: "Health news and wellbeing tips",
    feed: "https://feeds.bbci.co.uk/news/health/rss.xml",
    tips: [
      "Drink water regularly through the day, not only when you feel thirsty.",
    ],
  },
];
const GAMES = [
  {
    id: "ttt",
    name: "Tic-Tac-Toe",
    icon: "❌",
    desc: "Play against the computer",
  },
  {
    id: "mem",
    name: "Memory Match",
    icon: "🧠",
    desc: "Find all the matching pairs",
  },
  { id: "snake", name: "Snake", icon: "🐍", desc: "Eat, grow and don't crash" },
];
const isAdm = () =>
  CH_ADMINS.map((x) => x.toLowerCase()).includes(
    (me.email || "").toLowerCase(),
  );
const strip = (h) =>
  new DOMParser().parseFromString(h, "text/html").body.textContent.trim();
const hideMain = () => {
  $("#empty").style.display =
    $("#chat").style.display =
    $("#aip").style.display =
    $("#chp").style.display =
    $("#gmp").style.display =
      "none";
};
const closeOvp = () => {
  $("#chp").style.display = $("#gmp").style.display = "none";
  $("#empty").style.display = "flex";
  document.body.classList.remove("chat");
  gOff();
  if (chUn) chUn();
  curCH = null;
};
$("#chb").onclick = $("#gb2").onclick = closeOvp;
const _rl3 = renderList;
renderList = () => {
  if (tab === "channels") return renderChannels();
  if (tab === "games") return renderGames();
  _rl3();
};
const _oc3 = openChat;
openChat = (id) => {
  $("#chp").style.display = $("#gmp").style.display = "none";
  gOff();
  _oc3(id);
};
const _oa = openAI;
openAI = () => {
  $("#chp").style.display = $("#gmp").style.display = "none";
  _oa();
};
$("#rai").onclick = $("#wl-ai").onclick = () => openAI();

/* ----- Channels ----- */
let curCH = null,
  chUn = null,
  chPosts = [];
const FEEDS = {};
const follows = () => my.follows || [];
const toggleFollow = (id) =>
  db
    .collection("users")
    .doc(me.uid)
    .update({
      follows: follows().includes(id) ? FV.arrayRemove(id) : FV.arrayUnion(id),
    })
    .then(() => toast(follows().includes(id) ? "Following" : "Unfollowed"));
function renderChannels() {
  const row = (c) =>
    `<div class="row" data-ch="${c.id}"><div class="av" style="background:${c.color};width:46px;height:46px;font-size:22px">${c.icon}</div><div class="m"><div class="n">${c.name}</div><div class="s">${c.desc}</div></div><button class="btn s ${follows().includes(c.id) ? "g" : ""}" style="width:auto" data-fl="${c.id}">${follows().includes(c.id) ? "Following" : "Follow"}</button></div>`;
  const mine = CH.filter((c) => follows().includes(c.id)),
    rest = CH.filter((c) => !follows().includes(c.id));
  $("#list").innerHTML =
    (mine.length
      ? '<p class="sub" style="padding:12px 16px">Following</p>' +
        mine.map(row).join("")
      : "") +
    '<p class="sub" style="padding:12px 16px">Find channels</p>' +
    rest.map(row).join("");
  if (curCH)
    $("#chf").textContent = follows().includes(curCH.id)
      ? "Following"
      : "Follow";
}
async function openChannel(id) {
  const c = CH.find((x) => x.id === id);
  hideMain();
  curCH = c;
  $("#chp").style.display = "flex";
  document.body.classList.add("chat");
  $("#chi").style.background = c.color;
  $("#chi").textContent = c.icon;
  $("#chn").textContent = c.name;
  $("#chd").textContent = c.desc;
  $("#chf").textContent = follows().includes(id) ? "Following" : "Follow";
  $("#chbar").style.display = isAdm() ? "flex" : "none";
  chPosts = [];
  if (chUn) chUn();
  chUn = db
    .collection("channelPosts")
    .where("ch", "==", id)
    .onSnapshot(
      (q) => {
        chPosts = q.docs.map((d) => ({ id: d.id, ...d.data(), t: "post" }));
        drawCH();
      },
      (e) => toast(e.message),
    );
  drawCH();
  if (c.feed && !FEEDS[id]) {
    FEEDS[id] = [];
    try {
      const j = await (
        await fetch(
          "https://api.rss2json.com/v1/api.json?rss_url=" +
            encodeURIComponent(c.feed),
        )
      ).json();
      FEEDS[id] = (j.items || []).map((i) => ({
        t: "feed",
        title: i.title,
        text: strip(i.description || "").slice(0, 220),
        link: i.link,
        img: i.thumbnail || i.enclosure?.link || "",
        ts: Date.parse((i.pubDate || "").replace(" ", "T") + "Z") || 2,
        src: j.feed?.title || "News feed",
      }));
    } catch (e) {
      FEEDS[id] = [];
    }
    if (curCH === c) drawCH();
  }
}
function drawCH() {
  const c = curCH;
  if (!c) return;
  const items = [
    ...c.tips.map((x) => ({ t: "tip", text: x, ts: 1 })),
    ...(FEEDS[c.id] || []),
    ...chPosts,
  ].sort((a, b) => b.ts - a.ts);
  $("#chm").innerHTML = items.length
    ? items
        .map(
          (p) =>
            `<div class="post">${p.img ? `<img src="${esc(p.img)}" referrerpolicy="no-referrer" loading="lazy" alt="">` : ""}${p.title ? `<b>${esc(p.title)}</b>` : ""}<div>${esc(p.text)}</div>${p.link && /^https?:/.test(p.link) ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">Read more ↗</a>` : ""}<small>${p.t === "tip" ? "Tip" : p.t === "feed" ? esc(p.src) : esc(p.byName || "Admin")}${p.ts > 2 ? " · " + dl(p.ts) + ", " + tm(p.ts) : ""}${isAdm() && p.t === "post" ? ` <button data-dp="${p.id}">🗑</button>` : ""}</small></div>`,
        )
        .join("")
    : '<p class="emp">No posts yet.</p>';
}
$("#chf").onclick = () => curCH && toggleFollow(curCH.id);
$("#chs").onclick = async () => {
  const text = $("#chx").value.trim();
  if (!text) return;
  try {
    await db
      .collection("channelPosts")
      .add({ ch: curCH.id, text, by: me.uid, byName: my.name, ts: Date.now() });
    $("#chx").value = "";
  } catch (e) {
    toast("Could not post: " + e.message);
  }
};
$("#chx").onkeydown = (e) => {
  if (e.key === "Enter") $("#chs").click();
};
$("#chm").onclick = (e) => {
  const d = e.target.closest("[data-dp]");
  if (d && confirm("Delete this post?"))
    db.collection("channelPosts").doc(d.dataset.dp).delete();
};

/* ----- Games ----- */
let gOff = () => {};
function renderGames() {
  $("#list").innerHTML =
    '<p class="sub" style="padding:12px 16px">Free time? Play a game 🎮</p>' +
    GAMES.map(
      (g) =>
        `<div class="row" data-g="${g.id}"><div class="av" style="background:#6366f1;width:46px;height:46px;font-size:22px">${g.icon}</div><div class="m"><div class="n">${g.name}</div><div class="s">${g.desc}</div></div></div>`,
    ).join("");
}
function openGame(id) {
  gOff();
  gOff = () => {};
  hideMain();
  $("#gmp").style.display = "flex";
  document.body.classList.add("chat");
  $("#gt").textContent = GAMES.find((g) => g.id === id).name;
  ({ ttt: gameTTT, mem: gameMem, snake: gameSnake })[id]($("#gbody"));
  const r = $("#gr");
  if (r) r.onclick = () => openGame(id);
}
function gameTTT(b) {
  const bd = Array(9).fill(""),
    L = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];
  let over = false;
  b.innerHTML = `<div class="gm"><p id="gs" class="sub">Your turn (X)</p><div class="ttt">${bd.map((_, i) => `<button data-i="${i}"></button>`).join("")}</div><button class="btn s" id="gr" style="width:auto">Restart</button></div>`;
  const win = (p) => L.some((l) => l.every((i) => bd[i] === p));
  const end = () => {
    if (win("X")) {
      over = true;
      $("#gs").textContent = "You win! 🎉";
    } else if (win("O")) {
      over = true;
      $("#gs").textContent = "Computer wins 🤖";
    } else if (!bd.includes("")) {
      over = true;
      $("#gs").textContent = "It's a draw";
    }
    return over;
  };
  const need = (p) =>
    L.map((l) =>
      l.filter((i) => bd[i] === p).length === 2 &&
      l.filter((i) => bd[i] === "").length === 1
        ? l.find((i) => bd[i] === "")
        : -1,
    ).find((x) => x >= 0);
  const cpu = () => {
    let m = need("O");
    if (m === undefined) m = need("X");
    if (m === undefined && bd[4] === "") m = 4;
    if (m === undefined) {
      const e = bd.map((v, i) => (v === "" ? i : -1)).filter((i) => i >= 0);
      m = e[Math.floor(Math.random() * e.length)];
    }
    bd[m] = "O";
  };
  b.querySelector(".ttt").onclick = (e) => {
    const i = e.target.dataset.i;
    if (over || i === undefined || bd[i]) return;
    bd[i] = "X";
    if (!end()) {
      cpu();
      end();
    }
    b.querySelectorAll(".ttt button").forEach(
      (x, k) => (x.textContent = bd[k]),
    );
    if (!over) $("#gs").textContent = "Your turn (X)";
  };
}
function gameMem(b) {
  const E = ["🍎", "🚀", "🎈", "🐱", "⚽", "🌸"],
    cards = [...E, ...E].sort(() => Math.random() - 0.5);
  let open = [],
    moves = 0,
    found = 0,
    lock = false;
  b.innerHTML = `<div class="gm"><p class="sub">Moves: <b id="mv">0</b></p><div class="mem">${cards.map((c, i) => `<button data-i="${i}">?</button>`).join("")}</div><p id="gs" class="sub"></p><button class="btn s" id="gr" style="width:auto">Restart</button></div>`;
  const bt = b.querySelectorAll(".mem button");
  b.querySelector(".mem").onclick = (e) => {
    const i = +e.target.dataset.i;
    if (lock || isNaN(i) || open.includes(i) || bt[i].classList.contains("ok"))
      return;
    bt[i].textContent = cards[i];
    open.push(i);
    if (open.length < 2) return;
    $("#mv").textContent = ++moves;
    const [x, y] = open;
    if (cards[x] === cards[y]) {
      bt[x].classList.add("ok");
      bt[y].classList.add("ok");
      open = [];
      if (++found === 6)
        $("#gs").textContent = "You won in " + moves + " moves! 🎉";
    } else {
      lock = true;
      setTimeout(() => {
        bt[x].textContent = bt[y].textContent = "?";
        open = [];
        lock = false;
      }, 700);
    }
  };
}
function gameSnake(b) {
  b.innerHTML = `<div class="gm"><p class="sub">Score: <b id="sc">0</b> · Arrow keys / WASD or the buttons</p><canvas id="sn" width="300" height="300"></canvas><div class="dpad"><button data-d="U">▲</button><div><button data-d="L">◀</button><button data-d="D">▼</button><button data-d="R">▶</button></div></div><button class="btn s" id="gr" style="width:auto">Restart</button></div>`;
  const cx = $("#sn").getContext("2d"),
    N = 15,
    S = 20,
    V = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
  let sn = [
      [7, 7],
      [6, 7],
      [5, 7],
    ],
    dir = [1, 0],
    nd = [1, 0],
    food = [10, 7],
    score = 0;
  const turn = (d) => {
    const v = V[d];
    if (v && (v[0] !== -dir[0] || v[1] !== -dir[1])) nd = v;
  };
  const kd = (e) => {
    const d = {
      ArrowUp: "U",
      w: "U",
      ArrowDown: "D",
      s: "D",
      ArrowLeft: "L",
      a: "L",
      ArrowRight: "R",
      d: "R",
    }[e.key];
    if (d) {
      e.preventDefault();
      turn(d);
    }
  };
  document.addEventListener("keydown", kd);
  b.querySelector(".dpad").onclick = (e) => turn(e.target.dataset.d);
  const t = setInterval(() => {
    dir = nd;
    const h = [sn[0][0] + dir[0], sn[0][1] + dir[1]];
    if (
      h[0] < 0 ||
      h[1] < 0 ||
      h[0] >= N ||
      h[1] >= N ||
      sn.some((s) => s[0] === h[0] && s[1] === h[1])
    ) {
      clearInterval(t);
      cx.fillStyle = "#fff";
      cx.font = "24px sans-serif";
      cx.fillText("Game over", 95, 150);
      return;
    }
    sn.unshift(h);
    if (h[0] === food[0] && h[1] === food[1]) {
      $("#sc").textContent = ++score;
      do {
        food = [Math.floor(Math.random() * N), Math.floor(Math.random() * N)];
      } while (sn.some((s) => s[0] === food[0] && s[1] === food[1]));
    } else sn.pop();
    cx.fillStyle = "#0b141a";
    cx.fillRect(0, 0, 300, 300);
    cx.fillStyle = "#ef4444";
    cx.fillRect(food[0] * S + 2, food[1] * S + 2, S - 4, S - 4);
    cx.fillStyle = "#a78bfa";
    sn.forEach((s) => cx.fillRect(s[0] * S + 1, s[1] * S + 1, S - 2, S - 2));
  }, 130);
  gOff = () => {
    clearInterval(t);
    document.removeEventListener("keydown", kd);
  };
}
$("#list").addEventListener("click", (e) => {
  const f = e.target.closest("[data-fl]");
  if (f) return toggleFollow(f.dataset.fl);
  const r = e.target.closest("[data-ch]");
  if (r) return openChannel(r.dataset.ch);
  const g = e.target.closest("[data-g]");
  if (g) openGame(g.dataset.g);
});

/* ===== mic / send icon switch (used by the new icon set in style.css) ===== */
const sbSync = () =>
  ($("#sb").dataset.s = $("#sb").textContent.trim() === "🎤" ? "mic" : "send");
new MutationObserver(sbSync).observe($("#sb"), {
  childList: true,
  characterData: true,
  subtree: true,
});
sbSync();
