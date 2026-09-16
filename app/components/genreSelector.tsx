"use client";

import React from "react";

export interface Genre {
  value: string;
  label: string;
}

// ✅ DIUBAH: Daftar genre film standar (TMDB compatible)
export const DEFAULT_GENRES: Genre[] = [
  { value: "action", label: "Action" },
  { value: "adventure", label: "Adventure" },
  { value: "animation", label: "Animation" },
  { value: "comedy", label: "Comedy" },
  { value: "crime", label: "Crime" },
  { value: "documentary", label: "Documentary" },
  { value: "drama", label: "Drama" },
  { value: "family", label: "Family" },
  { value: "fantasy", label: "Fantasy" },
  { value: "horror", label: "Horror" },
  { value: "mystery", label: "Mystery" },
  { value: "romance", label: "Romance" },
  { value: "sci-fi", label: "Sci-Fi" },
  { value: "thriller", label: "Thriller" },
  { value: "war", label: "War" },
  { value: "western", label: "Western" },
];

interface GenreSelectorProps {
  selectedGenres: string[];
  onGenreToggle: (genreValue: string) => void;
  genres?: Genre[];
  maxSelection?: number;
  showCount?: boolean;
  className?: string;
}

export default function GenreSelector({
  selectedGenres = [],
  onGenreToggle,
  genres = DEFAULT_GENRES,
  maxSelection = 3,
  showCount = true,
  className = "",
}: GenreSelectorProps) {
  const isLimitReached = selectedGenres.length >= maxSelection;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {showCount && (
        <div className="flex items-center justify-between text-xs text-[#94a3b8] mb-1">
          <span>Select up to {maxSelection}</span>
          <span className={`font-medium transition-colors ${isLimitReached ? 'text-[#ef4444] font-bold' : 'text-[#cbd5e1]'}`}>
            {selectedGenres.length}/{maxSelection} selected
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {genres.map((genre) => {
          const isSelected = selectedGenres.includes(genre.value);
          const isDisabled = !isSelected && isLimitReached;

          return (
            <button
              key={genre.value}
              type="button"
              onClick={() => onGenreToggle(genre.value)}
              disabled={isDisabled}
              aria-pressed={isSelected}
              className={`
                px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 ease-in-out
                ${isSelected
                  ? "bg-[#ef4444] text-white border-[#ef4444] shadow-sm ring-2 ring-[#ef4444]/20 scale-105"
                  : isDisabled
                    ? "bg-[#1e293b]/50 text-[#64748b] border-[#334155] cursor-not-allowed opacity-50"
                    : "bg-[#0f172a] text-[#cbd5e1] border-[#334155] hover:bg-[#334155] hover:border-[#ef4444]/50 hover:text-white cursor-pointer"
                }
              `}
            >
              {genre.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}