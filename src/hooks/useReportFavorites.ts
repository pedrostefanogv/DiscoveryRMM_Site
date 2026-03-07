import { useState, useEffect } from "react";

const FAVORITES_KEY = "meduza_report_favorites";

interface FavoriteTemplate {
  id: string;
  name: string;
  addedAt: string;
}

export function useReportFavorites() {
  const [favorites, setFavorites] = useState<FavoriteTemplate[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(FAVORITES_KEY);
    if (stored) {
      try {
        setFavorites(JSON.parse(stored));
      } catch (e) {
        console.error("Error loading favorites:", e);
        setFavorites([]);
      }
    }
  }, []);

  const saveFavorites = (newFavorites: FavoriteTemplate[]) => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavorites));
    setFavorites(newFavorites);
  };

  const isFavorite = (templateId: string): boolean => {
    return favorites.some((f) => f.id === templateId);
  };

  const addFavorite = (id: string, name: string) => {
    if (isFavorite(id)) return;

    const newFavorite: FavoriteTemplate = {
      id,
      name,
      addedAt: new Date().toISOString(),
    };

    saveFavorites([...favorites, newFavorite]);
  };

  const removeFavorite = (id: string) => {
    saveFavorites(favorites.filter((f) => f.id !== id));
  };

  const toggleFavorite = (id: string, name: string) => {
    if (isFavorite(id)) {
      removeFavorite(id);
    } else {
      addFavorite(id, name);
    }
  };

  return {
    favorites,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
  };
}
