const el = id => document.getElementById(id);
const profileKey = 'overwatch-firebase-profiles';
const trackerKey = 'overwatch-workout-v1';
const requestedRoom = new URLSearchParams(location.search).get('room');
const roomPattern = /^[a-f0-9]{20}$/;
const usernamePattern = /^[a-zA-Z0-9][a-zA-Z0-9 _-]{1,23}$/;

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

const profiles = readArray(profileKey);
let profile = requestedRoom
  ? profiles.find(entry => entry?.room === requestedRoom)
  : profiles.at(-1);
let connection;
let unsubscribe = () => {};
let boardRevision = 0;

function message(text) {
  el('status').textContent = text;
}

function randomRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function competitionUrl(room) {
  const url = new URL('./competition.html', location.href);
  url.searchParams.set('room', room);
  return url;
}

async function connect() {
  if (!connection) {
    connection = (async () => {
      const { firebaseConfig } = await import('./firebase-config.js');
      if (!firebaseConfig?.apiKey || !firebaseConfig?.databaseURL) {
        throw new Error('Add your Firebase web configuration to firebase-config.js.');
      }

      const base = 'https://www.gstatic.com/firebasejs/12.0.0/';
      const [appSdk, authSdk, databaseSdk] = await Promise.all([
        import(base + 'firebase-app.js'),
        import(base + 'firebase-auth.js'),
        import(base + 'firebase-database.js')
      ]);

      const app = appSdk.getApps().length
        ? appSdk.getApp()
        : appSdk.initializeApp(firebaseConfig);
      const auth = authSdk.getAuth(app);
      await auth.authStateReady();
      const user = auth.currentUser ?? (await authSdk.signInAnonymously(auth)).user;

      return {
        ...databaseSdk,
        database: databaseSdk.getDatabase(app),
        uid: user.uid
      };
    })().catch(error => {
      connection = undefined;
      throw error;
    });
  }
  return connection;
}

function renderBoard(scores, emptyText = 'No sessions shared for this date.') {
  const rows = scores.map(score => {
    const row = document.createElement('tr');
    const values = [
      score.player, score.games, score.wins, score.losses,
      score.draws, score.reps, `${score.plank} sec`
    ];
    values.forEach(value => {
      row.insertCell().textContent = value;
    });
    return row;
  });

  if (!rows.length) {
    const row = document.createElement('tr');
    const cell = row.insertCell();
    cell.colSpan = 7;
    cell.textContent = emptyText;
    rows.push(row);
  }

  el('board').replaceChildren(...rows);
}

async function watchBoard() {
  const revision = ++boardRevision;
  unsubscribe();
  unsubscribe = () => {};

  const selected = profile;
  const date = el('board-date').value;
  if (!selected) return;
  if (!date) {
    renderBoard([], 'Choose a date to see the leaderboard.');
    return;
  }

  renderBoard([], 'Loading sessions…');
  const showError = error => {
    if (revision !== boardRevision) return;
    renderBoard([], 'Could not load the leaderboard.');
    message(error.message);
  };

  try {
    const db = await connect();
    if (revision !== boardRevision) return;
    const scores = db.query(
      db.ref(db.database, `rooms/${selected.room}/scores`),
      db.orderByChild('date'),
      db.equalTo(date)
    );

    unsubscribe = db.onValue(scores, snapshot => {
      if (revision !== boardRevision) return;
      const entries = Object.values(snapshot.val() ?? {}).sort(
        (a, b) => b.reps - a.reps || b.plank - a.plank || a.player.localeCompare(b.player)
      );
      renderBoard(entries);
    }, showError);
  } catch (error) {
    showError(error);
  }
}

