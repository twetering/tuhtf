import { useEffect, useState } from 'react';
import SwarmPerformance from './SwarmPerformance';
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
  // #lummellab is de nieuwe naam; #speelkamer blijft werken voor oude links en zenders
  if (hash.startsWith('#lummellab') || hash.startsWith('#speelkamer')) return <Speelkamer />;
  if (hash.startsWith('#huiskamer')) return <Lab2 />;
  return <SwarmPerformance />;
}
