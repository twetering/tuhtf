import { useEffect, useState } from 'react';
import SwarmPerformance from './SwarmPerformance';
import HuiskamerLab from './huiskamer/HuiskamerLab';
import Lab2 from './huiskamer2/Lab2';
import Speelkamer from './speelkamer/Speelkamer';
import { KlokScherm, Zender } from './speelkamer/Zender';

function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  if (hash.startsWith('#speelkamer/zender')) return <Zender />;
  if (hash.startsWith('#speelkamer/klok')) return <KlokScherm />;
  if (hash.startsWith('#speelkamer')) return <Speelkamer />;
  if (hash.startsWith('#huiskamer-v1')) return <HuiskamerLab />;
  if (hash.startsWith('#huiskamer')) return <Lab2 />;
  return <SwarmPerformance />;
}
