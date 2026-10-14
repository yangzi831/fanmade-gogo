import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { Heart } from "lucide-react";
import { api, Creator, Event, MaterialEntry } from "./api";
type Kind = "material" | "event" | "creator";
export type Favorites = {
  materialIds: string[];
  eventIds: string[];
  creatorIds: string[];
  materials: MaterialEntry[];
  events: Event[];
  creators: Creator[];
};
const empty: Favorites = {
  materialIds: [],
  eventIds: [],
  creatorIds: [],
  materials: [],
  events: [],
  creators: [],
};
const Context = createContext<{
  data: Favorites;
  ready: boolean;
  error: string;
  isSaved: (kind: Kind, id: string) => boolean;
  toggle: (kind: Kind, id: string) => Promise<void>;
}>({
  data: empty,
  ready: false,
  error: "",
  isSaved: () => false,
  toggle: async () => {},
});
export function FavoritesProvider({
  userId,
  notify,
  children,
}: {
  userId?: string;
  notify: (s: string) => void;
  children: ReactNode;
}) {
  const [data, setData] = useState(empty),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const busy = useRef(new Set<string>()),
    identity = useRef(userId),
    navigate = useNavigate();
  identity.current = userId;
  useEffect(() => {
    let live = true;
    setData(empty);
    setError("");
    setReady(!userId);
    if (userId)
      api<Favorites>("/account/favorites")
        .then((v) => {
          if (live) {
            setData(v);
            setReady(true);
          }
        })
        .catch((e) => {
          if (live) {
            setError(e.message);
            setReady(true);
          }
        });
    return () => {
      live = false;
    };
  }, [userId]);
  const isSaved = (kind: Kind, id: string) => data[`${kind}Ids`].includes(id);
  async function toggle(kind: Kind, id: string) {
    if (!userId) {
      navigate("/login?next=/me/saved");
      return;
    }
    const key = kind + id,
      owner = userId;
    if (busy.current.has(key)) return;
    busy.current.add(key);
    try {
      const saved = isSaved(kind, id);
      await api(
        `/account/favorites/${kind}/${id}`,
        {},
        saved ? "DELETE" : "PUT",
      );
      const v = await api<Favorites>("/account/favorites");
      if (identity.current === owner) {
        setData(v);
        notify(saved ? "已取消收藏" : "已收藏");
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      busy.current.delete(key);
    }
  }
  return (
    <Context.Provider value={{ data, ready, error, isSaved, toggle }}>
      {children}
    </Context.Provider>
  );
}
export const useFavorites = () => useContext(Context);
export function FavoriteButton({
  kind,
  id,
  label,
}: {
  kind: Kind;
  id: string;
  label?: string;
}) {
  const { isSaved, toggle } = useFavorites(),
    [busy, setBusy] = useState(false),
    saved = isSaved(kind, id);
  return (
    <button
      className={"favorite-button " + (saved ? "saved" : "")}
      aria-label={(saved ? "取消收藏" : "收藏") + (label || "")}
      aria-pressed={saved}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await toggle(kind, id);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Heart size={20} fill={saved ? "currentColor" : "none"} />
    </button>
  );
}
