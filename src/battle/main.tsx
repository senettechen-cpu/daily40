import { createRoot } from 'react-dom/client';
import { BattleReportApp } from './view/BattleReportApp';
import { BattleTestApp } from './view/BattleTestApp';

// Default: text battle report (user decision 2026-09-22). ?view=animated opens the paused animated view.
const animated = new URLSearchParams(location.search).get('view') === 'animated';
createRoot(document.getElementById('root')!).render(animated ? <BattleTestApp /> : <BattleReportApp />);
