import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export function useFetch(path) {
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api(path)
      .then((payload) => {
        if (cancelled) return;
        setData(payload.data);
        setMeta(payload.meta ?? null);
        setError('');
      })
      .catch((err) => !cancelled && setError(err.message || 'Request failed'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [path]);

  return { data, setData, meta, error, setError, loading };
}
