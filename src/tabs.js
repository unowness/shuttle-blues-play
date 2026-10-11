// Other tabs of the game on the same save (SX, 2026-10-01: «когда пользователь открыл вторую
// вкладку, делать как бы поп-ап предупреждающий о конфликте сохранений с просьбой закрыть
// предыдущую вкладку. А прогресс в первой вкладке надо паузить сразу»).
//
// The save itself is guarded in src/storage.js: the tab that loaded last owns it, and an older
// tab is held, writing nothing. That older tab learns it at once (a `storage` event) and pauses
// for good. What storage cannot tell is the other way round: whether an older tab is still open,
// so the newer one can ask for it to be closed. For that each tab says `hello` on a channel of
// its save when it loads and `bye` when it leaves; a tab that hears `hello` answers `here`. So a
// tab knows the tabs opened before it that are still open (`older`), and forgets one when it
// leaves; `onChange(older, 'here' | 'bye')` hears each change. A tab that crashes says no
// `bye`; the newer tab's window can be closed by hand.
//
// The channel is injected (a BroadcastChannel in the page, a fake in the checks).

export function watchOlderTabs({ channel, id, onChange = () => {} }) {
  const older = new Set();
  const post = (type) => {
    try { channel.postMessage({ type, id }); } catch { /* a closed channel: nothing to say */ }
  };
  channel.onmessage = (event) => {
    const msg = event?.data;
    if (!msg || typeof msg.id !== 'string' || msg.id === id) return;
    if (msg.type === 'hello') { post('here'); return; }       // a newer tab: storage pauses this one
    if (msg.type === 'here') { if (older.has(msg.id)) return; older.add(msg.id); }
    else if (msg.type === 'bye') { if (!older.delete(msg.id)) return; }
    else return;
    onChange(older, msg.type);
  };
  post('hello');
  return { older, leave: () => post('bye') };
}

// The channel's name: one per save, so the lab's own save and the game's never meet.
export const tabsChannelName = (saveName) => `spaser.tabs.${saveName}`;
