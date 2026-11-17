const el=id=>document.getElementById(id);
const profileKey='overwatch-firebase-profiles';
const trackerKey='overwatch-workout-v1';
const requested=new URLSearchParams(location.search).get('room');
const randomCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(10)),n=>n.toString(16).padStart(2,'0')).join('');
const profiles=JSON.parse(localStorage.getItem(profileKey)??'[]');
let profile=profiles.find(entry=>entry.room===requested)??(!requested?profiles.at(-1):null);
let unsubscribe=()=>{};
let connection;
function message(text) { el('status').textContent=text; }
async function connect() {
  if (!connection) connection=(async()=>{
    const {firebaseConfig}=await import('./firebase-config.js');
    if (!firebaseConfig.apiKey || !firebaseConfig.databaseURL) throw new Error('Add your Firebase web config to firebase-config.js first.');
    const base='https://www.gstatic.com/firebasejs/12.0.0/';
    const [app,auth,db]=await Promise.all([
      import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-database.js')
    ]);
    const instance=app.initializeApp(firebaseConfig);
    const identity=auth.getAuth(instance);
    await identity.authStateReady();
    const user=identity.currentUser ?? (await auth.signInAnonymously(identity)).user;
    return {...db,database:db.getDatabase(instance),uid:user.uid};
  })().catch(error=>{connection=undefined;throw error;});
  return connection;
}
function localSessions() {
  return JSON.parse(localStorage.getItem(trackerKey)??'[]').filter(s=>s.ended && s.date && s.games.length);
}
async function board() {
  unsubscribe();
  const selected=profile;
  const date=el('board-date').value;
  if (!selected || !date) return;
  try {
    const db=await connect();
    if (profile!==selected || date!==el('board-date').value) return;
    unsubscribe();
    const scores=db.query(db.ref(db.database,'rooms/'+selected.room+'/scores'),db.orderByChild('date'),db.equalTo(date));
    unsubscribe=db.onValue(scores,snapshot=>{
    const sessions=Object.values(snapshot.val()??{}).sort((a,b)=>b.reps-a.reps || b.plank-a.plank || a.player.localeCompare(b.player));
    const rows=sessions.map(s=>{
      const row=document.createElement('tr');
      [s.player,s.games,s.wins,s.losses,s.draws,s.reps,s.plank+' sec'].forEach(value=>row.insertCell().textContent=value);
      return row;
    });
    if (!rows.length) {
      const row=document.createElement('tr');
      const cell=row.insertCell();
      cell.colSpan=7;
      cell.textContent='No sessions shared for this date.';
      rows.push(row);
    }
    el('board').replaceChildren(...rows);
    },error=>message(error.message));
  } catch(error) { if(profile===selected) message(error.message); }
}
function showRoom() {
  el('join').hidden=!!profile;
  el('room').hidden=!profile;
  if(!profile) return;
  el('identity').textContent='Playing as '+profile.username;
  el('invite').value=new URL('./competition.html?room='+profile.room,location.href).href;
  const list=el('share-sessions');
  const sessions=localSessions();
  if (!sessions.length) {
    list.textContent='Completed sessions with a date will appear here.';
  } else {
    list.replaceChildren(...sessions.map(session=>{
      const row=document.createElement('div');
      row.className='row share-row';
      const label=document.createElement('span');
      label.textContent='Session '+session.id+' · '+session.date;
      const button=document.createElement('button');
      button.type='button';
      button.textContent='Share';
      button.setAttribute('aria-label','Share Session '+session.id);
      button.addEventListener('click',()=>shareSession(session,button));
      row.append(label,button);
      return row;
    }));
  }
  board();
}
el('join-form').elements.room.value=requested??'';
const now=new Date();
el('board-date').value=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
el('join-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=event.submitter;
  const {username,room}=Object.fromEntries(new FormData(event.currentTarget));
  const code=button?.value==='create'?randomCode():room.trim().toLowerCase();
  const player=username.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9 _-]{1,23}$/.test(player) || !/^[a-f0-9]{20}$/.test(code)) {
    message('Enter a 2–24 character username and a valid room code.');
    return;
  }
  const buttons=event.currentTarget.querySelectorAll('button');
  buttons.forEach(control=>control.disabled=true);
  try {
    const db=await connect();
    const roomPath='rooms/'+code;
    if (button.value==='create') await db.set(db.ref(db.database,roomPath+'/owner'),db.uid);
    await db.set(db.ref(db.database,roomPath+'/members/'+db.uid),player);
    profile={room:code,username:player};
    const saved=profiles.findIndex(entry=>entry.room===code);
    if (saved<0) profiles.push(profile);
    else profiles[saved]=profile;
    localStorage.setItem(profileKey,JSON.stringify(profiles));
    history.replaceState(null,'','./competition.html?room='+code);
    message('');
    showRoom();
  } catch(error) { message(error.message); }
  finally { buttons.forEach(control=>control.disabled=false); }
});
el('switch').addEventListener('click',()=>{
  el('join-form').elements.room.value=profile.room;
  profile=null;
  unsubscribe();
  message('');
  showRoom();
});
el('copy').addEventListener('click',async()=>{
  try { await navigator.clipboard.writeText(el('invite').value); message('Invite link copied.'); }
  catch { el('invite').select(); message('Copy the selected invite link.'); }
});
async function shareSession(session,button) {
  if (!profile) return;
  const key='overwatch-competition-session-'+session.id;
  const id=localStorage.getItem(key)??crypto.randomUUID();
  localStorage.setItem(key,id);
  button.disabled=true;
  try {
    const selected=profile;
    const db=await connect();
    const score={uid:db.uid,player:selected.username,date:session.date,games:session.games.length,
      wins:0,losses:0,draws:0,reps:0,plank:0};
    for (const game of session.games) {
      score[{Win:'wins',Loss:'losses',Draw:'draws'}[game.result]]++;
      score.reps+=(game.result==='Win'?10:game.result==='Loss'?15:0)+game.potg*10+game.deaths*2+
        Math.floor(game.kills/5)*5+Math.floor(game.assists/5)*5;
      score.plank+=game.card*60;
    }
    await db.set(db.ref(db.database,'rooms/'+selected.room+'/scores/'+db.uid+'_'+id),score);
    if (profile!==selected) return;
    el('board-date').value=session.date;
    message('Session shared with your room.');
    await board();
  } catch(error) { message(error.message); }
  finally { button.disabled=false; }
}
el('refresh').addEventListener('click',board);
el('board-date').addEventListener('change',board);
showRoom();
