import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { HexReportApp } from './view/HexReportApp';

// The default failure screen offers to clear this origin's storage, which here
// would be the main app's own data. The report only ever needs a reload.
const failed = (
    <main className="bt-app">
        <p className="bt-notice">戰報顯示失敗。這場行動的結果與 XP 已由伺服器結算，重新載入不會重打。</p>
        <p className="bt-notice"><button type="button" onClick={() => window.location.reload()}>重新載入</button></p>
    </main>
);

createRoot(document.getElementById('root')!).render(
    <ErrorBoundary fallback={failed}><HexReportApp /></ErrorBoundary>,
);