function showRoom() {
  el('join').hidden = Boolean(profile);
  el('room').hidden = !profile;
  if (!profile) return;

  el('identity').textContent = `Playing as ${profile.username}`;
  el('room-code').value = profile.room;
  el('invite').value = competitionUrl(profile.room).href;

  const list = el('share-sessions');
  const sessions = readArray(trackerKey).filter(
    session => session?.ended && session.date && session.games?.length
  );

  if (!sessions.length) {
    list.textContent = 'Completed sessions with a date will appear here.';
  } else {
    list.replaceChildren(...sessions.map(session => {
      const row = document.createElement('div');
      row.className = 'row share-row';

      const label = document.createElement('span');
      label.textContent = `Session ${session.id} · ${session.date}`;

      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Share';
      button.setAttribute('aria-label', `Share Session ${session.id}`);
      button.addEventListener('click', () => shareSession(session, button));

      row.append(label, button);
      return row;
    }));
  }

  watchBoard();
}

async function shareSession(session, button) {
  const selected = profile;
  if (!selected) return;

  button.disabled = true;
  try {
    const key = `overwatch-competition-session-${session.id}`;
    const id = localStorage.getItem(key) ?? crypto.randomUUID();
    localStorage.setItem(key, id);

    const db = await connect();
    const score = {
      uid: db.uid,
      player: selected.username,
      date: session.date,
      games: session.games.length,
      wins: 0,
      losses: 0,
      draws: 0,
      reps: 0,
      plank: 0
    };

    for (const game of session.games) {
      const result = { Win: 'wins', Loss: 'losses', Draw: 'draws' }[game.result];
      score[result]++;

      const resultReps = game.result === 'Win' ? 10 : game.result === 'Loss' ? 15 : 0;
      score.reps += resultReps + game.potg * 10 + game.deaths * 2
        + Math.floor(game.kills / 5) * 5
        + Math.floor(game.assists / 5) * 5;
      score.plank += Math.min(game.card, 1) * 60;
    }

    const path = `rooms/${selected.room}/scores/${db.uid}_${id}`;
    await db.set(db.ref(db.database, path), score);
    if (profile !== selected) return;

    el('board-date').value = session.date;
    message('Session shared with your room.');
    watchBoard();
  } catch (error) {
    if (profile === selected) message(error.message);
  } finally {
    button.disabled = false;
  }
}

async function copyField(id, label) {
  const field = el(id);
  try {
    await navigator.clipboard.writeText(field.value);
    message(`${label} copied.`);
  } catch {
    field.focus();
    field.select();
    message(`Copy the selected ${label.toLowerCase()}.`);
  }
}

const joinForm = el('join-form');
joinForm.elements.room.value = requestedRoom ?? '';

const now = new Date();
el('board-date').value = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  .toISOString().slice(0, 10);

joinForm.addEventListener('submit', async event => {
  event.preventDefault();
  const create = event.submitter?.value === 'create';
  const username = joinForm.elements.username.value.trim();
  const code = create ? randomRoomCode() : joinForm.elements.room.value.trim().toLowerCase();

  if (!usernamePattern.test(username)) {
    message('Use 2–24 characters for your username. Start with a letter or number.');
    return;
  }
  if (!roomPattern.test(code)) {
    message('Paste the 20-character room code, or select Create room.');
    return;
  }

  const buttons = joinForm.querySelectorAll('button');
  buttons.forEach(button => { button.disabled = true; });
  try {
    const db = await connect();
    const path = `rooms/${code}`;
    if (create) await db.set(db.ref(db.database, `${path}/owner`), db.uid);
    await db.set(db.ref(db.database, `${path}/members/${db.uid}`), username);

    profile = { room: code, username };
    const index = profiles.findIndex(entry => entry?.room === code);
    if (index === -1) profiles.push(profile);
    else profiles[index] = profile;

    localStorage.setItem(profileKey, JSON.stringify(profiles));
    history.replaceState(null, '', competitionUrl(code));
    message('');
    showRoom();
  } catch (error) {
    message(error.message);
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
});

el('switch').addEventListener('click', () => {
  joinForm.elements.room.value = profile.room;
  joinForm.elements.username.value = profile.username;
  profile = null;
  boardRevision++;
  unsubscribe();
  message('');
  showRoom();
  joinForm.elements.room.focus();
});

el('copy-code').addEventListener('click', () => copyField('room-code', 'Room code'));
el('copy').addEventListener('click', () => copyField('invite', 'Invite link'));
el('refresh').addEventListener('click', watchBoard);
el('board-date').addEventListener('change', watchBoard);

showRoom();
