/* Happy Home — shared data layer for the phone app and the Chrome add-on.
   Two modes:
   - "local": no family account set up yet (firebase-config.js is empty). Data lives on this device only.
   - "cloud": firebase-config.js holds the family's Firebase project. Everyone signs in and shares one family.
*/
(function () {
  "use strict";
  const LOCAL_KEY = "happyhome.v2";
  const FAMILY_COLS = ["tasks", "events", "tx", "shopping", "homework", "notes", "wallet", "moods", "locations", "moodSessions", "bills", "meals", "countdowns", "shopFreq", "stars", "learn", "board", "alarms", "profiles", "songs", "notify", "pushSubs", "plays", "recs"];
  const PRIVATE_COLS = ["myWallet", "myMoodResults"]; // stored under users/{uid}/
  const PRIVATE_PATH = { myWallet: "wallet", myMoodResults: "moodResults" };
  const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

  const defaults = () => ({
    people: [{ id: 1, name: "Dad" }, { id: 2, name: "Mum" }, { id: 3, name: "Kid" }],
    currency: "$",
    categories: ["Groceries", "Bills", "Transport", "School", "Eating out", "Health", "Fun", "Other"],
    budgets: {}
  });
  const emptyState = () => {
    const s = { settings: defaults() };
    FAMILY_COLS.concat(PRIVATE_COLS).forEach(c => (s[c] = []));
    return s;
  };
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");

  const Store = {
    mode: "local",
    phase: "loading", // loading | signedOut | needsFamily | ready
    state: emptyState(),
    me: { uid: null, personId: 1, email: null },
    familyId: null,
    error: null,
    _subs: [],
    _unsubs: [],
    _listeners: [],
    onChange(fn) { this._listeners.push(fn); },
    _emit() { this._listeners.forEach(f => { try { f(this); } catch (e) { console.error(e); } }); },

    init() {
      const cfg = window.HH_FIREBASE_CONFIG;
      if (cfg && cfg.apiKey && window.FB) return this._initCloud(cfg);
      this.mode = "local";
      try { const raw = localStorage.getItem(LOCAL_KEY); if (raw) this.state = Object.assign(emptyState(), JSON.parse(raw)); } catch (e) { }
      this.me = { uid: null, personId: +(this._localPref("me") || 1), email: null };
      this.phase = "ready";
      this._emit();
    },
    _saveLocal() { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(this.state)); } catch (e) { } },
    _localPref(k, v) { try { if (v === undefined) return localStorage.getItem("hh." + k); localStorage.setItem("hh." + k, v); } catch (e) { return null; } },

    /* ---------- generic data ops (same API in both modes) ---------- */
    /* the profile in use on this phone: the person who is signed in, unless another one was picked at the top right (family accounts) */
    actId() {
      if (this.mode === "cloud") { const v = +this._localPref("view"); if (v && ((this.state.settings || {}).people || []).some(p => p.id === v)) return v; }
      return this.me.personId;
    },
    add(col, obj) {
      const id = obj.id || uid(), act = this.actId();
      const rec = Object.assign({}, obj, { id, createdAt: Date.now(), by: act });
      if (act !== this.me.personId) rec.via = this.me.personId; // made on someone else's profile: keep whose phone it came from
      if (this.mode === "local") { this.state[col].push(rec); this._saveLocal(); this._emit(); return id; }
      const { id: _drop, ...data } = rec;
      FB.setDoc(this._doc(col, id), data).catch(e => this._fail(e));
      return id;
    },
    put(col, id, obj) { // create or replace with a fixed id
      if (this.mode === "local") { const i = this.state[col].findIndex(x => x.id === id); const rec = Object.assign({}, obj, { id }); if (i >= 0) this.state[col][i] = rec; else this.state[col].push(rec); this._saveLocal(); this._emit(); return; }
      const { id: _drop, ...data } = obj;
      FB.setDoc(this._doc(col, id), data).catch(e => this._fail(e));
    },
    patch(col, id, fields) {
      if (this.mode === "local") { const r = this.state[col].find(x => x.id === id); if (r) Object.assign(r, fields); this._saveLocal(); this._emit(); return; }
      FB.updateDoc(this._doc(col, id), fields).catch(e => this._fail(e));
    },
    merge(col, id, fields) { // change some fields of one record and keep the rest (fields inside fields too); the record is made if it is not there yet
      if (this.mode === "local") {
        let r = this.state[col].find(x => x.id === id);
        if (!r) { r = { id }; this.state[col].push(r); }
        const plain = v => !!v && typeof v === "object" && !Array.isArray(v);
        const mix = (a, b) => Object.keys(b).forEach(k => { if (plain(b[k])) { if (!plain(a[k])) a[k] = {}; mix(a[k], b[k]); } else a[k] = b[k]; });
        mix(r, fields); this._saveLocal(); this._emit(); return;
      }
      FB.setDoc(this._doc(col, id), fields, { merge: true }).catch(e => this._fail(e));
    },
    del(col, id) {
      if (this.mode === "local") { this.state[col] = this.state[col].filter(x => x.id !== id); this._saveLocal(); this._emit(); return; }
      FB.deleteDoc(this._doc(col, id)).catch(e => this._fail(e));
    },
    delMany(col, ids) { ids.forEach(id => this.del(col, id)); },
    setSettings(patch) {
      if (this.mode === "local") { Object.assign(this.state.settings, patch); this._saveLocal(); this._emit(); return; }
      FB.updateDoc(FB.doc(this.db, "families", this.familyId), patch).catch(e => this._fail(e));
    },
    setMe(personId) { this.me.personId = +personId; if (this.mode === "local") this._localPref("me", personId); this._emit(); },
    exportJSON() { return JSON.stringify(this.state); },
    importJSON(txt) { const d = JSON.parse(txt); if (!d.settings) throw new Error("bad"); if (this.mode !== "local") throw new Error("cloud"); this.state = Object.assign(emptyState(), d); this._saveLocal(); this._emit(); },
    eraseLocal() { const s = this.state.settings; this.state = emptyState(); this.state.settings = s; this._saveLocal(); this._emit(); },

    /* ---------- cloud mode ---------- */
    _initCloud(cfg) {
      this.mode = "cloud";
      this.app = FB.initializeApp(cfg);
      this.auth = FB.getAuth(this.app);
      let cache;
      try { cache = FB.persistentLocalCache({ tabManager: FB.persistentMultipleTabManager() }); } catch (e) { cache = FB.memoryLocalCache(); }
      this.db = FB.initializeFirestore(this.app, { localCache: cache });
      if (cfg.emulatorHost) { // only used for local testing
        FB.connectAuthEmulator(this.auth, "http://" + cfg.emulatorHost + ":9099", { disableWarnings: true });
        FB.connectFirestoreEmulator(this.db, cfg.emulatorHost, 8080);
      }
      FB.onAuthStateChanged(this.auth, user => this._onUser(user));
    },
    pendingCols: new Set(),
    get pending() { return this.pendingCols.size > 0; },
    _fail(e) { console.error(e); this.error = (e && e.code === "permission-denied") ? "You don't have permission to change that." : "Couldn't save. It will retry when you're back online."; this._emit(); },
    _doc(col, id) {
      if (PRIVATE_PATH[col]) return FB.doc(this.db, "users", this.me.uid, PRIVATE_PATH[col], id);
      return FB.doc(this.db, "families", this.familyId, col, id);
    },
    /* Sign-ups: every account notes once that it exists, with only the time it was made (signups/{uid} = {joined, at}).
       No name and no email. Only the family that runs the app can read the list (see the rules on the Sign-ups page).
       Until those rules are published the write is refused; the phone then tries again ten minutes later or more. */
    async _signupPing(user) {
      if (!user) return;
      this._user = user;
      const k = "su:" + user.uid, v = this._localPref(k) || "";
      if (v === "ok" || (v && Date.now() - (+v) < 600e3)) return;
      try {
        const ref = FB.doc(this.db, "signups", user.uid);
        let have = false;
        try { const g = await FB.getDoc(ref); have = g.exists(); } catch (e) { }
        if (!have) {
          const made = Math.floor(Date.parse(user.metadata && user.metadata.creationTime) || Date.now());
          await FB.setDoc(ref, { joined: made, at: FB.serverTimestamp() });
        }
        this._localPref(k, "ok");
      } catch (e) { this._localPref(k, String(Date.now())); }
    },
    signupNow() { const u = this._user; if (!u || u.uid !== this.me.uid) return; this._localPref("su:" + u.uid, ""); return this._signupPing(u); },
    /* The list of sign-ups, live. cb({ok:true, list:[{id, joined}]}) or cb({ok:false, code}). Returns a stop function. */
    signupsWatch(cb) {
      if (this.mode !== "cloud" || !this.me.uid) { cb({ ok: false, code: "local" }); return () => { }; }
      return FB.onSnapshot(FB.collection(this.db, "signups"), { includeMetadataChanges: true }, snap => {
        if (snap.metadata.fromCache) return;                          // only what the server says (the phone's own copy may hold just its own sign-up)
        cb({ ok: true, list: snap.docs.map(d => ({ id: d.id, joined: +(d.data().joined) || 0 })) });
      }, e => cb({ ok: false, code: e && e.code || "error" }));
    },
    /* Can this account read the sign-ups? One small question to the server (it asks for none of them). cb(true|false|null). */
    signupsProbe(cb) {
      if (this.mode !== "cloud" || !this.me.uid) { cb(false); return; }
      let un = null, done = false;
      const fin = v => { if (done) return; done = true; try { un && un(); } catch (e) { } cb(v); };
      un = FB.onSnapshot(FB.query(FB.collection(this.db, "signups"), FB.where("joined", ">", 4e12)), { includeMetadataChanges: true },
        snap => { if (!snap.metadata.fromCache) fin(true); },
        e => fin(e && e.code === "permission-denied" ? false : null));
      setTimeout(() => fin(null), 15000);
    },
    async _onUser(user) {
      this._unsubs.forEach(u => u()); this._unsubs = [];
      this.state = emptyState();
      if (!user) { this.phase = "signedOut"; this.me = { uid: null, personId: 1, email: null }; this.familyId = null; this._emit(); return; }
      this.me = { uid: user.uid, personId: 1, email: user.email };
      this._signupPing(user);
      this.phase = "loading"; this._emit();
      const unsubUser = FB.onSnapshot(FB.doc(this.db, "users", user.uid), snap => {
        const d = snap.data();
        if ((!d || !d.familyId) && snap.metadata.fromCache && !navigator.onLine) return; // offline with nothing saved yet: wait for the internet instead of asking to set up a family
        if (!d || !d.familyId) { this.phase = "needsFamily"; this._emit(); return; }
        if (d.familyId !== this.familyId) { this.familyId = d.familyId; this._subscribeFamily(); }
      }, e => this._fail(e));
      this._unsubs.push(unsubUser);
    },
    _subscribeFamily() {
      const fid = this.familyId;
      this._unsubs.push(FB.onSnapshot(FB.doc(this.db, "families", fid), { includeMetadataChanges: true }, snap => {
        const d = snap.data(); if (!d) return;
        this.settingsLive = !snap.metadata.fromCache && !snap.metadata.hasPendingWrites;
        this.state.settings = Object.assign(defaults(), d);
        const mine = (d.people || []).find(p => p.uid === this.me.uid);
        this.me.personId = mine ? mine.id : 0;
        this.phase = "ready"; this._emit();
      }, e => { this._fail(e); }));
      FAMILY_COLS.forEach(col => {
        this._unsubs.push(FB.onSnapshot(FB.collection(this.db, "families", fid, col), { includeMetadataChanges: true }, snap => {
          const before = this.pendingCols.size; snap.metadata.hasPendingWrites ? this.pendingCols.add(col) : this.pendingCols.delete(col);
          if (!snap.docChanges().length && before === this.pendingCols.size && this.state[col].length === snap.size) { if (before !== this.pendingCols.size) this._emit(); return; }
          this.state[col] = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
          this._emit();
        }, e => this._fail(e)));
      });
      PRIVATE_COLS.forEach(col => {
        this._unsubs.push(FB.onSnapshot(FB.collection(this.db, "users", this.me.uid, PRIVATE_PATH[col]), snap => {
          this.state[col] = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
          this._emit();
        }, e => this._fail(e)));
      });
    },
    async signUp(email, password) { return FB.createUserWithEmailAndPassword(this.auth, email, password); },
    async signIn(email, password) {
      try { return await FB.signInWithEmailAndPassword(this.auth, email, password); }
      catch (e) { if (e && e.code === "auth/multi-factor-auth-required") { this.mfaResolver = FB.getMultiFactorResolver(this.auth, e); const x = new Error("mfa"); x.code = "hh/mfa-needed"; throw x; } throw e; }
    },
    /* ---------- two-step sign-in (authenticator app codes) ---------- */
    mfaResolver: null,
    async finishMfaSignIn(code) {
      const r = this.mfaResolver; if (!r) throw Object.assign(new Error("none"), { code: "hh/mfa-expired" });
      const hint = r.hints.find(h => h.factorId === "totp") || r.hints[0];
      await r.resolveSignIn(FB.TotpMultiFactorGenerator.assertionForSignIn(hint.uid, String(code).replace(/\D/g, "")));
      this.mfaResolver = null;
    },
    cancelMfa() { this.mfaResolver = null; },
    twoStepOn() { const u = this.auth && this.auth.currentUser; return !!(u && FB.multiFactor(u).enrolledFactors.length); },
    emailVerified() { const u = this.auth && this.auth.currentUser; return !!(u && u.emailVerified); },
    async sendVerifyEmail() { return FB.sendEmailVerification(this.auth.currentUser); },
    async refreshUser() { await FB.reload(this.auth.currentUser); return this.auth.currentUser.emailVerified; },
    async _reauth(password) { const u = this.auth.currentUser; await FB.reauthenticateWithCredential(u, FB.EmailAuthProvider.credential(u.email, password)); },
    async startTwoStep(password) {
      await this._reauth(password);
      const session = await FB.multiFactor(this.auth.currentUser).getSession();
      const secret = await FB.TotpMultiFactorGenerator.generateSecret(session);
      return { secret, key: secret.secretKey, url: secret.generateQrCodeUrl(this.auth.currentUser.email, "Happy Home") };
    },
    async finishTwoStep(secret, code) {
      const a = FB.TotpMultiFactorGenerator.assertionForEnrollment(secret, String(code).replace(/\D/g, ""));
      await FB.multiFactor(this.auth.currentUser).enroll(a, "Authenticator app");
    },
    async stopTwoStep(password) {
      await this._reauth(password);
      const mf = FB.multiFactor(this.auth.currentUser);
      for (const f of mf.enrolledFactors.slice()) await mf.unenroll(f);
    },
    async resetPassword(email) { return FB.sendPasswordResetEmail(this.auth, email); },
    async signOut() { return FB.signOut(this.auth); },
    async createFamily({ myName, otherNames, currency }) {
      const fid = makeCode();
      const people = [{ id: 1, name: myName || "Me", uid: this.me.uid }].concat((otherNames || []).filter(Boolean).map((n, i) => ({ id: i + 2, name: n, uid: null })));
      await FB.setDoc(FB.doc(this.db, "families", fid), Object.assign(defaults(), { people, currency: currency || "$", members: [this.me.uid], owner: this.me.uid, createdAt: Date.now() }));
      await FB.setDoc(FB.doc(this.db, "users", this.me.uid), { familyId: fid });
      return fid;
    },
    async joinFamily(code) {
      const fid = String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      await FB.updateDoc(FB.doc(this.db, "families", fid), { members: FB.arrayUnion(this.me.uid) });
      await FB.setDoc(FB.doc(this.db, "users", this.me.uid), { familyId: fid });
      return fid;
    },
    claimPerson(personId) { // "this one is me"
      const people = this.state.settings.people.map(p => p.id === +personId ? Object.assign({}, p, { uid: this.me.uid }) : (p.uid === this.me.uid ? Object.assign({}, p, { uid: null }) : p));
      this.setSettings({ people });
    },
    removeMember(memberUid) {
      const s = this.state.settings;
      this.setSettings({ members: (s.members || []).filter(u => u !== memberUid), people: s.people.map(p => p.uid === memberUid ? Object.assign({}, p, { uid: null }) : p) });
    }
  };
  window.Store = Store;
})();
