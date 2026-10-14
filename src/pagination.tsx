import { useEffect, useRef, useState } from "react";
type Page<T> = { items: T[]; nextOffset: number | null };
export function useCatalog<T>(path: string | null) {
  const [data, setData] = useState<T[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [next, setNext] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null),
    current = useRef(path);
  current.current = path;
  async function fetchPage(offset: number, first = false) {
    if (!path) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api" + path + "&limit=24&offset=" + offset, {
        signal: request.signal,
      });
      const page: Page<T> & { error?: string } = await res.json();
      if (!res.ok) throw new Error(page.error || "读取失败，请重试");
      if (request.signal.aborted || current.current !== path) return;
      setData((old) => (first ? page.items : [...(old || []), ...page.items]));
      setNext(page.nextOffset);
    } catch (e) {
      if (!request.signal.aborted && current.current === path)
        setError((e as Error).message);
    } finally {
      if (!request.signal.aborted && current.current === path) setBusy(false);
    }
  }
  useEffect(() => {
    controller.current?.abort();
    setData(null);
    setError("");
    setNext(null);
    setBusy(false);
    const timer = setTimeout(() => {
      void fetchPage(0, true);
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.current?.abort();
    };
  }, [path]);
  return {
    data,
    error,
    busy,
    hasMore: next !== null,
    more: () => {
      if (!busy && next !== null) void fetchPage(next);
    },
    retry: () => {
      if (!busy) void fetchPage(data ? next || 0 : 0, !data);
    },
  };
}
export function MoreResults({
  feed,
}: {
  feed: {
    error: string;
    busy: boolean;
    hasMore: boolean;
    more: () => void;
    retry: () => void;
  };
}) {
  if (!feed.hasMore && !feed.error) return null;
  return (
    <div className="catalog-more">
      {feed.error && <p role="alert">{feed.error}</p>}
      <button
        className="button outline"
        disabled={feed.busy}
        onClick={feed.error ? feed.retry : feed.more}
      >
        {feed.busy ? "正在读取…" : feed.error ? "重试读取" : "加载更多"}
      </button>
    </div>
  );
}
