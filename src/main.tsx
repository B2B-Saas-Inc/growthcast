import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const isForecastRoute = window.location.pathname.startsWith('/resources/tools/forecast');
const App = lazy(() => (isForecastRoute ? import('./App') : import('./AgencyApp')));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <App />
    </Suspense>
  </StrictMode>,
);
