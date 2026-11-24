/* Happy Home — shared data layer for the phone app and the Chrome add-on.
   Two modes:
   - "local": no family account set up yet (firebase-config.js is empty). Data lives on this device only.
   - "cloud": firebase-config.js holds the family's Firebase project. Everyone signs in and shares one family.
*/
(function () {
  "use strict";
  const LOCAL_KEY = "happyhome.v2";
  const FAMILY_COLS = ["tasks", "events", "tx", "shopping", "homework", "notes", "wallet", "moods", "locations", "moodSessions"];
  const PRIVATE_COLS = ["myWallet", "myMoodResults"]; // stored under users/{uid}/
  const PRIVATE_PATH = { myWallet: "wallet", myMoodResults: "moodResults" };
  const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

  const defaults = () => ({
    people: [{ id: 1, name: "Me" }, { id: 2, name: "Akiyo" }, { id: 3, name: "Jugo" }],
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
    add(col, obj) {
      const id = obj.id || uid();
      const rec = Object.assign({}, obj, { id, createdAt: Date.now(), by: this.me.personId });
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
    _fail(e) { console.error(e); this.error = (e && e.code === "permission-denied") ? "You don't have permission to change that." : "Couldn't save. It will retry when you're back online."; this._emit(); },
    _doc(col, id) {
      if (PRIVATE_PATH[col]) return FB.doc(this.db, "users", this.me.uid, PRIVATE_PATH[col], id);
      return FB.doc(this.db, "families", this.familyId, col, id);
    },
    async _onUser(user) {
      this._unsubs.forEach(u => u()); this._unsubs = [];
      this.state = emptyState();
      if (!user) { this.phase = "signedOut"; this.me = { uid: null, personId: 1, email: null }; this.familyId = null; this._emit(); return; }
      this.me = { uid: user.uid, personId: 1, email: user.email };
      this.phase = "loading"; this._emit();
      const unsubUser = FB.onSnapshot(FB.doc(this.db, "users", user.uid), snap => {
        const d = snap.data();
        if (!d || !d.familyId) { this.phase = "needsFamily"; this._emit(); return; }
        if (d.familyId !== this.familyId) { this.familyId = d.familyId; this._subscribeFamily(); }
      }, e => this._fail(e));
      this._unsubs.push(unsubUser);
    },
    _subscribeFamily() {
      const fid = this.familyId;
      this._unsubs.push(FB.onSnapshot(FB.doc(this.db, "families", fid), snap => {
        const d = snap.data(); if (!d) return;
        this.state.settings = Object.assign(defaults(), d);
        const mine = (d.people || []).find(p => p.uid === this.me.uid);
        this.me.personId = mine ? mine.id : 0;
        this.phase = "ready"; this._emit();
      }, e => { this._fail(e); }));
      FAMILY_COLS.forEach(col => {
        this._unsubs.push(FB.onSnapshot(FB.collection(this.db, "families", fid, col), snap => {
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
    async signIn(email, password) { return FB.signInWithEmailAndPassword(this.auth, email, password); },
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
    claimPerson(personId) { // "I am Akiyo"
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
