import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { isNative } from './lib/runtime';
import './index.css';

/**
 * HashRouter in the native shell, BrowserRouter on the web.
 *
 * BrowserRouter needs a server that rewrites every path to index.html. The
 * Capacitor shell loads a file with no server, so /admin 404s to a blank screen.
 * HashRouter keeps the whole route after a #, which any static host serves
 * without rewriting. On the web we keep clean URLs, because there IS a server and
 * the share links investors receive should not carry a #.
 */
const Router = isNative ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  // One boundary at the very top. A render error anywhere below shows a recover
  // screen instead of white-screening a shipped app that cannot be hot-reloaded.
  <ErrorBoundary>
    <Router>
      <App />
    </Router>
  </ErrorBoundary>
);
