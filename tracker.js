const presets = { Easy:[5,10,1,3,3,5,30], Current:[10,15,2,5,5,10,60], Hard:[15,20,3,8,8,15,90] };
const rules = [
  ['Win','Push-ups',1], ['Loss','Squats',1], ['Death','Jumping jacks',1],
  ['Eliminations (kills)','Crunches',5], ['Assists','Lunges',5],
  ['Play of the Game','Push-ups',1], ['Player card','Plank seconds',1]
];
function exercises({result,kills,deaths,assists,potg,card}) {
  return [(result==='Win'?10:0)+potg*10,result==='Loss'?15:0,deaths*2,
    Math.floor(kills/5)*5,Math.floor(assists/5)*5,Math.min(card,1)*60];
}
const reps = amounts => amounts.slice(0,5).reduce((total,count)=>total+count,0);
const seed = [{id:1,games:[
  {result:'Win',kills:11,deaths:3,assists:5,potg:0,card:0},
  {result:'Loss',kills:31,deaths:6,assists:15,potg:0,card:0},
  {result:'Win',kills:13,deaths:1,assists:3,potg:0,card:0}
]}];
const key = 'overwatch-workout-v1';
const byId = id => document.getElementById(id);
function load() {
  try { return JSON.parse(localStorage.getItem(key)) ?? seed; }
  catch { return seed; }
}
let sessions = load();
const select = byId('session');
let active = sessions.findLast(session=>!session.ended)?.id ?? null;
function save(next) {
  try { localStorage.setItem(key,JSON.stringify(next)); }
  catch { (byId('message') ?? byId('session-message')).textContent='Browser storage is unavailable. Your change was not saved.'; return false; }
  sessions = next;
  return true;
}
function totals(games) {
  const amounts = [0,0,0,0,0,0];
  games.forEach(game=>exercises(game).forEach((count,i)=>{amounts[i]+=count;}));
  return amounts;
}
function record(games) {
  const count = result => games.filter(game=>game.result===result).length;
  return [count('Win'),count('Loss'),count('Draw')];
}
const dateInput = byId('session-date');
const dateFormatter = new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeZone:'UTC'});
function today() {
  const date = new Date();
  const pad = value => String(value).padStart(2,'0');
  return [date.getFullYear(),pad(date.getMonth()+1),pad(date.getDate())].join('-');
}
if (dateInput) dateInput.value=today();
function sessionDate(date) {
  const parsed = new Date(date+'T00:00:00Z');
  return Number.isNaN(parsed.getTime()) ? 'Date unknown' : dateFormatter.format(parsed);
}
function renderSessions() {
  const ordered = [...sessions].sort((a,b)=>(b.date??'').localeCompare(a.date??'') || b.id-a.id);
  byId('session-rows').replaceChildren(...ordered.map(session=>{
    const row=document.createElement('tr');
    const [wins,losses,draws]=record(session.games);
    const amounts=totals(session.games);
    const values=[sessionDate(session.date),'Session '+session.id,session.games.length,
      wins+' W / '+losses+' L'+(draws?' / '+draws+' D':''),reps(amounts),amounts[5]+' sec'];
    values.forEach(value=>{row.insertCell().textContent=value;});
    const button=document.createElement('button');
    button.type='button';
    button.textContent='View games';
    button.setAttribute('aria-label','View games for Session '+session.id);
    button.addEventListener('click',()=>{
      if (!select) {
        location.assign('./index.html?view-session='+session.id+'#history');
        return;
      }
      active=session.id;
      byId('message').textContent='';
      render();
      byId('history').focus();
    });
    const dateEditor=document.createElement('details');
    const title=document.createElement('summary');
    title.textContent='Edit date';
    const field=document.createElement('input');
    field.type='date';
    field.value=session.date??'';
    field.setAttribute('aria-label','Date for Session '+session.id);
    const apply=document.createElement('button');
    apply.textContent='Save date';
    apply.addEventListener('click',()=>{
      if (!field.value || !field.reportValidity()) return;
      if (save(sessions.map(entry=>entry.id===session.id?{...entry,date:field.value}:entry))) render();
    });
    dateEditor.append(title,field,apply);
    row.insertCell().append(button,dateEditor);
    return row;
  }));
}
function render() {
  if (dateInput) renderSessions();
  if (!select) return;
  select.replaceChildren(new Option('Choose a session',''),...sessions.map(({id,date})=>new Option('Session '+id+(date?' · '+sessionDate(date):''),id)));
  select.value=active??'';
  const selected = sessions.find(session=>session.id===active);
  const games = selected?.games ?? [];
  byId('add-game').disabled=!selected || !!selected.ended;
  byId('end').disabled=!selected || !!selected.ended;
  const all = sessions.flatMap(session=>session.games);
  const [wins,losses] = record(all);
  const amounts = totals(all);
  byId('totals').innerHTML=[[all.length,'Games played'],[wins+' W / '+losses+' L','Record'],[reps(amounts),'Workout reps'],[amounts[5]+' sec','Plank time']].map(([value,label])=>'<div class="stat"><b>'+value+'</b><span>'+label+'</span></div>').join('');
  const [w,l,d] = record(games);
  const sessionAmounts = totals(games);
  byId('summary').textContent=selected ? 'Session '+active+(selected.ended?' (completed)':'')+' · '+w+' W / '+l+' L'+(d?' / '+d+' D':'')+' · '+reps(sessionAmounts)+' reps · '+sessionAmounts[5]+' sec plank' : 'No active session. Start a new session to log games.';
  byId('games').innerHTML=games.map((game,i)=>{
    const moves=exercises(game);
    return '<tr>'+[i+1,game.result,game.kills,game.deaths,game.assists,game.potg,game.card,reps(moves),moves[5]+' sec'].map(value=>'<td>'+value+'</td>').join('')+'</tr>';
  }).join('') || '<tr><td colspan="9">Add a game to start this session.</td></tr>';
  const names=['Push-ups','Squats','Jumping jacks','Crunches','Lunges','Plank'];
  byId('breakdown').innerHTML=names.map((name,i)=>
    '<tr><th scope="row">'+name+'</th><td>'+sessionAmounts[i]+(i===5?' sec':' reps')+'</td></tr>'
  ).join('');
}
const buttons = [...document.querySelectorAll('.presets button')];
function showRules(mode) {
  buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.textContent===mode)));
  byId('rules').innerHTML=rules.map(([event,exercise,group],i)=>'<tr><td>'+event+'</td><td>'+exercise+'</td><td>'+group+' : '+presets[mode][i]+'</td></tr>').join('');
}
buttons.forEach(button=>button.addEventListener('click',()=>showRules(button.textContent)));
select?.addEventListener('change',()=>{active=Number(select.value)||null;byId('message').textContent='';render();});
function startSession(date) {
  const id=sessions.at(-1).id+1;
  if (!save([...sessions,{id,date,games:[]}])) {
    byId('log').focus();
    return;
  }
  active=id;
  render();
  byId('message').textContent='Session '+id+' created.';
  byId('log').focus();
}
byId('new')?.addEventListener('click',()=>startSession(today()));
byId('new-day')?.addEventListener('click',()=>{
  if (!dateInput.value || !dateInput.reportValidity()) {
    dateInput.focus();
    return;
  }
  location.assign('./index.html?create-session='+encodeURIComponent(dateInput.value)+'#log');
});
byId('game')?.addEventListener('submit',event=>{
  event.preventDefault();
  if (!sessions.some(session=>session.id===active && !session.ended)) return;
  const data=new FormData(event.currentTarget);
  const game={result:data.get('result')};
  for (const field of ['kills','deaths','assists','potg','card']) game[field]=Number(data.get(field));
  if (!save(sessions.map(session=>session.id===active?{...session,games:[...session.games,game]}:session))) return;
  render();
  event.currentTarget.reset();
  byId('message').textContent='Game saved to Session '+active+'.';
});
byId('end')?.addEventListener('click',()=>{
  if (!active || !save(sessions.map(entry=>entry.id===active?{...entry,ended:true}:entry))) return;
  active=null;
  byId('game').reset();
  render();
  byId('message').textContent='Session completed. Start a new session when you’re ready.';
});
byId('export')?.addEventListener('click',()=>{
  const rows=[['Session','Game','Result','Eliminations','Deaths','Assists','POTG','Player cards','Push-ups','Squats','Jumping jacks','Crunches','Lunges','Plank seconds','Total reps']];
  sessions.forEach(({id,games})=>games.forEach((game,i)=>{
    const amounts=exercises(game);
    rows.push([id,i+1,game.result,game.kills,game.deaths,game.assists,game.potg,game.card,...amounts,reps(amounts)]);
  }));
  const url=URL.createObjectURL(new Blob([rows.map(row=>row.join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=url;
  link.download='Overwatch_Workout_Tracker.csv';
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
window.addEventListener('storage',event=>{
  if(event.key!==key) return;
  sessions=load();
  if(active!==null && !sessions.some(session=>session.id===active)) active=sessions.findLast(session=>!session.ended)?.id ?? null;
  render();
});
if (select) showRules('Current');
render();

const pageUrl=new URL(location.href);
const requestedSession=Number(pageUrl.searchParams.get('view-session'));
if (select && sessions.some(session=>session.id===requestedSession)) {
  active=requestedSession;
  render();
}
if (pageUrl.searchParams.has('create-session')) {
  const date=pageUrl.searchParams.get('create-session');
  pageUrl.searchParams.delete('create-session');
  history.replaceState(null,'',pageUrl);
  startSession(/^\d{4}-\d{2}-\d{2}$/.test(date)?date:today());
}
