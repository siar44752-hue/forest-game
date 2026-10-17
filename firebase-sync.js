// firebase-sync.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getDatabase, ref, set, get, onValue, onDisconnect, update, push } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyArIeUFV4grddcwYY8pBoSXQZvDMMKWokc",
  authDomain: "nomerok-84a45.firebaseapp.com",
  databaseURL: "https://nomerok-84a45-default-rtdb.firebaseio.com",
  projectId: "nomerok-84a45",
  storageBucket: "nomerok-84a45.firebasestorage.app",
  messagingSenderId: "944992255871",
  appId: "1:944992255871:web:fe8e6258dda4e45affa44a",
  measurementId: "G-DNRXZQT70F"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let uid = null;

function genInviteCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'NOM-';
  for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random()*c.length)];
  return s;
}

function genNickname(id) {
  const n = ['Игрок','Гонщик','Коллекционер','Охотник','Мастер','Легенда','Профи','Новичок'];
  return n[Math.floor(Math.random()*n.length)] + ' ' + id.slice(0,4).toUpperCase();
}

export function avatarUrl(id) {
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${id}&backgroundColor=c4ff46,57c7ff,c38bff`;
}

export function getUid() { return uid; }

export async function initFirebase() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        uid = user.uid;
        try {
          await ensureProfile();
          resolve(uid);
        } catch (e) { reject(e); }
      } else {
        signInAnonymously(auth).catch(reject);
      }
    });
  });
}

async function ensureProfile() {
  const r = ref(db, 'users/' + uid);
  const snap = await get(r);
  if (!snap.exists()) {
    const code = genInviteCode();
    await set(r, {
      uid, name: genNickname(uid),
      inviteCode: code,
      income: 0,
      plate: { L1:'А', L2:'А', L3:'А', digits:'000', region:'77', rarity:'common', value:0 },
      carId: 'lambo',
      avatar: avatarUrl(uid),
      online: true,
      lastSeen: Date.now(),
      createdAt: Date.now()
    });
    await set(ref(db, 'inviteCodes/' + code), { uid });
  }
  onDisconnect(r).update({ online: false, lastSeen: Date.now() });
  await update(r, { online: true, lastSeen: Date.now() });
}

export async function syncMyProfile(data) {
  if (!uid) return;
  await update(ref(db, 'users/' + uid), { ...data, lastSeen: Date.now() });
}

export function subscribeFriends(cb) {
  if (!uid) return () => {};
  return onValue(ref(db, 'friends/' + uid), async (snap) => {
    const uids = snap.exists() ? Object.keys(snap.val()) : [];
    if (!uids.length) { cb([]); return; }
    const profiles = await Promise.all(uids.map(async (fu) => {
      const ps = await get(ref(db, 'users/' + fu));
      return ps.exists() ? { uid: fu, ...ps.val() } : null;
    }));
    cb(profiles.filter(Boolean));
  });
}

export async function addFriendByCodeReal(code) {
  if (!uid) throw new Error('not authenticated');
  const clean = code.toUpperCase().trim();
  if (!/^NOM-[A-Z0-9]{5}$/.test(clean)) throw new Error('invalid format');
  const cs = await get(ref(db, 'inviteCodes/' + clean));
  if (!cs.exists()) throw new Error('code not found');
  const target = cs.val().uid;
  if (target === uid) throw new Error('own code');
  const alr = await get(ref(db, 'friends/' + uid + '/' + target));
  if (alr.exists()) throw new Error('already friends');
  const now = Date.now();
  await set(ref(db, 'friends/' + uid + '/' + target), { since: now });
  await set(ref(db, 'friends/' + target + '/' + uid), { since: now });
  return { targetUid: target };
}

export async function sendGift(toUid, amount) {
  if (!uid) return;
  await push(ref(db, 'gifts/' + toUid), {
    fromUid: uid, amount, timestamp: Date.now(), claimed: false
  });
}

export function subscribeGifts(cb) {
  if (!uid) return () => {};
  return onValue(ref(db, 'gifts/' + uid), (snap) => {
    if (!snap.exists()) { cb([]); return; }
    const list = Object.entries(snap.val()).map(([id, v]) => ({ id, ...v })).filter(g => !g.claimed);
    cb(list);
  });
}

export async function claimGift(giftId) {
  if (!uid) return;
  await update(ref(db, 'gifts/' + uid + '/' + giftId), { claimed: true });
}

export async function sendDuel(toUid, myIncome) {
  if (!uid) return;
  const r = push(ref(db, 'duels'), {
    challenger: uid, opponent: toUid,
    status: 'pending',
    challengerIncome: myIncome,
    opponentIncome: 0,
    winner: null,
    createdAt: Date.now()
  });
  return r.key;
}

export function subscribeDuels(cb) {
  if (!uid) return () => {};
  return onValue(ref(db, 'duels'), (snap) => {
    if (!snap.exists()) { cb([]); return; }
    const list = Object.entries(snap.val())
      .map(([id, v]) => ({ id, ...v }))
      .filter(d => d.opponent === uid || d.challenger === uid);
    cb(list);
  });
}

export async function respondDuel(duelId, accept, myIncome) {
  if (!uid) return;
  const s = await get(ref(db, 'duels/' + duelId));
  if (!s.exists()) return;
  const d = s.val();
  if (d.opponent !== uid) return;
  if (!accept) {
    await update(ref(db, 'duels/' + duelId), { status: 'declined' });
    return;
  }
  const winner = myIncome > d.challengerIncome ? uid : d.challenger;
  await update(ref(db, 'duels/' + duelId), {
    status: 'finished',
    opponentIncome: myIncome,
    winner
  });
}
