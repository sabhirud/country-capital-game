import { useEffect } from 'react';
import { useRoute, navigate } from './router.ts';
import { useSave } from './store.ts';
import { requestPersistence } from './engine/storage.ts';
import { Icon } from './components/Icon.tsx';
import { Toasts } from './components/Toasts.tsx';
import { flagUrl } from './components/Flag.tsx';
import { Conquer } from './screens/Conquer.tsx';
import { Learn } from './screens/Learn.tsx';
import { Practice } from './screens/Practice.tsx';
import { Explore } from './screens/Explore.tsx';
import { FlagFinder } from './screens/FlagFinder.tsx';
import { Stats } from './screens/Stats.tsx';
import { Settings } from './screens/Settings.tsx';

const NAV = [
  { path: '', label: 'Conquer', icon: 'map' },
  { path: 'practice', label: 'Practice', icon: 'zap' },
  { path: 'explore', label: 'Explore', icon: 'globe' },
  { path: 'flags', label: 'Flags', icon: 'flag' },
  { path: 'stats', label: 'Progress', icon: 'chart' },
];

function useTheme(pref: string) {
  useEffect(() => {
    const root = document.documentElement;
    if (pref === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', pref);
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#070b18' : '#eef2f8');
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, [pref]);
}

export function App() {
  const route = useRoute();
  const save = useSave();
  useTheme(save.settings.theme);
  useEffect(() => {
    void requestPersistence();
  }, []);

  const [top, sub] = route;
  const inSession = top === 'learn' || (top === 'practice' && !!sub);

  let screen: React.ReactNode;
  switch (top) {
    case undefined:
      screen = <Conquer />;
      break;
    case 'learn':
      screen = <Learn />;
      break;
    case 'practice':
      screen = <Practice key={sub ?? 'menu'} mode={sub} />;
      break;
    case 'explore':
      screen = <Explore id={sub} />;
      break;
    case 'flags':
      screen = <FlagFinder />;
      break;
    case 'stats':
      screen = <Stats />;
      break;
    case 'settings':
      screen = <Settings />;
      break;
    default:
      screen = <Conquer />;
  }

  // scroll to top on screen change
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [top, inSession]);

  return (
    <div className={`app ${inSession ? 'in-session' : ''}`}>
      {!inSession && (
        <nav className="nav" aria-label="Main">
          <a className="nav-brand" href="#/">
            <span className="logo" aria-hidden="true">🌍</span>
            <span>
              Capital <b>Conquest</b>
            </span>
          </a>
          <div className="nav-items">
            {NAV.map((n) => {
              const active = (top ?? '') === n.path || (n.path === 'stats' && top === 'settings');
              return (
                <a key={n.path} href={`#/${n.path}`} className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
                  <Icon name={n.icon} size={22} />
                  <span>{n.label}</span>
                </a>
              );
            })}
          </div>
          <button className="nav-settings icon-btn" aria-label="Settings" onClick={() => navigate('/settings')}>
            <Icon name="gear" />
          </button>
        </nav>
      )}
      <main className="main">{screen}</main>
      <Toasts flagUrl={flagUrl} />
    </div>
  );
}
